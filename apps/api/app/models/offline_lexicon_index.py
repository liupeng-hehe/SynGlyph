from sqlalchemy import Column, DateTime, Float, ForeignKey, String, Text, Index
from sqlalchemy.sql import func

from app.db import Base


class OfflineLexiconIndex(Base):
    __tablename__ = "offline_lexicon_index"

    id = Column(String(36), primary_key=True)
    version_id = Column(String(36), ForeignKey("offline_index_version.id"), nullable=False, index=True)
    word = Column(Text, nullable=False)
    normalized_word = Column(String(512), nullable=False, index=True)
    lemma = Column(String(512), nullable=True)
    pos = Column(String(64), nullable=True)
    zipf_frequency = Column(Float, nullable=True)
    global_score = Column(Float, nullable=False, default=0.0)
    metadata_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_offline_lexicon_version_word", "version_id", "normalized_word"),
    )

