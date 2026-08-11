import os
from collections.abc import Generator, Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://ec:ecpass@db:5432/ecdb"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


@contextmanager
def session_scope() -> Iterator[Session]:
    """リクエスト以外（起動処理・バックグラウンド・MCP ツール）でセッションを開く。

    セッションの開け閉めをここ 1 か所に置く。`SessionLocal()` + try/finally を呼び出し側で
    書き写すと、プール設定や commit/rollback の規約を変える日に直す場所が散る。
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db() -> Generator[Session, None, None]:
    """FastAPI の依存性。開け閉ての形が session_scope と割れないよう、そちらに載せる。"""
    with session_scope() as db:
        yield db
