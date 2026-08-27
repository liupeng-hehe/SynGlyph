"""english_* and chinese_* product tables (separate namespaces)

Revision ID: f1a2b3c4d5e6
Revises: d4e5f6a7b8c9
Create Date: 2026-03-27

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ensure_index(bind, table: str, name: str, columns: list, **kw) -> None:
    insp = inspect(bind)
    if not insp.has_table(table):
        return
    names = {i["name"] for i in insp.get_indexes(table)}
    if name not in names:
        op.create_index(name, table, columns, **kw)


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if not insp.has_table("english_annotation_sessions"):
        op.create_table(
            "english_annotation_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if not insp.has_table("english_word_instances"):
        op.create_table(
            "english_word_instances",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("english_annotation_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("word_text", sa.String(2048), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    _ensure_index(bind, "english_word_instances", "ix_english_word_instances_session_id", ["session_id"])

    if not insp.has_table("english_segments"):
        op.create_table(
            "english_segments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("word_instance_id", sa.String(36), sa.ForeignKey("english_word_instances.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("label", sa.String(512), nullable=True),
        sa.Column("color_json", sa.String(8192), nullable=False, server_default="{}"),
        sa.Column("transform_json", sa.String(8192), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    _ensure_index(bind, "english_segments", "ix_english_segments_word_instance_id", ["word_instance_id"])

    if not insp.has_table("english_transitions"):
        op.create_table(
            "english_transitions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("word_instance_id", sa.String(36), sa.ForeignKey("english_word_instances.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_segment_id", sa.String(36), sa.ForeignKey("english_segments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_segment_id", sa.String(36), sa.ForeignKey("english_segments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("strength", sa.Float(), nullable=False, server_default="1"),
        sa.Column("width", sa.Float(), nullable=False, server_default="0.2"),
        sa.Column("falloff", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("curve_json", sa.String(8192), nullable=True),
        sa.Column("blend_mode", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    _ensure_index(bind, "english_transitions", "ix_english_transitions_word_instance_id", ["word_instance_id"])
    _ensure_index(bind, "english_transitions", "ix_english_transitions_source_segment_id", ["source_segment_id"])
    _ensure_index(bind, "english_transitions", "ix_english_transitions_target_segment_id", ["target_segment_id"])

    if not insp.has_table("chinese_glyph_templates"):
        op.create_table(
            "chinese_glyph_templates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("character", sa.String(8), nullable=False),
        sa.Column("decomposition_json", sa.String(8192), nullable=True),
        sa.Column("matches_json", sa.String(8192), nullable=True),
        sa.Column("strokes_json", sa.String(65536), nullable=False),
        sa.Column("medians_json", sa.String(65536), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    _ensure_index(
        bind,
        "chinese_glyph_templates",
        "ix_chinese_glyph_templates_character",
        ["character"],
        unique=True,
    )

    if not insp.has_table("chinese_annotation_sessions"):
        op.create_table(
            "chinese_annotation_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not insp.has_table("chinese_glyph_instances"):
        op.create_table(
            "chinese_glyph_instances",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("chinese_annotation_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("template_id", sa.String(36), sa.ForeignKey("chinese_glyph_templates.id", ondelete="SET NULL"), nullable=True),
        sa.Column("character", sa.String(8), nullable=False),
        sa.Column("transform_json", sa.String(8192), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    _ensure_index(bind, "chinese_glyph_instances", "ix_chinese_glyph_instances_session_id", ["session_id"])
    _ensure_index(bind, "chinese_glyph_instances", "ix_chinese_glyph_instances_template_id", ["template_id"])
    _ensure_index(bind, "chinese_glyph_instances", "ix_chinese_glyph_instances_character", ["character"])

    if not insp.has_table("chinese_regions"):
        op.create_table(
            "chinese_regions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("glyph_instance_id", sa.String(36), sa.ForeignKey("chinese_glyph_instances.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(512), nullable=False, server_default="region"),
        sa.Column("label", sa.String(512), nullable=True),
        sa.Column("selection_mode", sa.String(32), nullable=False),
        sa.Column("selection_json", sa.String(16384), nullable=True),
        sa.Column("stroke_ids_json", sa.String(8192), nullable=True),
        sa.Column("polygon_json", sa.String(16384), nullable=True),
        sa.Column("anchor_json", sa.String(4096), nullable=False, server_default="{}"),
        sa.Column("color_json", sa.String(8192), nullable=False, server_default="{}"),
        sa.Column("spread_json", sa.String(4096), nullable=False, server_default="{}"),
        sa.Column("intensity", sa.Float(), nullable=False, server_default="1"),
        sa.Column("z_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    _ensure_index(bind, "chinese_regions", "ix_chinese_regions_glyph_instance_id", ["glyph_instance_id"])

    if not insp.has_table("chinese_transitions"):
        op.create_table(
            "chinese_transitions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("glyph_instance_id", sa.String(36), sa.ForeignKey("chinese_glyph_instances.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_region_id", sa.String(36), sa.ForeignKey("chinese_regions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_region_id", sa.String(36), sa.ForeignKey("chinese_regions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mode", sa.String(32), nullable=False, server_default="directed_flow"),
        sa.Column("strength", sa.Float(), nullable=False, server_default="1"),
        sa.Column("width", sa.Float(), nullable=False, server_default="0.25"),
        sa.Column("falloff", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("curve_json", sa.String(8192), nullable=True),
        sa.Column("blend_mode", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    _ensure_index(bind, "chinese_transitions", "ix_chinese_transitions_glyph_instance_id", ["glyph_instance_id"])
    _ensure_index(bind, "chinese_transitions", "ix_chinese_transitions_source_region_id", ["source_region_id"])
    _ensure_index(bind, "chinese_transitions", "ix_chinese_transitions_target_region_id", ["target_region_id"])


def downgrade() -> None:
    op.drop_table("chinese_transitions")
    op.drop_table("chinese_regions")
    op.drop_table("chinese_glyph_instances")
    op.drop_table("chinese_annotation_sessions")
    op.drop_index("ix_chinese_glyph_templates_character", table_name="chinese_glyph_templates")
    op.drop_table("chinese_glyph_templates")
    op.drop_table("english_transitions")
    op.drop_table("english_segments")
    op.drop_table("english_word_instances")
    op.drop_table("english_annotation_sessions")
