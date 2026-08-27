"""Build Your Own (lab) — profile, annotations, evaluation, training runs."""

from __future__ import annotations

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.db import Base


class LabProfile(Base):
    __tablename__ = "lab_profile"

    id = Column(String(36), primary_key=True)
    user_key = Column(String(128), nullable=False, index=True)
    display_name = Column(String(128), nullable=False, default="")
    slug = Column(String(80), nullable=False, default="", index=True)
    mode = Column(String(64), nullable=False, default="local_training_first")
    #: "lite" = letters → free_text (skip coverage/checks); "deep" = full flow
    track = Column(String(16), nullable=False, default="deep")

    phase = Column(String(32), nullable=False, default="letters")
    training_status = Column(String(32), nullable=False, default="idle")
    interruption_state = Column(String(32), nullable=False, default="none")
    satisfaction_state = Column(String(32), nullable=False, default="not_started")

    manifest_version = Column(Integer, nullable=False, default=1)
    seed = Column(Integer, nullable=False)
    letters_order_json = Column(Text, nullable=False)
    coverage_words_json = Column(Text, nullable=False)
    coverage_anchor_words_json = Column(Text, nullable=False, default="[]")
    coverage_assist_words_json = Column(Text, nullable=False, default="[]")
    checks_json = Column(Text, nullable=False)

    #: n-gram pattern_key -> color template JSON (manifest v2).
    user_pattern_lexicon_json = Column(Text, nullable=False, default="{}")

    #: When set, the 30 coverage words were taken from this KB vocab (greedy pattern cover).
    coverage_kb_vocab_version_id = Column(String(36), nullable=True)

    #: sha256(normalized_display_name + client IP); unique per name+address, NULL for pre-migration rows.
    lab_participant_key = Column(String(64), nullable=True, unique=True)

    active_checkpoint_uri = Column(String(2048), nullable=True)
    render_seq = Column(Integer, nullable=False, default=0)
    palette_history_json = Column(Text, nullable=False, default="[]")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_active_at = Column(DateTime(timezone=True), nullable=True)

    letters = relationship(
        "LabLetterAnnotation",
        back_populates="profile",
        cascade="all, delete-orphan",
    )
    coverage_words = relationship(
        "LabCoverageWord",
        back_populates="profile",
        cascade="all, delete-orphan",
    )
    checks = relationship(
        "LabEvaluationCheck",
        back_populates="profile",
        cascade="all, delete-orphan",
    )
    training_runs = relationship(
        "LabTrainingRun",
        back_populates="profile",
        cascade="all, delete-orphan",
    )


class LabLetterAnnotation(Base):
    __tablename__ = "lab_letter_annotation"

    id = Column(String(36), primary_key=True)
    profile_id = Column(
        String(36),
        ForeignKey("lab_profile.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    char = Column(String(8), nullable=False)

    lab_l = Column(Float, nullable=False, default=72.0)
    lab_a = Column(Float, nullable=False, default=8.0)
    lab_b = Column(Float, nullable=False, default=-28.0)
    #: Model-space [0,1], same as English annotate SegmentInput.prominence
    prominence = Column(Float, nullable=False, default=0.62)
    #: Model-space [0,1], same as English annotate SegmentInput.spread
    spread = Column(Float, nullable=False, default=0.38)
    color_hex = Column(String(16), nullable=False, default="#4a5dff")
    locked = Column(Integer, nullable=False, default=0)
    annotated = Column(Integer, nullable=False, default=0)
    revision_count = Column(Integer, nullable=False, default=0)
    stability = Column(Float, nullable=False, default=0.0)
    updated_at = Column(DateTime(timezone=True), nullable=True)

    profile = relationship("LabProfile", back_populates="letters")


class LabCoverageWord(Base):
    __tablename__ = "lab_coverage_word"

    id = Column(String(36), primary_key=True)
    profile_id = Column(
        String(36),
        ForeignKey("lab_profile.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    word = Column(String(128), nullable=False)
    #: anchor | assist | legacy (manifest v1)
    coverage_tier = Column(String(16), nullable=False, default="legacy")

    completed = Column(Integer, nullable=False, default=0)
    accepted_prediction = Column(Integer, nullable=False, default=0)
    covered_patterns_json = Column(Text, nullable=False, default="[]")
    manual_adjustments_json = Column(Text, nullable=True)
    revision_count = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), nullable=True)

    profile = relationship("LabProfile", back_populates="coverage_words")


class LabEvaluationCheck(Base):
    __tablename__ = "lab_evaluation_check"

    id = Column(String(36), primary_key=True)
    profile_id = Column(
        String(36),
        ForeignKey("lab_profile.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    check_key = Column(String(32), nullable=False)
    word = Column(String(128), nullable=False)

    status = Column(String(32), nullable=False, default="not_started")
    feedback_text = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)

    profile = relationship("LabProfile", back_populates="checks")


class LabTrainingRun(Base):
    __tablename__ = "lab_training_run"

    id = Column(String(36), primary_key=True)
    profile_id = Column(
        String(36),
        ForeignKey("lab_profile.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status = Column(String(32), nullable=False, default="queued")
    triggered_by = Column(String(64), nullable=False, default="manual")
    train_sample_count = Column(Integer, nullable=False, default=0)
    checkpoint_uri = Column(String(2048), nullable=True)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)

    profile = relationship("LabProfile", back_populates="training_runs")
