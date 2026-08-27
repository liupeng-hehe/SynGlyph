"""model_review_feedback for text-reveal evaluation records

Revision ID: i1j2k3l4m5n6
Revises: h3i4j5k6l7m8
Create Date: 2026-04-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "i1j2k3l4m5n6"
down_revision: Union[str, None] = "h3i4j5k6l7m8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if insp.has_table("model_review_feedback"):
        return
    op.create_table(
        "model_review_feedback",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("checkpoint_id", sa.String(512), nullable=False, server_default=""),
        sa.Column("full_text", sa.Text(), nullable=False),
        sa.Column("record_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_model_review_feedback_checkpoint_id", "model_review_feedback", ["checkpoint_id"])
    op.create_index(
        "ix_model_review_feedback_checkpoint_text",
        "model_review_feedback",
        ["checkpoint_id", "full_text"],
    )


def downgrade() -> None:
    op.drop_index("ix_model_review_feedback_checkpoint_text", table_name="model_review_feedback")
    op.drop_index("ix_model_review_feedback_checkpoint_id", table_name="model_review_feedback")
    op.drop_table("model_review_feedback")
