"""Persisted model evaluation / correction records for text-reveal review."""

from sqlalchemy import Boolean, Column, Float, Integer, String, DateTime, Text, Index
from sqlalchemy.sql import func

from app.db import Base


class ModelReviewFeedback(Base):
    """Full JSON payload mirrors the frontend ModelFeedbackRecord shape (camelCase in JSON)."""

    __tablename__ = "model_review_feedback"

    id = Column(String(36), primary_key=True)
    checkpoint_id = Column(String(512), nullable=False, default="", index=True)
    full_text = Column(Text, nullable=False)
    record_json = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=True, onupdate=func.now())
    # Typed summary (Phase 1); nullable for legacy rows
    span_start = Column(Integer, nullable=True)
    span_end = Column(Integer, nullable=True)
    span_key = Column(String(512), nullable=True, index=True)
    feedback_type = Column(String(64), nullable=True)
    severity = Column(String(32), nullable=True)
    lab_delta_mean = Column(Float, nullable=True)
    prom_delta_mean = Column(Float, nullable=True)
    spr_delta_mean = Column(Float, nullable=True)
    boundary_edit_count = Column(Integer, nullable=True)
    is_retrain_eligible = Column(Boolean, nullable=False, server_default="0")
    schema_version = Column(String(64), nullable=False, server_default="review_feedback_v1")

    __table_args__ = (Index("ix_model_review_feedback_checkpoint_text", "checkpoint_id", "full_text"),)

