"""Append-only history for AL component values per stimulus."""

from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, String
from sqlalchemy.sql import func

from app.db import Base


class ALPredictionHistory(Base):
    __tablename__ = "al_prediction_history"

    id = Column(String(36), primary_key=True)
    refresh_batch_id = Column(String(36), nullable=False, index=True)
    selected_list_id = Column(String(36), ForeignKey("dataset.id"), nullable=True, index=True)
    stimulus_id = Column(String(36), ForeignKey("stimulus.id"), nullable=False, index=True)
    model_snapshot_id = Column(String(36), ForeignKey("model_snapshot.id"), nullable=True, index=True)
    scoring_stage = Column(String(64), nullable=False, index=True)
    snapshot_time = Column(DateTime(timezone=True), nullable=False, index=True)
    boundary_uncertainty = Column(Float, nullable=False)
    segment_attribute_uncertainty = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_al_prediction_history_stimulus_time", "stimulus_id", "snapshot_time"),
    )
