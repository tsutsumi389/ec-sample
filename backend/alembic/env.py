"""Alembic の実行環境。

接続先とモデル定義はアプリ本体から取り込む（alembic.ini には URL を書かない）。
`app.database.DATABASE_URL` は環境変数 DATABASE_URL を読むため、別 DB に対して
流したいときは `docker compose exec -e DATABASE_URL=... backend alembic ...` で足りる。
"""

from logging.config import fileConfig

from alembic import context
from pgvector.sqlalchemy import Vector
from sqlalchemy import create_engine, pool

# app.models を import しないと Base.metadata が空になり、autogenerate が
# 「全テーブルを削除する」マイグレーションを吐く。
import app.models  # noqa: F401
from app.database import DATABASE_URL, Base

config = context.config

# alembic.ini のロギング設定は CLI から叩いたときだけ適用する。アプリ起動時
# （main.py から command.upgrade を呼ぶ経路）で読み込むと fileConfig が既存の
# ロガーを無効化し、アプリ側の INFO ログが以後すべて出なくなる。
if config.attributes.get("configure_logger", True) and config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _render_item(type_, obj, autogen_context) -> str | bool:
    """pgvector の Vector 型を import 付きで出力する。

    既定の autogenerate は未知の型を `pgvector.sqlalchemy.vector.Vector(dim=768)` と
    書き出すが import 文は足さないため、生成されたファイルがそのままでは動かない。
    """
    if type_ == "type" and isinstance(obj, Vector):
        autogen_context.imports.add("from pgvector.sqlalchemy import Vector")
        return f"Vector(dim={obj.dim})"
    return False


def run_migrations_offline() -> None:
    """SQL を標準出力に吐くだけのモード（--sql）。"""
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_item=_render_item,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(DATABASE_URL, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # リビジョンごとにコミットする。既定は全リビジョンを1トランザクションに
            # 包むため、pgvector が無い環境で product_embeddings の追加に失敗すると
            # それ以前の適用まで巻き戻ってしまう（アプリが起動できなくなる）。
            transaction_per_migration=True,
            render_item=_render_item,
            # カラム型の変更も差分として検出する（既定では無効）。
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
