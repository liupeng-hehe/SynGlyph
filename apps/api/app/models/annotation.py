from sqlalchemy import Column, String, DateTime, ForeignKey, Float, Integer, Boolean, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class Annotation(Base):
    __tablename__ = "annotation"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("session.id"), nullable=False)
    stimulus_id = Column(String(36), ForeignKey("stimulus.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    subjective_mode = Column(String(32), nullable=True)
    best_color_lab_l = Column(Float, nullable=True)
    best_color_lab_a = Column(Float, nullable=True)
    best_color_lab_b = Column(Float, nullable=True)
    best_color_hex = Column(String(16), nullable=True)
    dominant_letter_idx = Column(Integer, nullable=True)
    accept_or_revise = Column(String(32), nullable=True)
    response_confidence = Column(Float, nullable=True)
    picker_start_hex = Column(String(16), nullable=True)
    picker_moved_flag = Column(Boolean, nullable=True)
    skip_flag = Column(Boolean, nullable=True)
    annotation_extras_json = Column(Text, nullable=True)

    session = relationship("Session", back_populates="annotations")
    stimulus = relationship("Stimulus", back_populates="annotations")
    segmentation = relationship(
        "Segmentation",
        back_populates="annotation",
        uselist=False,
        cascade="all, delete-orphan",
    )
    color_annotations = relationship(
        "ColorAnnotation",
        back_populates="annotation",
        cascade="all, delete-orphan",
    )
