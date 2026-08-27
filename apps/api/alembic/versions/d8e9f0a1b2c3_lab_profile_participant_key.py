"""Lab profile: participant key (name + client IP) for resume-by-name.

Revision ID: d8e9f0a1b2c3
Revises: a1b2c3d4e5f7
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d8e9f0a1b2c3"
down_revision: Union[str, None] = "a1b2c3d4e5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lab_profile",
        sa.Column("lab_participant_key", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "uq_lab_profile_lab_participant_key",
        "lab_profile",
        ["lab_participant_key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_lab_profile_lab_participant_key", table_name="lab_profile")
    op.drop_column("lab_profile", "lab_participant_key")
