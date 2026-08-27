"""Syllable / stress–pattern signals for active learning (lightweight, best-effort)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.model_review_feedback import ModelReviewFeedback
from app.models.stimulus import Stimulus


def stress_pattern_for_text(word: str) -> tuple[str, int, float]:
    """
    Returns (stress_pattern, syllable_count, parse_confidence).
    On any failure returns ("", 0, 0.0).
    """
    try:
        from letter_sequence.phonology import enrich_word

        o = enrich_word("".join(c for c in word.lower() if c.isalpha()))
        return (o.stress_pattern or "", int(o.syllable_count or 0), float(o.pronunciation_confidence or 0.0))
    except Exception:
        return ("", 0, 0.0)


def syllable_novelty_for_batch(
    db: Session,
    texts: list[str],
    seen_in_session: set[str],
) -> list[float]:
    """
    Per-candidate score in [0,1]: prefer stress patterns rarely seen in ``stimulus.stress_pattern``.
    """
    out: list[float] = []
    for t in texts:
        pat, _n, conf = stress_pattern_for_text(t)
        if not pat:
            out.append(0.0)
            continue
        try:
            cnt = (
                db.query(Stimulus)
                .filter(Stimulus.stress_pattern == pat)
                .count()
            )
        except Exception:
            cnt = 0
        rarity = 1.0 / (1.0 + float(cnt))
        fresh = 1.0 if pat not in seen_in_session else 0.35
        seen_in_session.add(pat)
        out.append(min(1.0, rarity * fresh * max(0.15, conf)))
    return out


def historical_feedback_risk(db: Session, *, limit_rows: int = 2000) -> float:
    """Aggregate mean |lab| delta from recent review feedback (0 if none)."""
    try:
        q = (
            db.query(ModelReviewFeedback)
            .order_by(ModelReviewFeedback.created_at.desc())
            .limit(limit_rows)
        )
        rows = q.all()
        if not rows:
            return 0.0
        s = 0.0
        n = 0
        for r in rows:
            v = getattr(r, "lab_delta_mean", None)
            if v is not None:
                s += abs(float(v))
                n += 1
        return s / max(n, 1) if n else 0.0
    except Exception:
        return 0.0


def slice_report_stubs() -> dict[str, Any]:
    """Placeholder for slice-level AL reporting (filled by offline jobs)."""
    return {
        "first_syllable_stress": None,
        "later_syllable_stress": None,
        "mono_color_mode": None,
        "fine_grained_mode": None,
    }
