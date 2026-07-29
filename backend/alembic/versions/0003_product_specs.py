"""product specs

商品の仕様（サイズ・重量・素材など）を1行1項目で持つ product_specs を作る。
description のフリーテキストに溶けていた「モノの事実」を構造化するためのテーブルで、
商品ページの「仕様」欄と埋め込み原文（services/embedding.py の build_product_text）が
この行を読む。

ここは器を作るだけで中身は入れない。既にシード済みの DB への流し込みは 0004 が行う
（seed_data() は users テーブルが空のときしか走らないため、既存 DB はここだけでは空のまま）。

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-29 22:11:20.694784+00:00

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('product_specs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('product_id', sa.Integer(), nullable=False),
    sa.Column('label', sa.String(), nullable=False),
    sa.Column('value', sa.String(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['product_id'], ['products.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_product_specs_product_id'), 'product_specs', ['product_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_product_specs_product_id'), table_name='product_specs')
    op.drop_table('product_specs')
