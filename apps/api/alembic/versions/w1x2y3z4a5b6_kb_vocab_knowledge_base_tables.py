"""kb_vocab_version, segment KB, pattern/neighbor tables, analytics

Revision ID: w1x2y3z4a5b6
Revises: v3a4b5c6d7e8
Create Date: 2026-04-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "w1x2y3z4a5b6"
down_revision: Union[str, None] = "v3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if not insp.has_table("kb_vocab_version"):
        op.create_table(
            "kb_vocab_version",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("label", sa.String(128), nullable=False),
            sa.Column("source", sa.String(512), nullable=True),
            sa.Column("word_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("stats_json", sa.Text(), nullable=True),
        )

    if not insp.has_table("kb_word"):
        op.create_table(
            "kb_word",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("vocab_version_id", sa.String(36), sa.ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False),
            sa.Column("normalized_word", sa.String(512), nullable=False),
            sa.Column("raw_text", sa.Text(), nullable=False),
            sa.Column("stimulus_id", sa.String(36), sa.ForeignKey("stimulus.id", ondelete="SET NULL"), nullable=True),
            sa.Column("rank", sa.Integer(), nullable=True),
            sa.Column("length", sa.Integer(), nullable=False, server_default="0"),
            sa.UniqueConstraint("vocab_version_id", "normalized_word", name="uq_kb_word_vocab_norm"),
        )
        op.create_index("ix_kb_word_vocab_version_id", "kb_word", ["vocab_version_id"])
        op.create_index("ix_kb_word_normalized_word", "kb_word", ["normalized_word"])
        op.create_index("ix_kb_word_stimulus_id", "kb_word", ["stimulus_id"])

    insp = inspect(bind)
    if not insp.has_table("kb_pattern"):
        op.create_table(
            "kb_pattern",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("vocab_version_id", sa.String(36), sa.ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False),
            sa.Column("unit_type", sa.String(32), nullable=False),
            sa.Column("pattern_key", sa.String(256), nullable=False),
            sa.Column("corpus_freq", sa.Integer(), nullable=False, server_default="0"),
            sa.UniqueConstraint("vocab_version_id", "unit_type", "pattern_key", name="uq_kb_pattern_key"),
        )
        op.create_index("ix_kb_pattern_vocab_version_id", "kb_pattern", ["vocab_version_id"])

    insp = inspect(bind)
    if not insp.has_table("kb_word_pattern"):
        op.create_table(
            "kb_word_pattern",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("vocab_version_id", sa.String(36), sa.ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False),
            sa.Column("kb_word_id", sa.String(36), sa.ForeignKey("kb_word.id", ondelete="CASCADE"), nullable=False),
            sa.Column("pattern_id", sa.String(36), sa.ForeignKey("kb_pattern.id", ondelete="CASCADE"), nullable=False),
            sa.Column("positions_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("count_in_word", sa.Integer(), nullable=False, server_default="1"),
        )
        op.create_index("ix_kb_word_pattern_vocab", "kb_word_pattern", ["vocab_version_id"])
        op.create_index("ix_kb_word_pattern_word", "kb_word_pattern", ["kb_word_id"])
        op.create_index("ix_kb_word_pattern_pattern", "kb_word_pattern", ["pattern_id"])

    insp = inspect(bind)
    if not insp.has_table("kb_letter_neighbor"):
        op.create_table(
            "kb_letter_neighbor",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("vocab_version_id", sa.String(36), sa.ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False),
            sa.Column("center_letter", sa.String(8), nullable=False),
            sa.Column("side", sa.String(8), nullable=False),
            sa.Column("neighbor_char", sa.String(8), nullable=False),
            sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("pmi", sa.Float(), nullable=True),
            sa.UniqueConstraint(
                "vocab_version_id",
                "center_letter",
                "side",
                "neighbor_char",
                name="uq_kb_neighbor",
            ),
        )
        op.create_index("ix_kb_letter_neighbor_vocab", "kb_letter_neighbor", ["vocab_version_id"])

    insp = inspect(bind)
    if not insp.has_table("kb_pattern_position"):
        op.create_table(
            "kb_pattern_position",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("vocab_version_id", sa.String(36), sa.ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False),
            sa.Column("pattern_id", sa.String(36), sa.ForeignKey("kb_pattern.id", ondelete="CASCADE"), nullable=False),
            sa.Column("char_index", sa.Integer(), nullable=False),
            sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
            sa.UniqueConstraint("vocab_version_id", "pattern_id", "char_index", name="uq_kb_pattern_pos"),
        )
        op.create_index("ix_kb_pattern_position_vocab", "kb_pattern_position", ["vocab_version_id"])

    insp = inspect(bind)
    if not insp.has_table("kb_segment_instance"):
        op.create_table(
            "kb_segment_instance",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("vocab_version_id", sa.String(36), sa.ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False),
            sa.Column("kb_word_id", sa.String(36), sa.ForeignKey("kb_word.id", ondelete="CASCADE"), nullable=False),
            sa.Column("span_start", sa.Integer(), nullable=False),
            sa.Column("span_end", sa.Integer(), nullable=False),
            sa.Column("span_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("text_span", sa.Text(), nullable=True),
            sa.Column("source", sa.String(32), nullable=False, server_default="gold"),
            sa.Column("model_snapshot_id", sa.String(36), sa.ForeignKey("model_snapshot.id", ondelete="SET NULL"), nullable=True),
            sa.Column("confidence_json", sa.Text(), nullable=True),
        )
        op.create_index("ix_kb_seg_inst_vocab", "kb_segment_instance", ["vocab_version_id"])
        op.create_index("ix_kb_seg_inst_word", "kb_segment_instance", ["kb_word_id"])

    insp = inspect(bind)
    if not insp.has_table("kb_segment_label"):
        op.create_table(
            "kb_segment_label",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("segment_instance_id", sa.String(36), sa.ForeignKey("kb_segment_instance.id", ondelete="CASCADE"), nullable=False),
            sa.Column("label_key", sa.String(128), nullable=False),
            sa.Column("label_value", sa.Text(), nullable=True),
        )
        op.create_index("ix_kb_segment_label_seg", "kb_segment_label", ["segment_instance_id"])

    insp = inspect(bind)
    if not insp.has_table("kb_segment_param"):
        op.create_table(
            "kb_segment_param",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("segment_instance_id", sa.String(36), sa.ForeignKey("kb_segment_instance.id", ondelete="CASCADE"), nullable=False),
            sa.Column("param_key", sa.String(128), nullable=False),
            sa.Column("param_value_float", sa.Float(), nullable=True),
            sa.Column("param_json", sa.Text(), nullable=True),
        )
        op.create_index("ix_kb_segment_param_seg", "kb_segment_param", ["segment_instance_id"])

    insp = inspect(bind)
    if not insp.has_table("analytics_pattern_labeled"):
        op.create_table(
            "analytics_pattern_labeled",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("vocab_version_id", sa.String(36), sa.ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False),
            sa.Column("pattern_id", sa.String(36), sa.ForeignKey("kb_pattern.id", ondelete="CASCADE"), nullable=False),
            sa.Column("count_labeled", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("target", sa.Integer(), nullable=True),
        )
        op.create_index("ix_analytics_pat_lab_vocab", "analytics_pattern_labeled", ["vocab_version_id"])

    insp = inspect(bind)
    if not insp.has_table("analytics_segment_combo_labeled"):
        op.create_table(
            "analytics_segment_combo_labeled",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("vocab_version_id", sa.String(36), sa.ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False),
            sa.Column("combo_key", sa.String(512), nullable=False),
            sa.Column("count_labeled", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("variance_lab", sa.Float(), nullable=True),
            sa.UniqueConstraint("vocab_version_id", "combo_key", name="uq_kb_segcombo"),
        )
        op.create_index("ix_analytics_seg_combo_vocab", "analytics_segment_combo_labeled", ["vocab_version_id"])

    insp = inspect(bind)
    if not insp.has_table("analytics_gap_snapshot"):
        op.create_table(
            "analytics_gap_snapshot",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("vocab_version_id", sa.String(36), sa.ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False),
            sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("gap_json", sa.Text(), nullable=False, server_default="{}"),
        )
        op.create_index("ix_analytics_gap_vocab", "analytics_gap_snapshot", ["vocab_version_id"])


def downgrade() -> None:
    for t in (
        "analytics_gap_snapshot",
        "analytics_segment_combo_labeled",
        "analytics_pattern_labeled",
        "kb_segment_param",
        "kb_segment_label",
        "kb_segment_instance",
        "kb_pattern_position",
        "kb_letter_neighbor",
        "kb_word_pattern",
        "kb_pattern",
        "kb_word",
        "kb_vocab_version",
    ):
        op.drop_table(t)
