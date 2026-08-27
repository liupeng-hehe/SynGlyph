from sqlalchemy import Column, String, Integer, Float, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship

from app.db import Base


class Span(Base):
    __tablename__ = "span"

    id = Column(String(36), primary_key=True)
    segmentation_id = Column(String(36), ForeignKey("segmentation.id"), nullable=False)
    span_text = Column(Text, nullable=False)
    span_order = Column(Integer, nullable=False)
    # LAB color: L* [0,100], a* [-128,127], b* [-128,127]
    color_lab_l = Column(Float, default=50.0)
    color_lab_a = Column(Float, default=0.0)
    color_lab_b = Column(Float, default=0.0)
    prominence = Column(Float, default=0.5)  # [0,1]
    spread = Column(Float, default=0.5)  # [0,1]
    syllable_idx = Column(Integer, nullable=True)
    is_in_stressed_syllable = Column(Boolean, nullable=True)
    is_stressed_nucleus = Column(Boolean, nullable=True)
    char_role_in_syllable = Column(String(16), nullable=True)

    segmentation = relationship("Segmentation", back_populates="spans")
    color_annotations = relationship(
        "ColorAnnotation",
        back_populates="span",
        cascade="all, delete-orphan",
    )
