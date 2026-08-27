from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class Stimulus(Base):
    __tablename__ = "stimulus"

    id = Column(String(36), primary_key=True)
    dataset_id = Column(String(36), ForeignKey("dataset.id"), nullable=True, index=True)
    text = Column(Text, nullable=False)
    language = Column(String(8), nullable=False)
    source_type = Column(String(32), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # Import/bootstrap features (nullable for existing rows)
    frequency_rank = Column(Integer, nullable=True)
    contextual_diversity = Column(Float, nullable=True)
    char_coverage_score = Column(Float, nullable=True)
    bigram_coverage_score = Column(Float, nullable=True)
    trigram_coverage_score = Column(Float, nullable=True)
    prefix_patterns = Column(Text, nullable=True)  # JSON array as string
    suffix_patterns = Column(Text, nullable=True)  # JSON array as string
    pronunciation_available = Column(Boolean, default=False)
    selected_for_seed = Column(Boolean, default=False)
    pronunciation_cache_json = Column(Text, nullable=True)
    stress_pattern = Column(String(32), nullable=True)
    syllable_count = Column(Integer, nullable=True)
    preprocessing_version = Column(String(64), nullable=True)

    dataset = relationship("Dataset", back_populates="stimuli")
    annotations = relationship("Annotation", back_populates="stimulus")
