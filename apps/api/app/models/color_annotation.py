from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.orm import relationship

from app.db import Base


class ColorAnnotation(Base):
    __tablename__ = "color_annotation"

    id = Column(String(36), primary_key=True)
    annotation_id = Column(String(36), ForeignKey("annotation.id"), nullable=False)
    target_type = Column(String(16), nullable=False)
    span_id = Column(String(36), ForeignKey("span.id"))
    hex_color = Column(String(6), nullable=False)
    color_order = Column(Integer, nullable=False)

    annotation = relationship("Annotation", back_populates="color_annotations")
    span = relationship("Span", back_populates="color_annotations")
