from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class ChineseGlyphInstance(Base):
    __tablename__ = "chinese_glyph_instances"

    id = Column(String(36), primary_key=True)
    session_id = Column(
        String(36),
        ForeignKey("chinese_annotation_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    template_id = Column(
        String(36),
        ForeignKey("chinese_glyph_templates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    character = Column(String(8), nullable=False, index=True)
    transform_json = Column(String(8192), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    session = relationship("ChineseAnnotationSession", back_populates="glyph_instances")
    template = relationship("ChineseGlyphTemplate", back_populates="instances")
    regions = relationship(
        "ChineseRegion",
        back_populates="glyph_instance",
        cascade="all, delete-orphan",
    )
    transitions = relationship(
        "ChineseTransition",
        back_populates="glyph_instance",
        cascade="all, delete-orphan",
    )
