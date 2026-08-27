"""Add Pattern Supply tables and registry constraints.

Revision ID: r4s5t6u7v8w9
Revises: q1r2s3t4u5v6
Create Date: 2026-04-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "r4s5t6u7v8w9"
down_revision: Union[str, None] = "q1r2s3t4u5v6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(insp, table_name: str, column_name: str) -> bool:
    if not insp.has_table(table_name):
        return False
    return any(c["name"] == column_name for c in insp.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if not insp.has_table("user_word_registry"):
        op.create_table(
            "user_word_registry",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("selected_list_id", sa.String(36), sa.ForeignKey("dataset.id"), nullable=False),
            sa.Column("word", sa.Text(), nullable=False),
            sa.Column("normalized_word", sa.String(512), nullable=False),
            sa.Column("source", sa.String(128), nullable=False, server_default="unknown"),
            sa.Column("status", sa.String(32), nullable=False, server_default="candidate"),
            sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("selected_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("annotated_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("annotation_version", sa.String(128), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()),
            sa.UniqueConstraint("selected_list_id", "normalized_word", name="uq_registry_list_normalized_word"),
        )
        op.create_index("ix_user_word_registry_selected_list_id", "user_word_registry", ["selected_list_id"])
        op.create_index("ix_user_word_registry_status", "user_word_registry", ["status"])
        op.create_index("ix_registry_list_status", "user_word_registry", ["selected_list_id", "status"])
        op.create_index(
            "ix_registry_list_annotated_at",
            "user_word_registry",
            ["selected_list_id", "annotated_at"],
        )

    insp = inspect(bind)
    if not insp.has_table("supply_demand_profile"):
        op.create_table(
            "supply_demand_profile",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("selected_list_id", sa.String(36), sa.ForeignKey("dataset.id"), nullable=False),
            sa.Column("profile_version", sa.String(64), nullable=False, server_default="pattern_supply_v1"),
            sa.Column("pattern_gap_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("context_gap_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("collocation_gap_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("coverage_state_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index(
            "ix_supply_demand_profile_selected_list_id",
            "supply_demand_profile",
            ["selected_list_id"],
        )

    insp = inspect(bind)
    if not insp.has_table("supply_candidate_snapshot"):
        op.create_table(
            "supply_candidate_snapshot",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("batch_id", sa.String(36), nullable=False),
            sa.Column("selected_list_id", sa.String(36), sa.ForeignKey("dataset.id"), nullable=False),
            sa.Column("word", sa.Text(), nullable=False),
            sa.Column("normalized_word", sa.String(512), nullable=False),
            sa.Column("sources_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("candidate_payload_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("excluded", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("exclusion_reason", sa.String(128), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_supply_candidate_snapshot_batch_id", "supply_candidate_snapshot", ["batch_id"])
        op.create_index(
            "ix_supply_candidate_snapshot_selected_list_id",
            "supply_candidate_snapshot",
            ["selected_list_id"],
        )
        op.create_index(
            "ix_supply_candidate_snapshot_normalized_word",
            "supply_candidate_snapshot",
            ["normalized_word"],
        )
        op.create_index(
            "ix_supply_candidate_list_batch",
            "supply_candidate_snapshot",
            ["selected_list_id", "batch_id"],
        )

    insp = inspect(bind)
    if not insp.has_table("supply_recommendation_snapshot"):
        op.create_table(
            "supply_recommendation_snapshot",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("batch_id", sa.String(36), nullable=False),
            sa.Column("selected_list_id", sa.String(36), sa.ForeignKey("dataset.id"), nullable=False),
            sa.Column("word", sa.Text(), nullable=False),
            sa.Column("normalized_word", sa.String(512), nullable=False),
            sa.Column("rank", sa.Integer(), nullable=False),
            sa.Column("supply_score", sa.Float(), nullable=False),
            sa.Column("score_breakdown_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("why_selected_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index(
            "ix_supply_recommendation_snapshot_batch_id",
            "supply_recommendation_snapshot",
            ["batch_id"],
        )
        op.create_index(
            "ix_supply_recommendation_snapshot_selected_list_id",
            "supply_recommendation_snapshot",
            ["selected_list_id"],
        )
        op.create_index(
            "ix_supply_recommendation_snapshot_normalized_word",
            "supply_recommendation_snapshot",
            ["normalized_word"],
        )
        op.create_index(
            "ix_supply_recommendation_list_batch_rank",
            "supply_recommendation_snapshot",
            ["selected_list_id", "batch_id", "rank"],
        )

    insp = inspect(bind)
    if _has_column(insp, "al_queue_snapshot", "selected_list_id") is False:
        op.add_column("al_queue_snapshot", sa.Column("selected_list_id", sa.String(36), nullable=True))
        op.create_index(
            "ix_al_queue_snapshot_selected_list_id",
            "al_queue_snapshot",
            ["selected_list_id"],
        )
    insp = inspect(bind)
    if _has_column(insp, "al_prediction_history", "selected_list_id") is False:
        op.add_column(
            "al_prediction_history",
            sa.Column("selected_list_id", sa.String(36), nullable=True),
        )
        op.create_index(
            "ix_al_prediction_history_selected_list_id",
            "al_prediction_history",
            ["selected_list_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if insp.has_table("al_prediction_history") and _has_column(insp, "al_prediction_history", "selected_list_id"):
        op.drop_index("ix_al_prediction_history_selected_list_id", table_name="al_prediction_history")
        op.drop_column("al_prediction_history", "selected_list_id")

    insp = inspect(bind)
    if insp.has_table("al_queue_snapshot") and _has_column(insp, "al_queue_snapshot", "selected_list_id"):
        op.drop_index("ix_al_queue_snapshot_selected_list_id", table_name="al_queue_snapshot")
        op.drop_column("al_queue_snapshot", "selected_list_id")

    insp = inspect(bind)
    if insp.has_table("supply_recommendation_snapshot"):
        op.drop_table("supply_recommendation_snapshot")

    insp = inspect(bind)
    if insp.has_table("supply_candidate_snapshot"):
        op.drop_table("supply_candidate_snapshot")

    insp = inspect(bind)
    if insp.has_table("supply_demand_profile"):
        op.drop_table("supply_demand_profile")

    insp = inspect(bind)
    if insp.has_table("user_word_registry"):
        op.drop_table("user_word_registry")

