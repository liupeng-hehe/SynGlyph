from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, Index
from sqlalchemy.sql import func

from app.db import Base


class OfflineCollocationIndex(Base):
    __tablename__ = "offline_collocation_index"

    id = Column(String(36), primary_key=True)
    version_id = Column(String(36), ForeignKey("offline_index_version.id"), nullable=False, index=True)
    collocation_key = Column(String(256), nullable=False, index=True)
    word = Column(Text, nullable=False)
    normalized_word = Column(String(512), nullable=False, index=True)
    collocation_count = Column(Integer, nullable=False, default=0)
    score = Column(Float, nullable=False, default=0.0)
    source = Column(String(64), nullable=False, default="offline_corpus")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_offline_collocation_version_key", "version_id", "collocation_key"),
        Index("ix_offline_collocation_version_word", "version_id", "normalized_word"),
    )

