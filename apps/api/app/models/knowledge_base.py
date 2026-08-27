"""Queryable vocabulary KB: segment annotations, patterns, neighbors, analytics."""

from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class KbVocabVersion(Base):
    __tablename__ = "kb_vocab_version"

    id = Column(String(36), primary_key=True)
    label = Column(String(128), nullable=False)
    source = Column(String(512), nullable=True)
    word_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_active = Column(Boolean, nullable=False, default=False)
    stats_json = Column(Text, nullable=True)
    # Orthographic-prior snapshot provenance (see kb_lexicon ingest)
    source_kind = Column(String(64), nullable=True)
    source_name = Column(String(256), nullable=True)
    source_ref = Column(String(512), nullable=True)
    import_config_json = Column(Text, nullable=True)
    import_summary_json = Column(Text, nullable=True)

    words = relationship("KbWord", back_populates="vocab_version", cascade="all, delete-orphan")


class KbWord(Base):
    __tablename__ = "kb_word"

    id = Column(String(36), primary_key=True)
    vocab_version_id = Column(String(36), ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False, index=True)
    normalized_word = Column(String(512), nullable=False, index=True)
    raw_text = Column(Text, nullable=False)
    stimulus_id = Column(String(36), ForeignKey("stimulus.id", ondelete="SET NULL"), nullable=True, index=True)
    rank = Column(Integer, nullable=True)
    length = Column(Integer, nullable=False, default=0)

    vocab_version = relationship("KbVocabVersion", back_populates="words")
    segment_instances = relationship("KbSegmentInstance", back_populates="kb_word", cascade="all, delete-orphan")
    word_patterns = relationship("KbWordPattern", back_populates="kb_word", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("vocab_version_id", "normalized_word", name="uq_kb_word_vocab_norm"),)


class KbPattern(Base):
    __tablename__ = "kb_pattern"

    id = Column(String(36), primary_key=True)
    vocab_version_id = Column(String(36), ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False, index=True)
    unit_type = Column(String(32), nullable=False)
    pattern_key = Column(String(256), nullable=False)
    corpus_freq = Column(Integer, nullable=False, default=0)

    __table_args__ = (UniqueConstraint("vocab_version_id", "unit_type", "pattern_key", name="uq_kb_pattern_key"),)


class KbWordPattern(Base):
    __tablename__ = "kb_word_pattern"

    id = Column(String(36), primary_key=True)
    vocab_version_id = Column(String(36), ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False, index=True)
    kb_word_id = Column(String(36), ForeignKey("kb_word.id", ondelete="CASCADE"), nullable=False, index=True)
    pattern_id = Column(String(36), ForeignKey("kb_pattern.id", ondelete="CASCADE"), nullable=False, index=True)
    positions_json = Column(Text, nullable=False, default="[]")
    count_in_word = Column(Integer, nullable=False, default=1)

    kb_word = relationship("KbWord", back_populates="word_patterns")
    pattern = relationship("KbPattern")


class KbLetterNeighbor(Base):
    __tablename__ = "kb_letter_neighbor"

    id = Column(String(36), primary_key=True)
    vocab_version_id = Column(String(36), ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False, index=True)
    center_letter = Column(String(8), nullable=False)
    side = Column(String(8), nullable=False)
    neighbor_char = Column(String(8), nullable=False)
    count = Column(Integer, nullable=False, default=0)
    pmi = Column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "vocab_version_id",
            "center_letter",
            "side",
            "neighbor_char",
            name="uq_kb_neighbor",
        ),
    )


class KbPatternPosition(Base):
    __tablename__ = "kb_pattern_position"

    id = Column(String(36), primary_key=True)
    vocab_version_id = Column(String(36), ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False, index=True)
    pattern_id = Column(String(36), ForeignKey("kb_pattern.id", ondelete="CASCADE"), nullable=False, index=True)
    char_index = Column(Integer, nullable=False)
    count = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint(
            "vocab_version_id",
            "pattern_id",
            "char_index",
            name="uq_kb_pattern_pos",
        ),
    )


class KbSegmentInstance(Base):
    __tablename__ = "kb_segment_instance"

    id = Column(String(36), primary_key=True)
    vocab_version_id = Column(String(36), ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False, index=True)
    kb_word_id = Column(String(36), ForeignKey("kb_word.id", ondelete="CASCADE"), nullable=False, index=True)
    span_start = Column(Integer, nullable=False)
    span_end = Column(Integer, nullable=False)
    span_order = Column(Integer, nullable=False, default=0)
    text_span = Column(Text, nullable=True)
    source = Column(String(32), nullable=False, default="gold")
    model_snapshot_id = Column(String(36), ForeignKey("model_snapshot.id", ondelete="SET NULL"), nullable=True)
    confidence_json = Column(Text, nullable=True)

    kb_word = relationship("KbWord", back_populates="segment_instances")
    labels = relationship("KbSegmentLabel", back_populates="segment_instance", cascade="all, delete-orphan")
    params = relationship("KbSegmentParam", back_populates="segment_instance", cascade="all, delete-orphan")


class KbSegmentLabel(Base):
    __tablename__ = "kb_segment_label"

    id = Column(String(36), primary_key=True)
    segment_instance_id = Column(
        String(36),
        ForeignKey("kb_segment_instance.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label_key = Column(String(128), nullable=False)
    label_value = Column(Text, nullable=True)

    segment_instance = relationship("KbSegmentInstance", back_populates="labels")


class KbSegmentParam(Base):
    __tablename__ = "kb_segment_param"

    id = Column(String(36), primary_key=True)
    segment_instance_id = Column(
        String(36),
        ForeignKey("kb_segment_instance.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    param_key = Column(String(128), nullable=False)
    param_value_float = Column(Float, nullable=True)
    param_json = Column(Text, nullable=True)

    segment_instance = relationship("KbSegmentInstance", back_populates="params")


class AnalyticsPatternLabeled(Base):
    __tablename__ = "analytics_pattern_labeled"

    id = Column(String(36), primary_key=True)
    vocab_version_id = Column(String(36), ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False, index=True)
    pattern_id = Column(String(36), ForeignKey("kb_pattern.id", ondelete="CASCADE"), nullable=False, index=True)
    count_labeled = Column(Integer, nullable=False, default=0)
    target = Column(Integer, nullable=True)


class AnalyticsSegmentComboLabeled(Base):
    __tablename__ = "analytics_segment_combo_labeled"

    id = Column(String(36), primary_key=True)
    vocab_version_id = Column(String(36), ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False, index=True)
    combo_key = Column(String(512), nullable=False, index=True)
    count_labeled = Column(Integer, nullable=False, default=0)
    variance_lab = Column(Float, nullable=True)

    __table_args__ = (UniqueConstraint("vocab_version_id", "combo_key", name="uq_kb_segcombo"),)


class AnalyticsGapSnapshot(Base):
    __tablename__ = "analytics_gap_snapshot"

    id = Column(String(36), primary_key=True)
    vocab_version_id = Column(String(36), ForeignKey("kb_vocab_version.id", ondelete="CASCADE"), nullable=False, index=True)
    computed_at = Column(DateTime(timezone=True), server_default=func.now())
    gap_json = Column(Text, nullable=False, default="{}")
