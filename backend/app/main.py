import logging
import threading
import time
from contextlib import asynccontextmanager, nullcontext
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError
from starlette.routing import Route

from app.config import FRONTEND_ORIGIN
from app.database import SessionLocal, engine
from app.routers import (
    addresses,
    admin,
    admin_experiments,
    analytics,
    assistant,
    auth,
    cart,
    categories,
    coupons,
    experiments,
    home,
    orders,
    product_qa,
    products,
    recommendations,
    wishlist,
)
from app.seed import seed_data

# uvicorn は自前の named ロガーのみ設定しルートには handler を付けないため、
# ここで INFO レベルの handler を用意しないとアプリの info/warning が握り潰される。
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    # force=True は必須。MCP SDK の MCPServer() は生成時に root ロガーへ handler を 1 本付け、
    # basicConfig は既に handler があると **黙って何もしない**。外すとこの format が捨てられ、
    # 以後アプリのログから時刻もレベルもロガー名も消える（import 順の入れ替えでは避けられない。
    # isort / ruff が並べ直した瞬間に再発する）。
    force=True,
)

logger = logging.getLogger(__name__)

# **この import は失敗しても店を止めない。** 素の import にすると、SDK の API 改称・依存の
# 入れ忘れ（再ビルド前の `make restart` など）だけで商品一覧からチェックアウトまで全部止まる。
# 例外は握るが黙らせない——logger.exception で起動ログにスタックトレースを残す。
try:
    from app.mcp_server.server import mcp, mcp_asgi_app
except Exception:  # noqa: BLE001 - MCP が読めなくても REST は生かす
    logger.exception("MCP サーバーを読み込めませんでした。/mcp は無効のまま起動します")
    mcp = None
    mcp_asgi_app = None


# backend/ 直下（alembic.ini と alembic/ がある場所）。
BACKEND_DIR = Path(__file__).resolve().parent.parent


def _wait_for_db(max_attempts: int = 10, delay_seconds: float = 1.5) -> None:
    for attempt in range(1, max_attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except OperationalError:
            if attempt == max_attempts:
                raise
            time.sleep(delay_seconds)


def _pgvector_available() -> bool:
    """pgvector 拡張が使える DB か（導入済み、または導入可能）を調べる。

    拡張の作成そのものはマイグレーション 0002 の仕事で、ここでは判定だけする。
    """
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT 1 FROM pg_available_extensions WHERE name = 'vector'")
            ).first()
        return row is not None
    except Exception as exc:  # noqa: BLE001 - 判定できない場合も起動は止めない
        logger.warning("pgvector 拡張の有無を判定できませんでした: %s", exc)
        return False


def _alembic_config() -> Config:
    """アプリから alembic を叩くための設定。

    script_location を絶対パスで上書きするのは、alembic.ini の相対パスがカレント
    ディレクトリ基準で解決されるため（uvicorn の起動場所に依存させない）。
    configure_logger=False は env.py 側で参照し、fileConfig によるロガー無効化を防ぐ。
    """
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.attributes["configure_logger"] = False
    return cfg


def _stamp_legacy_schema(cfg: Config) -> None:
    """Alembic 導入前に create_all で作られた DB に、対応する版数を刻む。

    そのまま upgrade すると「テーブルが既に存在する」で 0001 が落ちるため、
    既存スキーマ = 0001（+ pgvector があれば 0002）とみなして stamp する。
    まっさらな DB では何もしない（通常どおり 0001 から流す）。
    """
    inspector = inspect(engine)
    if inspector.has_table("alembic_version"):
        return
    if not inspector.has_table("users"):
        return
    revision = "0002" if inspector.has_table("product_embeddings") else "0001"
    command.stamp(cfg, revision)
    logger.info(
        "Alembic 導入前のスキーマを検出したため、リビジョン %s として記録しました", revision
    )


