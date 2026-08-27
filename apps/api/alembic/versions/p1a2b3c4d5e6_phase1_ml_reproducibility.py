"""Phase 1: ml_dataset_version, ml_evaluation_run, ml_deployment; extend snapshot/run/feedback

Revision ID: p1a2b3c4d5e6
Revises: i1j2k3l4m5n6
Create Date: 2026-04-07

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "p1a2b3c4d5e6"
down_revision: Union[str, None] = "i1j2k3l4m5n6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if not insp.has_table("ml_dataset_version"):
        op.create_table(
            "ml_dataset_version",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("product_line", sa.String(64), nullable=False),
            sa.Column("task_name", sa.String(128), nullable=False),
            sa.Column("source_mode", sa.String(32), nullable=False, server_default="stimulus"),
            sa.Column("schema_version", sa.String(128), nullable=False),
            sa.Column("split_seed", sa.Integer(), nullable=False),
            sa.Column("split_strategy", sa.String(128), nullable=False),
            sa.Column("source_cutoff_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("example_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("train_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("val_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("test_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("dataset_hash", sa.String(128), nullable=False),
            sa.Column("manifest_uri", sa.String(4096), nullable=False),
            sa.Column("stats_json", sa.Text(), nullable=True),
            sa.Column("git_sha", sa.String(64), nullable=True),
            sa.Column("created_by_run_id", sa.String(36), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_ml_dataset_version_product_line", "ml_dataset_version", ["product_line"])
        op.create_index("ix_ml_dataset_version_task_name", "ml_dataset_version", ["task_name"])
        op.create_index("ix_ml_dataset_version_source_mode", "ml_dataset_version", ["source_mode"])
        op.create_index("ix_ml_dataset_version_dataset_hash", "ml_dataset_version", ["dataset_hash"])
        op.create_index("ix_ml_dataset_version_created_by_run_id", "ml_dataset_version", ["created_by_run_id"])
        op.create_index(
            "ix_ml_dataset_version_product_task",
            "ml_dataset_version",
            ["product_line", "task_name"],
        )

    if not insp.has_table("ml_evaluation_run"):
        op.create_table(
            "ml_evaluation_run",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("product_line", sa.String(64), nullable=False),
            sa.Column("task_name", sa.String(128), nullable=False),
            sa.Column("dataset_version_id", sa.String(36), sa.ForeignKey("ml_dataset_version.id"), nullable=False),
            sa.Column("model_snapshot_id", sa.String(36), sa.ForeignKey("model_snapshot.id"), nullable=False),
            sa.Column("split_name", sa.String(32), nullable=False),
            sa.Column("metrics_json", sa.Text(), nullable=False),
            sa.Column("eval_config_json", sa.Text(), nullable=True),
            sa.Column("artifact_uri", sa.String(4096), nullable=True),
            sa.Column("git_sha", sa.String(64), nullable=True),
            sa.Column("status", sa.String(32), nullable=False, server_default="completed"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_ml_evaluation_run_product_line", "ml_evaluation_run", ["product_line"])
        op.create_index("ix_ml_evaluation_run_task_name", "ml_evaluation_run", ["task_name"])
        op.create_index("ix_ml_evaluation_run_dataset_version_id", "ml_evaluation_run", ["dataset_version_id"])
        op.create_index("ix_ml_evaluation_run_model_snapshot_id", "ml_evaluation_run", ["model_snapshot_id"])
        op.create_index(
            "ix_ml_eval_snapshot_dataset",
            "ml_evaluation_run",
            ["model_snapshot_id", "dataset_version_id"],
        )

    insp = inspect(bind)
    if not insp.has_table("ml_deployment"):
        op.create_table(
            "ml_deployment",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("environment", sa.String(32), nullable=False),
            sa.Column("product_line", sa.String(64), nullable=False),
            sa.Column("task_name", sa.String(128), nullable=False),
            sa.Column("alias", sa.String(64), nullable=False),
            sa.Column("model_snapshot_id", sa.String(36), sa.ForeignKey("model_snapshot.id"), nullable=False),
            sa.Column("dataset_version_id", sa.String(36), sa.ForeignKey("ml_dataset_version.id"), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_ml_deployment_environment", "ml_deployment", ["environment"])
        op.create_index("ix_ml_deployment_product_line", "ml_deployment", ["product_line"])
        op.create_index("ix_ml_deployment_task_name", "ml_deployment", ["task_name"])
        op.create_index("ix_ml_deployment_alias", "ml_deployment", ["alias"])
        op.create_index("ix_ml_deployment_model_snapshot_id", "ml_deployment", ["model_snapshot_id"])
        op.create_index(
            "ix_ml_deployment_env_product_task_alias",
            "ml_deployment",
            ["environment", "product_line", "task_name", "alias"],
        )

    # Extend training_run
    insp = inspect(bind)
    if "training_run" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("training_run")}
        if "dataset_version_id" not in cols:
            op.add_column(
                "training_run",
                sa.Column("dataset_version_id", sa.String(36), sa.ForeignKey("ml_dataset_version.id"), nullable=True),
            )
            op.create_index("ix_training_run_dataset_version_id", "training_run", ["dataset_version_id"])
        if "git_sha" not in cols:
            op.add_column("training_run", sa.Column("git_sha", sa.String(64), nullable=True))

    # Extend model_snapshot
    insp = inspect(bind)
    if "model_snapshot" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("model_snapshot")}
        if "dataset_version_id" not in cols:
            op.add_column(
                "model_snapshot",
                sa.Column("dataset_version_id", sa.String(36), sa.ForeignKey("ml_dataset_version.id"), nullable=True),
            )
            op.create_index("ix_model_snapshot_dataset_version_id", "model_snapshot", ["dataset_version_id"])
        if "git_sha" not in cols:
            op.add_column("model_snapshot", sa.Column("git_sha", sa.String(64), nullable=True))
        if "artifact_manifest_uri" not in cols:
            op.add_column("model_snapshot", sa.Column("artifact_manifest_uri", sa.String(4096), nullable=True))
        if "label_schema_version" not in cols:
            op.add_column("model_snapshot", sa.Column("label_schema_version", sa.String(128), nullable=True))
        if "metrics_json" not in cols:
            op.add_column("model_snapshot", sa.Column("metrics_json", sa.Text(), nullable=True))
        if "model_family" not in cols:
            op.add_column("model_snapshot", sa.Column("model_family", sa.String(128), nullable=True))

    # Extend model_review_feedback
    insp = inspect(bind)
    if "model_review_feedback" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("model_review_feedback")}
        span_key_added = False
        if "span_start" not in cols:
            op.add_column("model_review_feedback", sa.Column("span_start", sa.Integer(), nullable=True))
        if "span_end" not in cols:
            op.add_column("model_review_feedback", sa.Column("span_end", sa.Integer(), nullable=True))
        if "span_key" not in cols:
            op.add_column("model_review_feedback", sa.Column("span_key", sa.String(512), nullable=True))
            span_key_added = True
        if "feedback_type" not in cols:
            op.add_column("model_review_feedback", sa.Column("feedback_type", sa.String(64), nullable=True))
        if "severity" not in cols:
            op.add_column("model_review_feedback", sa.Column("severity", sa.String(32), nullable=True))
        if "lab_delta_mean" not in cols:
            op.add_column("model_review_feedback", sa.Column("lab_delta_mean", sa.Float(), nullable=True))
        if "prom_delta_mean" not in cols:
            op.add_column("model_review_feedback", sa.Column("prom_delta_mean", sa.Float(), nullable=True))
        if "spr_delta_mean" not in cols:
            op.add_column("model_review_feedback", sa.Column("spr_delta_mean", sa.Float(), nullable=True))
        if "boundary_edit_count" not in cols:
            op.add_column("model_review_feedback", sa.Column("boundary_edit_count", sa.Integer(), nullable=True))
        if "is_retrain_eligible" not in cols:
            op.add_column(
                "model_review_feedback",
                sa.Column("is_retrain_eligible", sa.Boolean(), nullable=False, server_default="0"),
            )
        if "schema_version" not in cols:
            op.add_column(
                "model_review_feedback",
                sa.Column("schema_version", sa.String(64), nullable=False, server_default="review_feedback_v1"),
            )
        if span_key_added:
            op.create_index("ix_model_review_feedback_span_key", "model_review_feedback", ["span_key"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if "model_review_feedback" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("model_review_feedback")}
        if "span_key" in cols:
            try:
                op.drop_index("ix_model_review_feedback_span_key", table_name="model_review_feedback")
            except Exception:
                pass
        for c in (
            "schema_version",
            "is_retrain_eligible",
            "boundary_edit_count",
            "spr_delta_mean",
            "prom_delta_mean",
            "lab_delta_mean",
            "severity",
            "feedback_type",
            "span_key",
            "span_end",
            "span_start",
        ):
            if c in cols:
                try:
                    op.drop_column("model_review_feedback", c)
                except Exception:
                    pass

    if "model_snapshot" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("model_snapshot")}
        for c in ("model_family", "metrics_json", "label_schema_version", "artifact_manifest_uri", "git_sha"):
            if c in cols:
                try:
                    op.drop_column("model_snapshot", c)
                except Exception:
                    pass
        if "dataset_version_id" in cols:
            try:
                op.drop_index("ix_model_snapshot_dataset_version_id", table_name="model_snapshot")
            except Exception:
                pass
            try:
                op.drop_column("model_snapshot", "dataset_version_id")
            except Exception:
                pass

    if "training_run" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("training_run")}
        if "git_sha" in cols:
            try:
                op.drop_column("training_run", "git_sha")
            except Exception:
                pass
        if "dataset_version_id" in cols:
            try:
                op.drop_index("ix_training_run_dataset_version_id", table_name="training_run")
            except Exception:
                pass
            try:
                op.drop_column("training_run", "dataset_version_id")
            except Exception:
                pass

    if insp.has_table("ml_deployment"):
        op.drop_table("ml_deployment")
    if insp.has_table("ml_evaluation_run"):
        op.drop_table("ml_evaluation_run")
    if insp.has_table("ml_dataset_version"):
        op.drop_table("ml_dataset_version")
