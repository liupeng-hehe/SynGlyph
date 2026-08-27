from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.db import Base


class UserWordRegistry(Base):
    __tablename__ = "user_word_registry"

    id = Column(String(36), primary_key=True)
    selected_list_id = Column(String(36), ForeignKey("dataset.id"), nullable=False, index=True)
    word = Column(Text, nullable=False)
    normalized_word = Column(String(512), nullable=False)
    source = Column(String(128), nullable=False, default="unknown")
    status = Column(String(32), nullable=False, default="candidate", index=True)
    first_seen_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    selected_at = Column(DateTime(timezone=True), nullable=True)
    annotated_at = Column(DateTime(timezone=True), nullable=True)
    annotation_version = Column(String(128), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("selected_list_id", "normalized_word", name="uq_registry_list_normalized_word"),
        Index("ix_registry_list_status", "selected_list_id", "status"),
        Index("ix_registry_list_annotated_at", "selected_list_id", "annotated_at"),
    )

