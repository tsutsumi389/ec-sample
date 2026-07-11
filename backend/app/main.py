import logging
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.database import Base, SessionLocal, engine
from app.routers import (
    addresses,
    admin,
    assistant,
    auth,
    cart,
    categories,
    coupons,
    orders,
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


def _create_tables_with_retry(
    vector_available: bool = True, max_attempts: int = 10, delay_seconds: float = 1.5
) -> None:
    """Create tables, retrying briefly in case the DB container is still starting up.

    vector 拡張が使えない環境では product_embeddings（Vector カラムを持つ）を作成対象から
    外す。そのまま create_all すると vector 型未定義で ProgrammingError（OperationalError
    ではない）が送出され起動が落ちてしまうため、対象テーブルを絞って起動継続させる。
    """
    tables = None
    if not vector_available:
        tables = [
            table
            for table in Base.metadata.sorted_tables
            if table.name != "product_embeddings"
        ]
    for attempt in range(1, max_attempts + 1):
        try:
            Base.metadata.create_all(bind=engine, tables=tables)
            return
        except OperationalError:
            if attempt == max_attempts:
                raise
            time.sleep(delay_seconds)


def _ensure_pgvector_extension() -> bool:
    """pgvector 拡張を有効化する（create_all の前に必要）。

    pgvector が入っていない DB でも起動が落ちないよう、失敗時は警告ログにして続行する。
    その場合 product_embeddings テーブルは作成できずレコメンドはフォールバック動作になる。
    戻り値: vector 拡張が利用可能なら True、そうでなければ False。
    """
    for attempt in range(1, 11):
        try:
            with engine.connect() as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                conn.commit()
            return True
        except OperationalError:
            # DB 起動待ち。少し待って再試行する。
            if attempt == 10:
                logger.warning("DB 接続待ちで pgvector 拡張の有効化を諦めました")
                return False
            time.sleep(1.5)
        except Exception as exc:  # noqa: BLE001 - 拡張が無い等でも起動は止めない
            logger.warning(
                "pgvector 拡張を有効化できませんでした（レコメンドはフォールバック動作になります）: %s",
                exc,
            )
            return False
    return False


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
    vector_available = _ensure_pgvector_extension()
    _create_tables_with_retry(vector_available)
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
app.include_router(categories.router, prefix="/api")
app.include_router(cart.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(wishlist.router, prefix="/api")
app.include_router(addresses.router, prefix="/api")
app.include_router(coupons.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(recommendations.router, prefix="/api")
app.include_router(assistant.router, prefix="/api")
