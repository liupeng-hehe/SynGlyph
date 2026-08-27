"""training_run columns + model_snapshot table

Revision ID: d4e5f6a7b8c9
Revises: b2c3d4e5f6a
Create Date: 2026-04-02

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "b2c3d4e5f6a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _cols(conn, table: str) -> set[str]:
    return {c["name"] for c in inspect(conn).get_columns(table)}


def upgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    names = set(insp.get_table_names())

    if "training_run" not in names:
        op.create_table(
            "training_run",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("status", sa.String(32), nullable=False),
            sa.Column("dataset_id", sa.String(36), nullable=True),
            sa.Column("config_json", sa.Text(), nullable=False),
            sa.Column("out_dir", sa.String(1024), nullable=False),
            sa.Column("process_pid", sa.Integer(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("best_val_loss", sa.Float(), nullable=True),
            sa.Column("n_samples", sa.Integer(), nullable=True),
            sa.Column("n_unique_words", sa.Integer(), nullable=True),
        )
        op.create_index("ix_training_run_status", "training_run", ["status"])
        op.create_index("ix_training_run_dataset_id", "training_run", ["dataset_id"])
    else:
        cols = _cols(conn, "training_run")
        if "config_json" not in cols:
            op.add_column(
                "training_run",
                sa.Column("config_json", sa.Text(), nullable=False, server_default="{}"),
            )
        if "out_dir" not in cols:
            op.add_column(
                "training_run",
                sa.Column("out_dir", sa.String(1024), nullable=False, server_default=""),
            )
        if "process_pid" not in cols:
            op.add_column("training_run", sa.Column("process_pid", sa.Integer(), nullable=True))
        if "error_message" not in cols:
            op.add_column("training_run", sa.Column("error_message", sa.Text(), nullable=True))
        if "started_at" not in cols:
            # SQLite ADD COLUMN: no func.now() default (non-constant)
            op.add_column(
                "training_run",
                sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            )
        if "updated_at" not in cols:
            op.add_column(
                "training_run",
                sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            )
        if "finished_at" not in cols:
            op.add_column(
                "training_run", sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True)
            )
        if "best_val_loss" not in cols:
            op.add_column("training_run", sa.Column("best_val_loss", sa.Float(), nullable=True))
        if "n_samples" not in cols:
            op.add_column("training_run", sa.Column("n_samples", sa.Integer(), nullable=True))
        if "n_unique_words" not in cols:
            op.add_column("training_run", sa.Column("n_unique_words", sa.Integer(), nullable=True))
        if "dataset_id" not in cols:
            op.add_column("training_run", sa.Column("dataset_id", sa.String(36), nullable=True))
        if "status" not in cols:
            op.add_column(
                "training_run",
                sa.Column("status", sa.String(32), nullable=False, server_default="idle"),
            )

    insp = inspect(conn)
    if "model_snapshot" not in insp.get_table_names():
        op.create_table(
            "model_snapshot",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("training_run_id", sa.String(36), sa.ForeignKey("training_run.id"), nullable=False),
            sa.Column("name", sa.String(512), nullable=False),
            sa.Column("checkpoint_uri", sa.String(2048), nullable=False),
            sa.Column("config_json", sa.Text(), nullable=False),
            sa.Column("best_val_loss", sa.Float(), nullable=True),
            sa.Column("n_samples", sa.Integer(), nullable=True),
            sa.Column("n_unique_words", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_model_snapshot_training_run_id", "model_snapshot", ["training_run_id"])


def downgrade() -> None:
    op.drop_index("ix_model_snapshot_training_run_id", table_name="model_snapshot")
    op.drop_table("model_snapshot")
    # do not drop training_run columns (may have data)
