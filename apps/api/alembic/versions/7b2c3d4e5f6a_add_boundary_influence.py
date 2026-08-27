"""add boundary_influence to segmentation

Revision ID: 7b2c3d4e5f6a
Revises: 519ad1977ed8
Create Date: 2026-03-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision: str = "7b2c3d4e5f6a"
down_revision: Union[str, None] = "519ad1977ed8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table("segmentation"):
        return
    cols = {c["name"] for c in insp.get_columns("segmentation")}
    if "boundary_influence_json" not in cols:
        op.add_column("segmentation", sa.Column("boundary_influence_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("segmentation", "boundary_influence_json")
