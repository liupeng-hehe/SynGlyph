"""Lab profile: record KB vocab version used for coverage words.

Revision ID: a1b2c3d4e5f7
Revises: z2b3c4d5e6f7
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, None] = "z2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lab_profile",
        sa.Column("coverage_kb_vocab_version_id", sa.String(36), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lab_profile", "coverage_kb_vocab_version_id")
