"""annotation_schema_revision

Revision ID: 519ad1977ed8
Revises:
Create Date: 2026-03-22 20:49:30.490246

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "519ad1977ed8"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(bind, table: str) -> set[str]:
    insp = inspect(bind)
    if not insp.has_table(table):
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    # Fresh PostgreSQL (and any empty DB): core tables were never created — SQLite dev used
    # Base.metadata.create_all on startup. Bootstrap ORM schema once before ALTERs.
    if not insp.has_table("span"):
        import app.models  # noqa: F401 — register all models on Base.metadata

        from app.db import Base

        # Single-connection DDL only. Do not call ensure_training_tables(engine) here:
        # it checks out a second pooled connection and can deadlock with create_all on Postgres.
        Base.metadata.create_all(bind=bind)
        insp = inspect(bind)

    # Span: add color_lab, prominence, spread columns (idempotent for legacy DBs)
    span_cols = _column_names(bind, "span")
    if "color_lab_l" not in span_cols:
        op.add_column("span", sa.Column("color_lab_l", sa.Float(), server_default="50.0"))
    if "color_lab_a" not in span_cols:
        op.add_column("span", sa.Column("color_lab_a", sa.Float(), server_default="0.0"))
    if "color_lab_b" not in span_cols:
        op.add_column("span", sa.Column("color_lab_b", sa.Float(), server_default="0.0"))
    if "prominence" not in span_cols:
        op.add_column("span", sa.Column("prominence", sa.Float(), server_default="0.5"))
    if "spread" not in span_cols:
        op.add_column("span", sa.Column("spread", sa.Float(), server_default="0.5"))

    # Stimulus: add import/feature columns
    stim_cols = _column_names(bind, "stimulus")
    if "frequency_rank" not in stim_cols:
        op.add_column("stimulus", sa.Column("frequency_rank", sa.Integer(), nullable=True))
    if "contextual_diversity" not in stim_cols:
        op.add_column("stimulus", sa.Column("contextual_diversity", sa.Float(), nullable=True))
    if "char_coverage_score" not in stim_cols:
        op.add_column("stimulus", sa.Column("char_coverage_score", sa.Float(), nullable=True))
    if "bigram_coverage_score" not in stim_cols:
        op.add_column("stimulus", sa.Column("bigram_coverage_score", sa.Float(), nullable=True))
    if "trigram_coverage_score" not in stim_cols:
        op.add_column("stimulus", sa.Column("trigram_coverage_score", sa.Float(), nullable=True))
    if "prefix_patterns" not in stim_cols:
        op.add_column("stimulus", sa.Column("prefix_patterns", sa.Text(), nullable=True))
    if "suffix_patterns" not in stim_cols:
        op.add_column("stimulus", sa.Column("suffix_patterns", sa.Text(), nullable=True))
    if "pronunciation_available" not in stim_cols:
        op.add_column(
            "stimulus", sa.Column("pronunciation_available", sa.Boolean(), server_default=sa.text("false"))
        )
    if "selected_for_seed" not in stim_cols:
        op.add_column(
            "stimulus", sa.Column("selected_for_seed", sa.Boolean(), server_default=sa.text("false"))
        )

    # Create segment_memory table
    insp = inspect(bind)
    if not insp.has_table("segment_memory"):
        op.create_table(
            "segment_memory",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("segment_text", sa.Text(), nullable=False),
            sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("prefix_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("middle_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("suffix_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("avg_l", sa.Float(), server_default="50.0"),
            sa.Column("avg_a", sa.Float(), server_default="0.0"),
            sa.Column("avg_b", sa.Float(), server_default="0.0"),
            sa.Column("avg_prominence", sa.Float(), server_default="0.5"),
            sa.Column("avg_spread", sa.Float(), server_default="0.5"),
            sa.Column("example_words", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index(op.f("ix_segment_memory_segment_text"), "segment_memory", ["segment_text"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_segment_memory_segment_text"), table_name="segment_memory")
    op.drop_table("segment_memory")
    op.drop_column("stimulus", "selected_for_seed")
    op.drop_column("stimulus", "pronunciation_available")
    op.drop_column("stimulus", "suffix_patterns")
    op.drop_column("stimulus", "prefix_patterns")
    op.drop_column("stimulus", "trigram_coverage_score")
    op.drop_column("stimulus", "bigram_coverage_score")
    op.drop_column("stimulus", "char_coverage_score")
    op.drop_column("stimulus", "contextual_diversity")
    op.drop_column("stimulus", "frequency_rank")
    op.drop_column("span", "spread")
    op.drop_column("span", "prominence")
    op.drop_column("span", "color_lab_b")
    op.drop_column("span", "color_lab_a")
    op.drop_column("span", "color_lab_l")
