"""Rolling human-in-the-loop workflow KPIs for a time window."""

from sqlalchemy import Column, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.sql import func

from app.db import Base


class WorkflowMetricsSnapshot(Base):
    __tablename__ = "workflow_metrics_snapshot"

    id = Column(String(36), primary_key=True)
    window_start = Column(DateTime(timezone=True), nullable=False)
    window_end = Column(DateTime(timezone=True), nullable=False)
    selected_list_id = Column(String(36), nullable=True, index=True)
    model_snapshot_id = Column(String(36), ForeignKey("model_snapshot.id"), nullable=True, index=True)
    accept_rate = Column(Float, nullable=True)
    reject_rate = Column(Float, nullable=True)
    minor_edit_rate = Column(Float, nullable=True)
    correction_magnitude_mean = Column(Float, nullable=True)
    mean_boundary_edits = Column(Float, nullable=True)
    annotation_time_mean_sec = Column(Float, nullable=True)
    review_time_mean_sec = Column(Float, nullable=True)
    queue_hit_rate = Column(Float, nullable=True)
    al_gain_estimate = Column(Float, nullable=True)
    throughput_samples_per_hour = Column(Float, nullable=True)
    n_feedback_rows = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    schema_version = Column(String(32), nullable=False, server_default="workflow_snapshot_v1")
    computed_at = Column(DateTime(timezone=True), server_default=func.now())
