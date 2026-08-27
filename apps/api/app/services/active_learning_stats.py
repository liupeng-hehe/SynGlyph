"""Statistics helpers for novelty / coverage / instability in AL v1."""

from __future__ import annotations

from collections import Counter
from typing import Iterable

from sqlalchemy.orm import Session

from app.models import Annotation, Stimulus

from letter_sequence.al.text_stats import (
    build_unit_counts_from_texts,
    coverage_gain_score,
    instability_score,
    segment_novelty_score,
)


def build_labeled_unit_counts(db: Session) -> dict[str, Counter[str]]:
    rows = db.query(Stimulus.text).join(Annotation, Annotation.stimulus_id == Stimulus.id).distinct().all()
    texts = [t for (t,) in rows if t]
    return build_unit_counts_from_texts(texts)


__all__ = [
    "build_labeled_unit_counts",
    "coverage_gain_score",
    "instability_score",
    "segment_novelty_score",
]
