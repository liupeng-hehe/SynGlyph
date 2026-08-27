"""Deployment alias (champion/candidate) per environment — application-enforced single active."""

from sqlalchemy import Column, String, DateTime, Boolean, Text, ForeignKey, Index
from sqlalchemy.sql import func

from app.db import Base


class MLDeployment(Base):
    __tablename__ = "ml_deployment"

    id = Column(String(36), primary_key=True)
    environment = Column(String(32), nullable=False, index=True)
    product_line = Column(String(64), nullable=False, index=True)
    task_name = Column(String(128), nullable=False, index=True)
    alias = Column(String(64), nullable=False, index=True)
    model_snapshot_id = Column(String(36), ForeignKey("model_snapshot.id"), nullable=False, index=True)
    dataset_version_id = Column(String(36), ForeignKey("ml_dataset_version.id"), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default="1")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_ml_deployment_env_product_task_alias", "environment", "product_line", "task_name", "alias"),
    )
