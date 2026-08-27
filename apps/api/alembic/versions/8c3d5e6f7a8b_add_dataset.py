"""add dataset table and stimulus.dataset_id

Revision ID: 8c3d5e6f7a8b
Revises: 7b2c3d4e5f6a
Create Date: 2026-03-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision: str = "8c3d5e6f7a8b"
down_revision: Union[str, None] = "7b2c3d4e5f6a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table("dataset"):
        op.create_table(
            "dataset",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(256), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if insp.has_table("stimulus"):
        insp = inspect(bind)
        stim_cols = {c["name"] for c in insp.get_columns("stimulus")}
        idx_names = {i["name"] for i in insp.get_indexes("stimulus")}
        if "dataset_id" not in stim_cols:
            op.add_column("stimulus", sa.Column("dataset_id", sa.String(36), nullable=True))
        if "ix_stimulus_dataset_id" not in idx_names:
            op.create_index("ix_stimulus_dataset_id", "stimulus", ["dataset_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_stimulus_dataset_id", table_name="stimulus")
    op.drop_column("stimulus", "dataset_id")
    op.drop_table("dataset")
