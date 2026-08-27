"""Lab Build Your Own tables (lab_profile, annotations, training runs).

Revision ID: y1a2b3c4d5e6
Revises: x2a3b4c5d6e7
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "y1a2b3c4d5e6"
down_revision: Union[str, None] = "x2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lab_profile",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_key", sa.String(128), nullable=False, index=True),
        sa.Column("mode", sa.String(64), nullable=False),
        sa.Column("phase", sa.String(32), nullable=False),
        sa.Column("training_status", sa.String(32), nullable=False),
        sa.Column("interruption_state", sa.String(32), nullable=False),
        sa.Column("satisfaction_state", sa.String(32), nullable=False),
        sa.Column("manifest_version", sa.Integer(), nullable=False),
        sa.Column("seed", sa.Integer(), nullable=False),
        sa.Column("letters_order_json", sa.Text(), nullable=False),
        sa.Column("coverage_words_json", sa.Text(), nullable=False),
        sa.Column("checks_json", sa.Text(), nullable=False),
        sa.Column("active_checkpoint_uri", sa.String(2048), nullable=True),
        sa.Column("render_seq", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "lab_letter_annotation",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("profile_id", sa.String(36), sa.ForeignKey("lab_profile.id", ondelete="CASCADE"), nullable=False),
        sa.Column("char", sa.String(8), nullable=False),
        sa.Column("color_hex", sa.String(16), nullable=False),
        sa.Column("locked", sa.Integer(), nullable=False),
        sa.Column("annotated", sa.Integer(), nullable=False),
        sa.Column("revision_count", sa.Integer(), nullable=False),
        sa.Column("stability", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_lab_letter_profile", "lab_letter_annotation", ["profile_id"])
    op.create_table(
        "lab_coverage_word",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("profile_id", sa.String(36), sa.ForeignKey("lab_profile.id", ondelete="CASCADE"), nullable=False),
        sa.Column("word", sa.String(128), nullable=False),
        sa.Column("completed", sa.Integer(), nullable=False),
        sa.Column("accepted_prediction", sa.Integer(), nullable=False),
        sa.Column("covered_patterns_json", sa.Text(), nullable=False),
        sa.Column("manual_adjustments_json", sa.Text(), nullable=True),
        sa.Column("revision_count", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_lab_coverage_profile", "lab_coverage_word", ["profile_id"])
    op.create_table(
        "lab_evaluation_check",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("profile_id", sa.String(36), sa.ForeignKey("lab_profile.id", ondelete="CASCADE"), nullable=False),
        sa.Column("check_key", sa.String(32), nullable=False),
        sa.Column("word", sa.String(128), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("feedback_text", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_lab_eval_profile", "lab_evaluation_check", ["profile_id"])
    op.create_table(
        "lab_training_run",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("profile_id", sa.String(36), sa.ForeignKey("lab_profile.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("triggered_by", sa.String(64), nullable=False),
        sa.Column("train_sample_count", sa.Integer(), nullable=False),
        sa.Column("checkpoint_uri", sa.String(2048), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_lab_train_profile", "lab_training_run", ["profile_id"])


def downgrade() -> None:
    op.drop_table("lab_training_run")
    op.drop_table("lab_evaluation_check")
    op.drop_table("lab_coverage_word")
    op.drop_table("lab_letter_annotation")
    op.drop_table("lab_profile")
