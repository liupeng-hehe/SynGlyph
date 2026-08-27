"""metric_fact, workflow_metrics_snapshot, efficiency_observation (HITL metrics MVP)

Revision ID: v3a4b5c6d7e8
Revises: u1v2w3x4y5z6
Create Date: 2026-04-14

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "v3a4b5c6d7e8"
down_revision: Union[str, None] = "u1v2w3x4y5z6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if not insp.has_table("metric_fact"):
        op.create_table(
            "metric_fact",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("subject_type", sa.String(32), nullable=False),
            sa.Column("subject_id", sa.String(64), nullable=False),
            sa.Column("dataset_version_id", sa.String(36), sa.ForeignKey("ml_dataset_version.id"), nullable=True),
            sa.Column("model_snapshot_id", sa.String(36), sa.ForeignKey("model_snapshot.id"), nullable=True),
            sa.Column("baseline_name", sa.String(128), nullable=False, server_default=""),
            sa.Column("comparison_kind", sa.String(64), nullable=False, server_default="none"),
            sa.Column("metric_key", sa.String(128), nullable=False),
            sa.Column("metric_value", sa.Float(), nullable=False),
            sa.Column("metric_direction", sa.String(8), nullable=False, server_default="up"),
            sa.Column("unit", sa.String(32), nullable=True),
            sa.Column("improvement_pct", sa.Float(), nullable=True),
            sa.Column("source_artifact_uri", sa.Text(), nullable=True),
            sa.Column("schema_version", sa.String(32), nullable=False, server_default="metric_fact_v1"),
            sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_metric_fact_subject_type", "metric_fact", ["subject_type"])
        op.create_index("ix_metric_fact_subject_id", "metric_fact", ["subject_id"])
        op.create_index("ix_metric_fact_dataset_version_id", "metric_fact", ["dataset_version_id"])
        op.create_index("ix_metric_fact_model_snapshot_id", "metric_fact", ["model_snapshot_id"])
        op.create_index("ix_metric_fact_comparison_kind", "metric_fact", ["comparison_kind"])
        op.create_index("ix_metric_fact_metric_key", "metric_fact", ["metric_key"])
        op.create_index(
            "ix_metric_fact_dataset_metric",
            "metric_fact",
            ["dataset_version_id", "metric_key"],
        )
        op.create_unique_constraint(
            "uq_metric_fact_subject_metric",
            "metric_fact",
            ["subject_type", "subject_id", "metric_key", "comparison_kind", "baseline_name"],
        )

    insp = inspect(bind)
    if not insp.has_table("workflow_metrics_snapshot"):
        op.create_table(
            "workflow_metrics_snapshot",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
            sa.Column("window_end", sa.DateTime(timezone=True), nullable=False),
            sa.Column("selected_list_id", sa.String(36), nullable=True),
            sa.Column("model_snapshot_id", sa.String(36), sa.ForeignKey("model_snapshot.id"), nullable=True),
            sa.Column("accept_rate", sa.Float(), nullable=True),
            sa.Column("reject_rate", sa.Float(), nullable=True),
            sa.Column("minor_edit_rate", sa.Float(), nullable=True),
            sa.Column("correction_magnitude_mean", sa.Float(), nullable=True),
            sa.Column("mean_boundary_edits", sa.Float(), nullable=True),
            sa.Column("annotation_time_mean_sec", sa.Float(), nullable=True),
            sa.Column("review_time_mean_sec", sa.Float(), nullable=True),
            sa.Column("queue_hit_rate", sa.Float(), nullable=True),
            sa.Column("al_gain_estimate", sa.Float(), nullable=True),
            sa.Column("throughput_samples_per_hour", sa.Float(), nullable=True),
            sa.Column("n_feedback_rows", sa.Float(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("schema_version", sa.String(32), nullable=False, server_default="workflow_snapshot_v1"),
            sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_workflow_metrics_selected_list", "workflow_metrics_snapshot", ["selected_list_id"])
        op.create_index("ix_workflow_metrics_snapshot_id", "workflow_metrics_snapshot", ["model_snapshot_id"])

    insp = inspect(bind)
    if not insp.has_table("efficiency_observation"):
        op.create_table(
            "efficiency_observation",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("step_name", sa.String(64), nullable=False),
            sa.Column("input_size_json", sa.Text(), nullable=True),
            sa.Column("wall_clock_ms", sa.Float(), nullable=False),
            sa.Column("throughput", sa.Float(), nullable=True),
            sa.Column("baseline_observation_id", sa.String(36), sa.ForeignKey("efficiency_observation.id"), nullable=True),
            sa.Column("improvement_pct", sa.Float(), nullable=True),
            sa.Column("training_run_id", sa.String(36), sa.ForeignKey("training_run.id"), nullable=True),
            sa.Column("git_sha", sa.String(64), nullable=True),
            sa.Column("schema_version", sa.String(32), nullable=False, server_default="efficiency_observation_v1"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_efficiency_obs_step", "efficiency_observation", ["step_name"])
        op.create_index("ix_efficiency_obs_training_run", "efficiency_observation", ["training_run_id"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if insp.has_table("efficiency_observation"):
        op.drop_table("efficiency_observation")
    if insp.has_table("workflow_metrics_snapshot"):
        op.drop_table("workflow_metrics_snapshot")
    if insp.has_table("metric_fact"):
        op.drop_table("metric_fact")
