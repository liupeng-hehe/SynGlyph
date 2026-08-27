from sqlalchemy import Column, String, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class EnglishSegment(Base):
    __tablename__ = "english_segments"

    id = Column(String(36), primary_key=True)
    word_instance_id = Column(
        String(36),
        ForeignKey("english_word_instances.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sort_order = Column(Integer, nullable=False, default=0)
    label = Column(String(512), nullable=True)
    color_json = Column(String(8192), nullable=False, default="{}")
    transform_json = Column(String(8192), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    word_instance = relationship("EnglishWordInstance", back_populates="segments")
