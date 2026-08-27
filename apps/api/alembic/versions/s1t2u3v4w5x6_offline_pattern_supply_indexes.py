"""Add offline-first pattern supply index tables.

Revision ID: s1t2u3v4w5x6
Revises: r4s5t6u7v8w9
Create Date: 2026-04-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "s1t2u3v4w5x6"
down_revision: Union[str, None] = "r4s5t6u7v8w9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if not insp.has_table("offline_index_version"):
        op.create_table(
            "offline_index_version",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("version", sa.String(128), nullable=False, unique=True),
            sa.Column("corpus_name", sa.String(256), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("status", sa.String(32), nullable=False, server_default="built"),
            sa.Column("stats_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("built_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_offline_index_version_version", "offline_index_version", ["version"])
        op.create_index("ix_offline_index_version_is_active", "offline_index_version", ["is_active"])
        op.create_index("ix_offline_index_version_status", "offline_index_version", ["status"])
        op.create_index(
            "ix_offline_index_version_active_status",
            "offline_index_version",
            ["is_active", "status"],
        )

    if not insp.has_table("offline_pattern_index"):
        op.create_table(
            "offline_pattern_index",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("version_id", sa.String(36), sa.ForeignKey("offline_index_version.id"), nullable=False),
            sa.Column("pattern_key", sa.String(256), nullable=False),
            sa.Column("word", sa.Text(), nullable=False),
            sa.Column("normalized_word", sa.String(512), nullable=False),
            sa.Column("pattern_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("score", sa.Float(), nullable=False, server_default="0"),
            sa.Column("source", sa.String(64), nullable=False, server_default="offline_corpus"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_offline_pattern_index_version_id", "offline_pattern_index", ["version_id"])
        op.create_index("ix_offline_pattern_index_pattern_key", "offline_pattern_index", ["pattern_key"])
        op.create_index("ix_offline_pattern_index_normalized_word", "offline_pattern_index", ["normalized_word"])
        op.create_index("ix_offline_pattern_version_pattern", "offline_pattern_index", ["version_id", "pattern_key"])
        op.create_index("ix_offline_pattern_version_word", "offline_pattern_index", ["version_id", "normalized_word"])

    if not insp.has_table("offline_context_index"):
        op.create_table(
            "offline_context_index",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("version_id", sa.String(36), sa.ForeignKey("offline_index_version.id"), nullable=False),
            sa.Column("context_key", sa.String(256), nullable=False),
            sa.Column("word", sa.Text(), nullable=False),
            sa.Column("normalized_word", sa.String(512), nullable=False),
            sa.Column("context_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("score", sa.Float(), nullable=False, server_default="0"),
            sa.Column("source", sa.String(64), nullable=False, server_default="offline_corpus"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_offline_context_index_version_id", "offline_context_index", ["version_id"])
        op.create_index("ix_offline_context_index_context_key", "offline_context_index", ["context_key"])
        op.create_index("ix_offline_context_index_normalized_word", "offline_context_index", ["normalized_word"])
        op.create_index("ix_offline_context_version_context", "offline_context_index", ["version_id", "context_key"])
        op.create_index("ix_offline_context_version_word", "offline_context_index", ["version_id", "normalized_word"])

    if not insp.has_table("offline_collocation_index"):
        op.create_table(
            "offline_collocation_index",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("version_id", sa.String(36), sa.ForeignKey("offline_index_version.id"), nullable=False),
            sa.Column("collocation_key", sa.String(256), nullable=False),
            sa.Column("word", sa.Text(), nullable=False),
            sa.Column("normalized_word", sa.String(512), nullable=False),
            sa.Column("collocation_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("score", sa.Float(), nullable=False, server_default="0"),
            sa.Column("source", sa.String(64), nullable=False, server_default="offline_corpus"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_offline_collocation_index_version_id", "offline_collocation_index", ["version_id"])
        op.create_index("ix_offline_collocation_index_collocation_key", "offline_collocation_index", ["collocation_key"])
        op.create_index("ix_offline_collocation_index_normalized_word", "offline_collocation_index", ["normalized_word"])
        op.create_index(
            "ix_offline_collocation_version_key",
            "offline_collocation_index",
            ["version_id", "collocation_key"],
        )
        op.create_index(
            "ix_offline_collocation_version_word",
            "offline_collocation_index",
            ["version_id", "normalized_word"],
        )

    if not insp.has_table("offline_lexicon_index"):
        op.create_table(
            "offline_lexicon_index",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("version_id", sa.String(36), sa.ForeignKey("offline_index_version.id"), nullable=False),
            sa.Column("word", sa.Text(), nullable=False),
            sa.Column("normalized_word", sa.String(512), nullable=False),
            sa.Column("lemma", sa.String(512), nullable=True),
            sa.Column("pos", sa.String(64), nullable=True),
            sa.Column("zipf_frequency", sa.Float(), nullable=True),
            sa.Column("global_score", sa.Float(), nullable=False, server_default="0"),
            sa.Column("metadata_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_offline_lexicon_index_version_id", "offline_lexicon_index", ["version_id"])
        op.create_index("ix_offline_lexicon_index_normalized_word", "offline_lexicon_index", ["normalized_word"])
        op.create_index("ix_offline_lexicon_version_word", "offline_lexicon_index", ["version_id", "normalized_word"])

    if not insp.has_table("offline_rebuild_job"):
        op.create_table(
            "offline_rebuild_job",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
            sa.Column("corpus_name", sa.String(256), nullable=False),
            sa.Column("source_path", sa.Text(), nullable=False),
            sa.Column("version_id", sa.String(36), sa.ForeignKey("offline_index_version.id"), nullable=True),
            sa.Column("message", sa.Text(), nullable=True),
            sa.Column("stats_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()),
        )
        op.create_index("ix_offline_rebuild_job_status", "offline_rebuild_job", ["status"])
        op.create_index("ix_offline_rebuild_job_version_id", "offline_rebuild_job", ["version_id"])
        op.create_index(
            "ix_offline_rebuild_job_status_created",
            "offline_rebuild_job",
            ["status", "created_at"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if insp.has_table("offline_rebuild_job"):
        op.drop_table("offline_rebuild_job")
    insp = inspect(bind)
    if insp.has_table("offline_lexicon_index"):
        op.drop_table("offline_lexicon_index")
    insp = inspect(bind)
    if insp.has_table("offline_collocation_index"):
        op.drop_table("offline_collocation_index")
    insp = inspect(bind)
    if insp.has_table("offline_context_index"):
        op.drop_table("offline_context_index")
    insp = inspect(bind)
    if insp.has_table("offline_pattern_index"):
        op.drop_table("offline_pattern_index")
    insp = inspect(bind)
    if insp.has_table("offline_index_version"):
        op.drop_table("offline_index_version")

