from sqlalchemy import Column, String, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class ChineseGlyphTemplate(Base):
    __tablename__ = "chinese_glyph_templates"

    id = Column(String(36), primary_key=True)
    character = Column(String(8), nullable=False, unique=True, index=True)
    decomposition_json = Column(String(8192), nullable=True)
    matches_json = Column(String(8192), nullable=True)
    strokes_json = Column(String(65536), nullable=False)
    medians_json = Column(String(65536), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    instances = relationship("ChineseGlyphInstance", back_populates="template")
