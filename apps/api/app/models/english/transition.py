from sqlalchemy import Column, String, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class EnglishTransition(Base):
    __tablename__ = "english_transitions"

    id = Column(String(36), primary_key=True)
    word_instance_id = Column(
        String(36),
        ForeignKey("english_word_instances.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_segment_id = Column(
        String(36),
        ForeignKey("english_segments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_segment_id = Column(
        String(36),
        ForeignKey("english_segments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    strength = Column(Float, nullable=False, default=1.0)
    width = Column(Float, nullable=False, default=0.2)
    falloff = Column(Float, nullable=False, default=0.5)
    curve_json = Column(String(8192), nullable=True)
    blend_mode = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    word_instance = relationship("EnglishWordInstance", back_populates="transitions")
