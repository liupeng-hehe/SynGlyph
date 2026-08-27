"""Single timed step (train, eval, infer, AL refresh)."""

from sqlalchemy import Column, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.sql import func

from app.db import Base


class EfficiencyObservation(Base):
    __tablename__ = "efficiency_observation"

    id = Column(String(36), primary_key=True)
    step_name = Column(String(64), nullable=False, index=True)
    input_size_json = Column(Text, nullable=True)
    wall_clock_ms = Column(Float, nullable=False)
    throughput = Column(Float, nullable=True)
    baseline_observation_id = Column(String(36), ForeignKey("efficiency_observation.id"), nullable=True)
    improvement_pct = Column(Float, nullable=True)
    training_run_id = Column(String(36), ForeignKey("training_run.id"), nullable=True, index=True)
    git_sha = Column(String(64), nullable=True)
    schema_version = Column(String(32), nullable=False, server_default="efficiency_observation_v1")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
