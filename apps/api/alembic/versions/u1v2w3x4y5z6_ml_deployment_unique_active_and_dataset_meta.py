"""ml_deployment: at most one active row per env/product/task/alias; dataset import metadata

Revision ID: u1v2w3x4y5z6
Revises: s1t2u3v4w5x6
Create Date: 2026-04-13

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

from app.services.ml_deployment_dedupe import dedupe_active_ml_deployments

revision: str = "u1v2w3x4y5z6"
down_revision: Union[str, None] = "s1t2u3v4w5x6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEX_NAME = "uq_ml_deployment_one_active_per_alias"


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if insp.has_table("ml_deployment"):
        dedupe_active_ml_deployments(bind)
        dialect = bind.dialect.name
        existing = insp.get_indexes("ml_deployment")
        names = {ix["name"] for ix in existing if ix.get("name")}
        if _INDEX_NAME not in names:
            if dialect == "postgresql":
                op.execute(
                    sa.text(
                        f"CREATE UNIQUE INDEX {_INDEX_NAME} ON ml_deployment "
                        "(environment, product_line, task_name, alias) WHERE is_active IS TRUE"
                    )
                )
            else:
                # SQLite and others: boolean stored as 0/1
                op.execute(
                    sa.text(
                        f"CREATE UNIQUE INDEX {_INDEX_NAME} ON ml_deployment "
                        "(environment, product_line, task_name, alias) WHERE is_active = 1"
                    )
                )

    if insp.has_table("dataset"):
        cols = {c["name"] for c in insp.get_columns("dataset")}
        if "is_canonical_root" not in cols:
            op.add_column(
                "dataset",
                sa.Column("is_canonical_root", sa.Boolean(), nullable=False, server_default="0"),
            )
        if "import_source" not in cols:
            op.add_column("dataset", sa.Column("import_source", sa.String(64), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if insp.has_table("ml_deployment"):
        existing = insp.get_indexes("ml_deployment")
        names = {ix["name"] for ix in existing if ix.get("name")}
        if _INDEX_NAME in names:
            op.drop_index(_INDEX_NAME, table_name="ml_deployment")

    if insp.has_table("dataset"):
        cols = {c["name"] for c in insp.get_columns("dataset")}
        if "import_source" in cols:
            op.drop_column("dataset", "import_source")
        if "is_canonical_root" in cols:
            op.drop_column("dataset", "is_canonical_root")
