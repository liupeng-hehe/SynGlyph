from sqlalchemy import Column, String, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class ChineseTransition(Base):
    __tablename__ = "chinese_transitions"

    id = Column(String(36), primary_key=True)
    glyph_instance_id = Column(
        String(36),
        ForeignKey("chinese_glyph_instances.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_region_id = Column(
        String(36),
        ForeignKey("chinese_regions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_region_id = Column(
        String(36),
        ForeignKey("chinese_regions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    mode = Column(String(32), nullable=False, default="directed_flow")
    strength = Column(Float, nullable=False, default=1.0)
    width = Column(Float, nullable=False, default=0.25)
    falloff = Column(Float, nullable=False, default=0.5)
    curve_json = Column(String(8192), nullable=True)
    blend_mode = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    glyph_instance = relationship("ChineseGlyphInstance", back_populates="transitions")
