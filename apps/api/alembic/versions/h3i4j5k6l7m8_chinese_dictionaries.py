"""chinese_dictionaries + session.dictionary_id

Revision ID: h3i4j5k6l7m8
Revises: f1a2b3c4d5e6
Create Date: 2026-03-27

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "h3i4j5k6l7m8"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_DICT_ID = "a0000000-0000-4000-8000-000000000001"


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if insp.has_table("chinese_annotation_sessions"):
        sess_cols = {c["name"] for c in insp.get_columns("chinese_annotation_sessions")}
        if "dictionary_id" in sess_cols:
            return

    if not insp.has_table("chinese_dictionaries"):
        op.create_table(
            "chinese_dictionaries",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(256), nullable=False),
            sa.Column("owner", sa.String(64), nullable=False, server_default="default"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_chinese_dictionaries_owner", "chinese_dictionaries", ["owner"], unique=False)
        op.execute(
            sa.text(
                "INSERT INTO chinese_dictionaries (id, name, owner) VALUES (:id, :name, :owner)"
            ).bindparams(
                id=DEFAULT_DICT_ID,
                name="默认字典",
                owner="default",
            )
        )

    if not insp.has_table("chinese_annotation_sessions"):
        return

    with op.batch_alter_table("chinese_annotation_sessions") as batch_op:
        batch_op.add_column(sa.Column("dictionary_id", sa.String(36), nullable=True))

    op.execute(
        sa.text(
            "UPDATE chinese_annotation_sessions SET dictionary_id = :did WHERE dictionary_id IS NULL"
        ).bindparams(did=DEFAULT_DICT_ID)
    )

    with op.batch_alter_table("chinese_annotation_sessions") as batch_op:
        batch_op.create_foreign_key(
            "fk_chinese_sessions_dictionary",
            "chinese_dictionaries",
            ["dictionary_id"],
            ["id"],
        )
        batch_op.create_index("ix_chinese_annotation_sessions_dictionary_id", ["dictionary_id"])
        batch_op.alter_column("dictionary_id", existing_type=sa.String(36), nullable=False)


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table("chinese_annotation_sessions"):
        if insp.has_table("chinese_dictionaries"):
            op.drop_index("ix_chinese_dictionaries_owner", table_name="chinese_dictionaries")
            op.drop_table("chinese_dictionaries")
        return
    sess_cols = {c["name"] for c in insp.get_columns("chinese_annotation_sessions")}
    if "dictionary_id" not in sess_cols:
        if insp.has_table("chinese_dictionaries"):
            op.drop_index("ix_chinese_dictionaries_owner", table_name="chinese_dictionaries")
            op.drop_table("chinese_dictionaries")
        return
    with op.batch_alter_table("chinese_annotation_sessions") as batch_op:
        batch_op.drop_index("ix_chinese_annotation_sessions_dictionary_id")
        batch_op.drop_constraint("fk_chinese_sessions_dictionary", type_="foreignkey")
        batch_op.drop_column("dictionary_id")
    op.drop_index("ix_chinese_dictionaries_owner", table_name="chinese_dictionaries")
    op.drop_table("chinese_dictionaries")
