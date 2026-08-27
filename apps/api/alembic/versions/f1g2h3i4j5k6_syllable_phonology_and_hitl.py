"""Syllable / pronunciation cache + HITL annotation fields.

Revision ID: f1g2h3i4j5k6
Revises: e9f0a1b2c3d4
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1g2h3i4j5k6"
down_revision: Union[str, None] = "e9f0a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "word_pronunciation_cache",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("normalized_word", sa.String(256), nullable=False, index=True),
        sa.Column("preprocessing_version", sa.String(64), nullable=False),
        sa.Column("cache_json", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_word_pron_cache_word_version",
        "word_pronunciation_cache",
        ["normalized_word", "preprocessing_version"],
        unique=True,
    )

    op.add_column("stimulus", sa.Column("pronunciation_cache_json", sa.Text(), nullable=True))
    op.add_column("stimulus", sa.Column("stress_pattern", sa.String(32), nullable=True))
    op.add_column("stimulus", sa.Column("syllable_count", sa.Integer(), nullable=True))
    op.add_column("stimulus", sa.Column("preprocessing_version", sa.String(64), nullable=True))

    op.add_column("annotation", sa.Column("subjective_mode", sa.String(32), nullable=True))
    op.add_column("annotation", sa.Column("best_color_lab_l", sa.Float(), nullable=True))
    op.add_column("annotation", sa.Column("best_color_lab_a", sa.Float(), nullable=True))
    op.add_column("annotation", sa.Column("best_color_lab_b", sa.Float(), nullable=True))
    op.add_column("annotation", sa.Column("best_color_hex", sa.String(16), nullable=True))
    op.add_column("annotation", sa.Column("dominant_letter_idx", sa.Integer(), nullable=True))
    op.add_column("annotation", sa.Column("accept_or_revise", sa.String(32), nullable=True))
    op.add_column("annotation", sa.Column("response_confidence", sa.Float(), nullable=True))
    op.add_column("annotation", sa.Column("picker_start_hex", sa.String(16), nullable=True))
    op.add_column("annotation", sa.Column("picker_moved_flag", sa.Boolean(), nullable=True))
    op.add_column("annotation", sa.Column("skip_flag", sa.Boolean(), nullable=True))
    op.add_column("annotation", sa.Column("annotation_extras_json", sa.Text(), nullable=True))

    op.add_column("span", sa.Column("syllable_idx", sa.Integer(), nullable=True))
    op.add_column("span", sa.Column("is_in_stressed_syllable", sa.Boolean(), nullable=True))
    op.add_column("span", sa.Column("is_stressed_nucleus", sa.Boolean(), nullable=True))
    op.add_column("span", sa.Column("char_role_in_syllable", sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_index("ix_word_pron_cache_word_version", table_name="word_pronunciation_cache")
    op.drop_table("word_pronunciation_cache")

    for c in (
        "pronunciation_cache_json",
        "stress_pattern",
        "syllable_count",
        "preprocessing_version",
    ):
        op.drop_column("stimulus", c)
    for c in (
        "subjective_mode",
        "best_color_lab_l",
        "best_color_lab_a",
        "best_color_lab_b",
        "best_color_hex",
        "dominant_letter_idx",
        "accept_or_revise",
        "response_confidence",
        "picker_start_hex",
        "picker_moved_flag",
        "skip_flag",
        "annotation_extras_json",
    ):
        op.drop_column("annotation", c)
    for c in (
        "syllable_idx",
        "is_in_stressed_syllable",
        "is_stressed_nucleus",
        "char_role_in_syllable",
    ):
        op.drop_column("span", c)
