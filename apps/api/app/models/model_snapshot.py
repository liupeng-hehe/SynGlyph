from sqlalchemy import Column, String, DateTime, Integer, Float, Text, ForeignKey
from sqlalchemy.sql import func

from app.db import Base

import app.models.ml_dataset_version  # noqa: F401


class ModelSnapshot(Base):
    """User-saved checkpoint metadata (checkpoint file lives on disk at checkpoint_uri)."""

    __tablename__ = "model_snapshot"

    id = Column(String(36), primary_key=True)
    training_run_id = Column(String(36), ForeignKey("training_run.id"), nullable=False, index=True)
    name = Column(String(512), nullable=False)
    checkpoint_uri = Column(String(2048), nullable=False)
    config_json = Column(Text, nullable=False)
    best_val_loss = Column(Float, nullable=True)
    n_samples = Column(Integer, nullable=True)
    n_unique_words = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # Phase 1 lineage (nullable for legacy rows)
    dataset_version_id = Column(String(36), ForeignKey("ml_dataset_version.id"), nullable=True, index=True)
    git_sha = Column(String(64), nullable=True)
    artifact_manifest_uri = Column(String(4096), nullable=True)
    label_schema_version = Column(String(128), nullable=True)
    metrics_json = Column(Text, nullable=True)
    model_family = Column(String(128), nullable=True)
