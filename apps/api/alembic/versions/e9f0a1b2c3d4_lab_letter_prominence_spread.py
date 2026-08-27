"""lab_letter_annotation: prominence + spread (English SegmentInput parity)

Revision ID: e9f0a1b2c3d4
Revises: d8e9f0a1b2c3
Create Date: 2026-04-18

"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "e9f0a1b2c3d4"
down_revision: Union[str, None] = "d8e9f0a1b2c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lab_letter_annotation",
        sa.Column("prominence", sa.Float(), nullable=False, server_default="0.62"),
    )
    op.add_column(
        "lab_letter_annotation",
        sa.Column("spread", sa.Float(), nullable=False, server_default="0.38"),
    )
    op.alter_column("lab_letter_annotation", "prominence", server_default=None)
    op.alter_column("lab_letter_annotation", "spread", server_default=None)


def downgrade() -> None:
    op.drop_column("lab_letter_annotation", "spread")
    op.drop_column("lab_letter_annotation", "prominence")
