from sqlalchemy import Boolean, Column, DateTime, String, Text, Index
from sqlalchemy.sql import func

from app.db import Base


class OfflineIndexVersion(Base):
    __tablename__ = "offline_index_version"

    id = Column(String(36), primary_key=True)
    version = Column(String(128), nullable=False, unique=True, index=True)
    corpus_name = Column(String(256), nullable=False)
    is_active = Column(Boolean, nullable=False, default=False, index=True)
    status = Column(String(32), nullable=False, default="built", index=True)
    stats_json = Column(Text, nullable=False, default="{}")
    built_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    activated_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_offline_index_version_active_status", "is_active", "status"),
    )

