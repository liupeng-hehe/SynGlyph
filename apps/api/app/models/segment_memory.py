from sqlalchemy import Column, String, Integer, Float, DateTime, Text
from sqlalchemy.sql import func

from app.db import Base


class SegmentMemory(Base):
    __tablename__ = "segment_memory"

    id = Column(String(36), primary_key=True)
    segment_text = Column(Text, nullable=False, index=True)
    count = Column(Integer, nullable=False, default=0)
    prefix_count = Column(Integer, nullable=False, default=0)
    middle_count = Column(Integer, nullable=False, default=0)
    suffix_count = Column(Integer, nullable=False, default=0)
    avg_l = Column(Float, default=50.0)
    avg_a = Column(Float, default=0.0)
    avg_b = Column(Float, default=0.0)
    avg_prominence = Column(Float, default=0.5)
    avg_spread = Column(Float, default=0.5)
    example_words = Column(Text, nullable=True)  # JSON array as string, e.g. '["distance","discovery"]'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
