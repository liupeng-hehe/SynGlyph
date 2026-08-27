"""add glyph_graph_record for lowercase primitive-graph exports

Revision ID: b2c3d4e5f6a
Revises: 9c4e5f7g8h9
Create Date: 2026-03-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision: str = "b2c3d4e5f6a"
down_revision: Union[str, None] = "9c4e5f7g8h9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if inspect(bind).has_table("glyph_graph_record"):
        return
    op.create_table(
        "glyph_graph_record",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("char", sa.String(1), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="ready"),
        sa.Column("image_width", sa.Integer(), nullable=True),
        sa.Column("image_height", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_glyph_graph_record_char", "glyph_graph_record", ["char"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_glyph_graph_record_char", table_name="glyph_graph_record")
    op.drop_table("glyph_graph_record")
