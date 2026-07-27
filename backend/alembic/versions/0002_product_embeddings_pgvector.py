"""product embeddings (pgvector)

pgvector 拡張と、それに依存する product_embeddings を作る。0001 と分けてあるのは、
拡張が入っていない DB でもここ以外は適用できてアプリが起動し続けられるようにするため
（env.py の transaction_per_migration=True が「0001 まではコミット済み」を保証する）。

embedding の次元 768 は app/config.py の EMBED_DIM と一致していること。埋め込みモデルを
次元の違うものに差し替えるときは、この値を書き換えるのではなく新しいリビジョンを足す。

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-27 22:14:30.461753+00:00

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision: str = '0002'
down_revision: str | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')
    op.create_table('product_embeddings',
    sa.Column('product_id', sa.Integer(), nullable=False),
    sa.Column('embedding', Vector(dim=768), nullable=False),
    sa.Column('semantic_id', sa.String(), nullable=True),
    sa.Column('codebook_generation', sa.Integer(), nullable=True),
    sa.Column('source_hash', sa.String(), nullable=False),
    sa.Column('embed_model', sa.String(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['product_id'], ['products.id'], ),
    sa.PrimaryKeyConstraint('product_id')
    )
    op.create_index(op.f('ix_product_embeddings_semantic_id'), 'product_embeddings', ['semantic_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_product_embeddings_semantic_id'), table_name='product_embeddings')
    op.drop_table('product_embeddings')
    # 拡張は落とさない。同じ DB を使う他のテーブル・拡張利用に影響し得るため。
