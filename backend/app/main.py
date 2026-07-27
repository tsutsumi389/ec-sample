import logging
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError

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

# アプリ側のロガー（埋め込み同期・レコメンド生成の状況）を stdout に出す。
# uvicorn は自前の named ロガーのみ設定しルートには handler を付けないため、
# ここで INFO レベルの handler を用意しないとアプリの info/warning が握り潰される。
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)


# backend/ 直下（alembic.ini と alembic/ がある場所）。
BACKEND_DIR = Path(__file__).resolve().parent.parent


def _wait_for_db(max_attempts: int = 10, delay_seconds: float = 1.5) -> None:
    """DB コンテナの起動待ち。接続できるまで短くリトライする。"""
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

    拡張の作成そのものはマイグレーション 0002 の仕事なので、ここでは判定だけする。
    pgvector が無い DB でも起動が落ちないようにするための分岐に使う。
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

    script_location を絶対パスで上書きするのは、alembic.ini の相対パスが
    カレントディレクトリ基準で解決されるため（uvicorn の起動場所に依存させない）。
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
    if vector_available:
        command.upgrade(cfg, "head")
        return
    try:
        command.upgrade(cfg, "head")
    except Exception as exc:  # noqa: BLE001 - pgvector 不在でも起動は止めない
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
    yield


app = FastAPI(title="EC Sample API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
