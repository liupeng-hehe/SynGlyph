from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class EnglishWordInstance(Base):
    __tablename__ = "english_word_instances"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("english_annotation_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    word_text = Column(String(2048), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    session = relationship("EnglishAnnotationSession", back_populates="word_instances")
    segments = relationship(
        "EnglishSegment",
        back_populates="word_instance",
        cascade="all, delete-orphan",
    )
    transitions = relationship(
        "EnglishTransition",
        back_populates="word_instance",
        cascade="all, delete-orphan",
    )
