"""Frozen dataset snapshot for reproducible training/eval."""

from sqlalchemy import Column, String, DateTime, Integer, Text, ForeignKey, Index
from sqlalchemy.sql import func

from app.db import Base


class MLDatasetVersion(Base):
    __tablename__ = "ml_dataset_version"

    id = Column(String(36), primary_key=True)
    product_line = Column(String(64), nullable=False, index=True)
    task_name = Column(String(128), nullable=False, index=True)
    source_mode = Column(String(32), nullable=False, server_default="stimulus", index=True)
    schema_version = Column(String(128), nullable=False)
    split_seed = Column(Integer, nullable=False)
    split_strategy = Column(String(128), nullable=False)
    source_cutoff_at = Column(DateTime(timezone=True), nullable=True)
    example_count = Column(Integer, nullable=False, default=0)
    train_count = Column(Integer, nullable=False, default=0)
    val_count = Column(Integer, nullable=False, default=0)
    test_count = Column(Integer, nullable=False, default=0)
    dataset_hash = Column(String(128), nullable=False, index=True)
    manifest_uri = Column(String(4096), nullable=False)
    stats_json = Column(Text, nullable=True)
    git_sha = Column(String(64), nullable=True)
    # Intentionally no FK to training_run (avoids circular create with training_run.dataset_version_id).
    created_by_run_id = Column(String(36), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_ml_dataset_version_product_task", "product_line", "task_name"),
    )
