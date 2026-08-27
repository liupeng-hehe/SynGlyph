from sqlalchemy import Column, DateTime, ForeignKey, String, Text, Index
from sqlalchemy.sql import func

from app.db import Base


class OfflineRebuildJob(Base):
    __tablename__ = "offline_rebuild_job"

    id = Column(String(36), primary_key=True)
    status = Column(String(32), nullable=False, default="pending", index=True)
    corpus_name = Column(String(256), nullable=False)
    source_path = Column(Text, nullable=False)
    version_id = Column(String(36), ForeignKey("offline_index_version.id"), nullable=True, index=True)
    message = Column(Text, nullable=True)
    stats_json = Column(Text, nullable=False, default="{}")
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_offline_rebuild_job_status_created", "status", "created_at"),
    )

