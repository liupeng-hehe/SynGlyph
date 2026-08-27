"""Offline evaluation of a model snapshot on a frozen dataset version."""

from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Index
from sqlalchemy.sql import func

from app.db import Base


class MLEvaluationRun(Base):
    __tablename__ = "ml_evaluation_run"

    id = Column(String(36), primary_key=True)
    product_line = Column(String(64), nullable=False, index=True)
    task_name = Column(String(128), nullable=False, index=True)
    dataset_version_id = Column(String(36), ForeignKey("ml_dataset_version.id"), nullable=False, index=True)
    model_snapshot_id = Column(String(36), ForeignKey("model_snapshot.id"), nullable=False, index=True)
    split_name = Column(String(32), nullable=False)
    metrics_json = Column(Text, nullable=False)
    eval_config_json = Column(Text, nullable=True)
    artifact_uri = Column(String(4096), nullable=True)
    git_sha = Column(String(64), nullable=True)
    status = Column(String(32), nullable=False, server_default="completed")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_ml_eval_snapshot_dataset", "model_snapshot_id", "dataset_version_id"),
    )
