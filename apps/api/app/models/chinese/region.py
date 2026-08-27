from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class ChineseRegion(Base):
    __tablename__ = "chinese_regions"

    id = Column(String(36), primary_key=True)
    glyph_instance_id = Column(
        String(36),
        ForeignKey("chinese_glyph_instances.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(512), nullable=False, default="region")
    label = Column(String(512), nullable=True)
    selection_mode = Column(String(32), nullable=False)
    selection_json = Column(String(16384), nullable=True)
    stroke_ids_json = Column(String(8192), nullable=True)
    polygon_json = Column(String(16384), nullable=True)
    anchor_json = Column(String(4096), nullable=False, default="{}")
    color_json = Column(String(8192), nullable=False, default="{}")
    spread_json = Column(String(4096), nullable=False, default="{}")
    intensity = Column(Float, nullable=False, default=1.0)
    z_index = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    glyph_instance = relationship("ChineseGlyphInstance", back_populates="regions")