def _run_migrations(vector_available: bool) -> None:
    """未適用のマイグレーションを適用する（alembic upgrade head 相当）。

    pgvector が無い DB では 0002（product_embeddings）が必ず失敗するが、
    env.py の transaction_per_migration=True により 0001 まではコミット済みなので、
    レコメンドをフォールバック動作にしたままアプリは起動できる。
    """
    cfg = _alembic_config()
    _stamp_legacy_schema(cfg)
    try:
        command.upgrade(cfg, "head")
    except Exception as exc:  # noqa: BLE001 - pgvector 不在でも起動は止めない
        # pgvector があるのに失敗したのは想定外なので、握らず起動を止める。
        if vector_available:
            raise
        logger.warning(
            "pgvector が無いため product_embeddings を作成できませんでした"
            "（レコメンドはフォールバック動作になります）: %s",
            exc,
        )


def _startup_embedding_sync() -> None:
    """起動後にバックグラウンドで埋め込みを差分同期する。

    Ollama 未起動/未 pull でも embedding 側で握って警告ログを出すだけなので、
    起動をブロックせず・失敗してもアプリは正常起動する。
    """
    # import をここに置き、Ollama 依存の読み込み失敗が起動全体を落とさないようにする。
    try:
        from app.services import embedding

        db = SessionLocal()
        try:
            healthy = embedding.check_ollama_health()
            if healthy:
                logger.info("Ollama モデル確認 OK。埋め込みの差分同期を開始します")
            else:
                logger.warning(
                    "Ollama のモデルが未確認です。埋め込み同期はスキップ相当になります"
                    "（ホストの Ollama が起動しているか、対象モデルが pull 済みか確認してください）"
                )
            embedding.sync_embeddings(db)
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001 - 同期失敗は起動に影響させない
        logger.warning("起動時の埋め込み同期に失敗しました（無視して継続）: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _wait_for_db()
    _run_migrations(_pgvector_available())
    db = SessionLocal()
    try:
        seed_data(db)
    finally:
        db.close()
    # 埋め込み同期は起動をブロックしないよう別スレッドで走らせる。
    threading.Thread(target=_startup_embedding_sync, daemon=True).start()

    # MCP のストリーミング HTTP は、リクエストを捌くタスクグループをこの async CM の中で開く。
    # /mcp は Route として直接ぶら下げており子 ASGI アプリの lifespan は誰も呼ばないため、
    # ここで明示的に起動する（忘れると最初のリクエストが「Task group is not initialized」で
    # 落ちる。stateless でも同じ）。分岐は式に閉じること——ここで early return すると、以後
    # lifespan に足した起動処理が「MCP が落ちている環境でだけ走らない」無言の欠落になる。
    async with (mcp.session_manager.run() if mcp is not None else nullcontext()):
        yield


app = FastAPI(title="EC Sample API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router, prefix="/api")
app.include_router(products.router, prefix="/api")
app.include_router(product_qa.router, prefix="/api")
app.include_router(categories.router, prefix="/api")
app.include_router(cart.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(wishlist.router, prefix="/api")
app.include_router(addresses.router, prefix="/api")
app.include_router(coupons.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(admin_experiments.router, prefix="/api")
app.include_router(recommendations.router, prefix="/api")
app.include_router(assistant.router, prefix="/api")
app.include_router(home.router, prefix="/api")
app.include_router(experiments.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")

# REST ではないので include_router を使わず、厳密パスの Route として直接足す
# （OpenAPI スキーマにも載らない＝「/api 配下は REST だけ」という整理を保つ）。
# mcp.streamable_http_app() が返す Starlette アプリを mount してはいけない。あれは内側で
# もう一度 "/mcp" に Route を張るので実効パスが /mcp/mcp になる。内側を "/" にして mount
# すると今度は POST /mcp が 307 で /mcp/ へ飛び、リダイレクトを追わないクライアントが壊れる。
# **ネットワーク的なアクセス制御は掛かっていない**（理由は server.py）。認証は各ツールの
# require_user（= 既存の JWT）が担い、露出面は既存の /api と同等になる。
if mcp_asgi_app is not None:
    app.router.routes.append(Route("/mcp", endpoint=mcp_asgi_app))
