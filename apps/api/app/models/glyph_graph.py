from sqlalchemy import Column, String, Integer, DateTime, Text
from sqlalchemy.sql import func

from app.db import Base


class GlyphGraphRecord(Base):
    """
    One row per lowercase letter a–z: extracted primitive graph + features (JSON).
    UMAP is not used; this is the canonical graph-first export for GNN / similarity tooling.
    """

    __tablename__ = "glyph_graph_record"

    id = Column(String(36), primary_key=True)
    char = Column(String(1), nullable=False, unique=True, index=True)
    payload_json = Column(Text, nullable=False)
    status = Column(String(32), nullable=False, server_default="ready")
    image_width = Column(Integer, nullable=True)
    image_height = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
