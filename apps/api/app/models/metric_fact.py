"""Narrow metric rows for reporting, dashboards, and resume bullets."""

from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.db import Base


class MetricFact(Base):
    __tablename__ = "metric_fact"

    id = Column(String(36), primary_key=True)
    subject_type = Column(String(32), nullable=False, index=True)
    subject_id = Column(String(64), nullable=False, index=True)
    dataset_version_id = Column(String(36), ForeignKey("ml_dataset_version.id"), nullable=True, index=True)
    model_snapshot_id = Column(String(36), ForeignKey("model_snapshot.id"), nullable=True, index=True)
    baseline_name = Column(String(128), nullable=False, server_default="")
    comparison_kind = Column(String(64), nullable=False, server_default="none", index=True)
    metric_key = Column(String(128), nullable=False, index=True)
    metric_value = Column(Float, nullable=False)
    metric_direction = Column(String(8), nullable=False, server_default="up")
    unit = Column(String(32), nullable=True)
    improvement_pct = Column(Float, nullable=True)
    source_artifact_uri = Column(Text, nullable=True)
    schema_version = Column(String(32), nullable=False, server_default="metric_fact_v1")
    computed_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint(
            "subject_type",
            "subject_id",
            "metric_key",
            "comparison_kind",
            "baseline_name",
            name="uq_metric_fact_subject_metric",
        ),
        Index("ix_metric_fact_dataset_metric", "dataset_version_id", "metric_key"),
    )
