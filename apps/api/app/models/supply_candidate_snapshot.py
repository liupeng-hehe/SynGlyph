from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.sql import func

from app.db import Base


class SupplyCandidateSnapshot(Base):
    __tablename__ = "supply_candidate_snapshot"

    id = Column(String(36), primary_key=True)
    batch_id = Column(String(36), nullable=False, index=True)
    selected_list_id = Column(String(36), ForeignKey("dataset.id"), nullable=False, index=True)
    word = Column(Text, nullable=False)
    normalized_word = Column(String(512), nullable=False, index=True)
    sources_json = Column(Text, nullable=False, default="[]")
    candidate_payload_json = Column(Text, nullable=False, default="{}")
    excluded = Column(Boolean, nullable=False, default=False)
    exclusion_reason = Column(String(128), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_supply_candidate_list_batch", "selected_list_id", "batch_id"),
    )

