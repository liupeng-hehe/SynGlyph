from sqlalchemy import Column, String, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.db import Base


class Segmentation(Base):
    __tablename__ = "segmentation"

    id = Column(String(36), primary_key=True)
    annotation_id = Column(String(36), ForeignKey("annotation.id"), nullable=False)
    raw_input = Column(Text, nullable=False)
    boundary_influence_json = Column(Text, nullable=True)  # JSON array [0.5, 0.5, ...]

    annotation = relationship("Annotation", back_populates="segmentation")
    spans = relationship(
        "Span",
        back_populates="segmentation",
        order_by="Span.span_order",
        cascade="all, delete-orphan",
    )
