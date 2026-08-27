from sqlalchemy import Column, String, DateTime, Integer, Float, Text, ForeignKey
from sqlalchemy.sql import func

from app.db import Base

# Register ml_dataset_version before ForeignKey resolution (direct imports of TrainingRun only).
import app.models.ml_dataset_version  # noqa: F401


class TrainingRun(Base):
    """Letter-sequence (or future) training job backed by data/training_runs/<id>/."""

    __tablename__ = "training_run"

    id = Column(String(36), primary_key=True)
    status = Column(String(32), nullable=False, index=True)  # idle, running, finished, failed, stopped
    # Older local DBs used `mode` NOT NULL; keep mapped so INSERT satisfies SQLite constraints.
    mode = Column(String(32), nullable=False, default="letter_sequence")
    dataset_id = Column(String(36), nullable=True, index=True)
    config_json = Column(Text, nullable=False)  # full submitted config
    out_dir = Column(String(1024), nullable=False)  # absolute path to run directory
    # Legacy prototype columns (nullable); may exist alongside out_dir / config_json
    checkpoint_uri = Column(String(2048), nullable=True)
    run_message = Column("message", Text, nullable=True)
    model_version = Column(String(64), nullable=True)
    current_epoch = Column(Integer, nullable=True)
    process_pid = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)
    best_val_loss = Column(Float, nullable=True)
    n_samples = Column(Integer, nullable=True)
    n_unique_words = Column(Integer, nullable=True)
    dataset_version_id = Column(String(36), ForeignKey("ml_dataset_version.id"), nullable=True, index=True)
    git_sha = Column(String(64), nullable=True)
