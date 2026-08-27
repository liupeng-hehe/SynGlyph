"""Add persisted active-learning queue and prediction history tables.

Revision ID: q1r2s3t4u5v6
Revises: p1a2b3c4d5e6
Create Date: 2026-04-09
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "q1r2s3t4u5v6"
down_revision: Union[str, None] = "p1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if not insp.has_table("al_queue_snapshot"):
        op.create_table(
            "al_queue_snapshot",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("refresh_batch_id", sa.String(36), nullable=False),
            sa.Column("stimulus_id", sa.String(36), sa.ForeignKey("stimulus.id"), nullable=False),
            sa.Column("text", sa.Text(), nullable=False),
            sa.Column("rank", sa.Integer(), nullable=False),
            sa.Column("score", sa.Float(), nullable=False),
            sa.Column("boundary_uncertainty", sa.Float(), nullable=False),
            sa.Column("segment_attribute_uncertainty", sa.Float(), nullable=False),
            sa.Column("segment_novelty", sa.Float(), nullable=False),
            sa.Column("coverage_gain", sa.Float(), nullable=False),
            sa.Column("instability", sa.Float(), nullable=False),
            sa.Column("score_raw_json", sa.Text(), nullable=False),
            sa.Column("score_norm_json", sa.Text(), nullable=False),
            sa.Column("model_snapshot_id", sa.String(36), sa.ForeignKey("model_snapshot.id"), nullable=True),
            sa.Column("scoring_stage", sa.String(64), nullable=False),
            sa.Column("snapshot_time", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_al_queue_snapshot_refresh_batch_id", "al_queue_snapshot", ["refresh_batch_id"])
        op.create_index("ix_al_queue_snapshot_stimulus_id", "al_queue_snapshot", ["stimulus_id"])
        op.create_index("ix_al_queue_snapshot_rank", "al_queue_snapshot", ["rank"])
        op.create_index("ix_al_queue_snapshot_model_snapshot_id", "al_queue_snapshot", ["model_snapshot_id"])
        op.create_index("ix_al_queue_snapshot_scoring_stage", "al_queue_snapshot", ["scoring_stage"])
        op.create_index("ix_al_queue_snapshot_snapshot_time", "al_queue_snapshot", ["snapshot_time"])
        op.create_index(
            "ix_al_queue_snapshot_batch_rank", "al_queue_snapshot", ["refresh_batch_id", "rank"]
        )
        op.create_index(
            "ix_al_queue_snapshot_snapshot_time_rank",
            "al_queue_snapshot",
            ["snapshot_time", "rank"],
        )

    insp = inspect(bind)
    if not insp.has_table("al_prediction_history"):
        op.create_table(
            "al_prediction_history",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("refresh_batch_id", sa.String(36), nullable=False),
            sa.Column("stimulus_id", sa.String(36), sa.ForeignKey("stimulus.id"), nullable=False),
            sa.Column("model_snapshot_id", sa.String(36), sa.ForeignKey("model_snapshot.id"), nullable=True),
            sa.Column("scoring_stage", sa.String(64), nullable=False),
            sa.Column("snapshot_time", sa.DateTime(timezone=True), nullable=False),
            sa.Column("boundary_uncertainty", sa.Float(), nullable=False),
            sa.Column("segment_attribute_uncertainty", sa.Float(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index(
            "ix_al_prediction_history_refresh_batch_id", "al_prediction_history", ["refresh_batch_id"]
        )
        op.create_index("ix_al_prediction_history_stimulus_id", "al_prediction_history", ["stimulus_id"])
        op.create_index(
            "ix_al_prediction_history_model_snapshot_id",
            "al_prediction_history",
            ["model_snapshot_id"],
        )
        op.create_index(
            "ix_al_prediction_history_scoring_stage", "al_prediction_history", ["scoring_stage"]
        )
        op.create_index("ix_al_prediction_history_snapshot_time", "al_prediction_history", ["snapshot_time"])
        op.create_index(
            "ix_al_prediction_history_stimulus_time",
            "al_prediction_history",
            ["stimulus_id", "snapshot_time"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if insp.has_table("al_prediction_history"):
        op.drop_table("al_prediction_history")
    insp = inspect(bind)
    if insp.has_table("al_queue_snapshot"):
        op.drop_table("al_queue_snapshot")
