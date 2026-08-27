"""add dataset.owner for annotator-scoped datasets

Revision ID: 9c4e5f7g8h9
Revises: 8c3d5e6f7a8b
Create Date: 2026-03-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision: str = "9c4e5f7g8h9"
down_revision: Union[str, None] = "8c3d5e6f7a8b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table("dataset"):
        return
    cols = {c["name"] for c in insp.get_columns("dataset")}
    if "owner" not in cols:
        op.add_column("dataset", sa.Column("owner", sa.String(64), nullable=True))
    insp = inspect(bind)
    idx_names = {i["name"] for i in insp.get_indexes("dataset")}
    if "ix_dataset_owner" not in idx_names:
        op.create_index("ix_dataset_owner", "dataset", ["owner"], unique=False)
    # Migrate existing datasets to owner='admin' for backward compatibility
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE dataset SET owner = 'admin' WHERE owner IS NULL"))


def downgrade() -> None:
    op.drop_index("ix_dataset_owner", table_name="dataset")
    op.drop_column("dataset", "owner")
