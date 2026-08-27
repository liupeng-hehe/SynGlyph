"""Lab profile participant + letter LAB columns.

Revision ID: z2b3c4d5e6f7
Revises: y1a2b3c4d5e6
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "z2b3c4d5e6f7"
down_revision: Union[str, None] = "y1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("lab_profile", sa.Column("display_name", sa.String(128), nullable=False, server_default=""))
    op.add_column("lab_profile", sa.Column("slug", sa.String(80), nullable=False, server_default=""))
    op.add_column("lab_profile", sa.Column("palette_history_json", sa.Text(), nullable=False, server_default="[]"))
    op.add_column("lab_profile", sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_lab_profile_slug", "lab_profile", ["slug"])
    op.add_column("lab_letter_annotation", sa.Column("lab_l", sa.Float(), nullable=False, server_default="72"))
    op.add_column("lab_letter_annotation", sa.Column("lab_a", sa.Float(), nullable=False, server_default="8"))
    op.add_column("lab_letter_annotation", sa.Column("lab_b", sa.Float(), nullable=False, server_default="-28"))


def downgrade() -> None:
    op.drop_index("ix_lab_profile_slug", table_name="lab_profile")
    op.drop_column("lab_profile", "last_active_at")
    op.drop_column("lab_profile", "palette_history_json")
    op.drop_column("lab_profile", "slug")
    op.drop_column("lab_profile", "display_name")
    op.drop_column("lab_letter_annotation", "lab_b")
    op.drop_column("lab_letter_annotation", "lab_a")
    op.drop_column("lab_letter_annotation", "lab_l")
