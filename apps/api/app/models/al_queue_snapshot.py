"""Persisted Active Learning queue rows for a refresh batch."""

from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.sql import func

from app.db import Base


class ALQueueSnapshot(Base):
    __tablename__ = "al_queue_snapshot"

    id = Column(String(36), primary_key=True)
    refresh_batch_id = Column(String(36), nullable=False, index=True)
    selected_list_id = Column(String(36), ForeignKey("dataset.id"), nullable=True, index=True)
    stimulus_id = Column(String(36), ForeignKey("stimulus.id"), nullable=False, index=True)
    text = Column(Text, nullable=False)
    rank = Column(Integer, nullable=False, index=True)
    score = Column(Float, nullable=False)
    boundary_uncertainty = Column(Float, nullable=False)
    segment_attribute_uncertainty = Column(Float, nullable=False)
    segment_novelty = Column(Float, nullable=False)
    coverage_gain = Column(Float, nullable=False)
    instability = Column(Float, nullable=False)
    score_raw_json = Column(Text, nullable=False)
    score_norm_json = Column(Text, nullable=False)
    model_snapshot_id = Column(String(36), ForeignKey("model_snapshot.id"), nullable=True, index=True)
    scoring_stage = Column(String(64), nullable=False, index=True)
    snapshot_time = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_al_queue_snapshot_batch_rank", "refresh_batch_id", "rank"),
        Index("ix_al_queue_snapshot_snapshot_time_rank", "snapshot_time", "rank"),
    )
