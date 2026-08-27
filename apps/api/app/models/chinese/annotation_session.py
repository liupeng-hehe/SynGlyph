from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class ChineseAnnotationSession(Base):
    __tablename__ = "chinese_annotation_sessions"

    id = Column(String(36), primary_key=True)
    dictionary_id = Column(
        String(36),
        ForeignKey("chinese_dictionaries.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    dictionary = relationship("ChineseDictionary", back_populates="sessions")
    glyph_instances = relationship(
        "ChineseGlyphInstance",
        back_populates="session",
        cascade="all, delete-orphan",
    )
