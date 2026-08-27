"""Kb vocab snapshot metadata (source_kind, import config/summary).

Revision ID: x2a3b4c5d6e7
Revises: w1x2y3z4a5b6
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "x2a3b4c5d6e7"
down_revision: Union[str, None] = "w1x2y3z4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_column_if_missing(table: str, column: str, ddl) -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table(table):
        return
    cols = {c["name"] for c in insp.get_columns(table)}
    if column not in cols:
        op.add_column(table, ddl)


def upgrade() -> None:
    _add_column_if_missing(
        "kb_vocab_version",
        "source_kind",
        sa.Column("source_kind", sa.String(64), nullable=True),
    )
    _add_column_if_missing(
        "kb_vocab_version",
        "source_name",
        sa.Column("source_name", sa.String(256), nullable=True),
    )
    _add_column_if_missing(
        "kb_vocab_version",
        "source_ref",
        sa.Column("source_ref", sa.String(512), nullable=True),
    )
    _add_column_if_missing(
        "kb_vocab_version",
        "import_config_json",
        sa.Column("import_config_json", sa.Text(), nullable=True),
    )
    _add_column_if_missing(
        "kb_vocab_version",
        "import_summary_json",
        sa.Column("import_summary_json", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table("kb_vocab_version"):
        return
    cols = {c["name"] for c in insp.get_columns("kb_vocab_version")}
    for col in (
        "import_summary_json",
        "import_config_json",
        "source_ref",
        "source_name",
        "source_kind",
    ):
        if col in cols:
            op.drop_column("kb_vocab_version", col)
