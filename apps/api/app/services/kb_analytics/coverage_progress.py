"""KB pattern coverage progress: how much of the high-frequency pattern space is annotated."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.knowledge_base import (
    AnalyticsPatternLabeled,
    KbPattern,
    KbWord,
    KbWordPattern,
)

# How many top patterns to track per unit type
_TOP_N: dict[str, int] = {
    "char": 26,       # all 26 letters
    "ngram_2": 500,
    "ngram_3": 200,
    "bigram": 500,    # legacy alias
    "trigram": 200,   # legacy alias
}

# How many greedy word recommendations to return
_RECOMMEND_LIMIT = 6


def _top_pattern_ids(
    db: Session,
    vocab_version_id: str,
    unit_type: str,
    n: int,
) -> list[str]:
    """Return ids of the top-N patterns by corpus_freq for this unit type."""
    rows = (
        db.query(KbPattern.id)
        .filter(
            KbPattern.vocab_version_id == vocab_version_id,
            KbPattern.unit_type == unit_type,
        )
        .order_by(KbPattern.corpus_freq.desc())
        .limit(n)
        .all()
    )
    return [r[0] for r in rows]


def _labeled_counts(
    db: Session,
    vocab_version_id: str,
    pattern_ids: list[str],
) -> dict[str, int]:
    """Return {pattern_id: count_labeled} for the given ids."""
    if not pattern_ids:
        return {}
    rows = (
        db.query(AnalyticsPatternLabeled.pattern_id, AnalyticsPatternLabeled.count_labeled)
        .filter(
            AnalyticsPatternLabeled.vocab_version_id == vocab_version_id,
            AnalyticsPatternLabeled.pattern_id.in_(pattern_ids),
        )
        .all()
    )
    return {r[0]: int(r[1]) for r in rows}


def _coverage_for_type(
    db: Session,
    vocab_version_id: str,
    unit_type: str,
    top_n: int,
) -> dict[str, Any]:
    ids = _top_pattern_ids(db, vocab_version_id, unit_type, top_n)
    total = len(ids)
    if total == 0:
        return {"covered": 0, "total": 0, "pct": 0.0}
    counts = _labeled_counts(db, vocab_version_id, ids)
    covered = sum(1 for pid in ids if counts.get(pid, 0) >= 1)
    return {
        "covered": covered,
        "total": total,
        "pct": round(covered / total, 4),
        "uncovered_ids": [pid for pid in ids if counts.get(pid, 0) == 0],
    }


def _greedy_word_recommendations(
    db: Session,
    vocab_version_id: str,
    uncovered_ids_by_type: dict[str, list[str]],
) -> list[dict[str, Any]]:
    """Greedy set cover: find words that together cover the most uncovered patterns."""
    all_uncovered: set[str] = set()
    for ids in uncovered_ids_by_type.values():
        all_uncovered.update(ids)

    if not all_uncovered:
        return []

    # For each word, find which uncovered patterns it contains
    rows = (
        db.query(KbWordPattern.kb_word_id, KbWordPattern.pattern_id)
        .filter(
            KbWordPattern.vocab_version_id == vocab_version_id,
            KbWordPattern.pattern_id.in_(list(all_uncovered)),
        )
        .all()
    )

    word_to_patterns: dict[str, set[str]] = {}
    for kb_word_id, pattern_id in rows:
        word_to_patterns.setdefault(kb_word_id, set()).add(pattern_id)

    if not word_to_patterns:
        return []

    # Fetch pattern keys for display
    pattern_keys: dict[str, str] = {}
    if all_uncovered:
        pk_rows = (
            db.query(KbPattern.id, KbPattern.pattern_key, KbPattern.unit_type)
            .filter(KbPattern.id.in_(list(all_uncovered)))
            .all()
        )
        for pid, pkey, utype in pk_rows:
            pattern_keys[pid] = f"{pkey}"

    # Fetch word texts
    word_ids = list(word_to_patterns.keys())
    word_texts: dict[str, str] = {}
    if word_ids:
        wt_rows = (
            db.query(KbWord.id, KbWord.normalized_word, KbWord.rank)
            .filter(
                KbWord.vocab_version_id == vocab_version_id,
                KbWord.id.in_(word_ids),
            )
            .all()
        )
        for wid, nword, rank in wt_rows:
            word_texts[wid] = nword

    # Greedy: iteratively pick the word with max new coverage
    remaining = set(all_uncovered)
    recommendations: list[dict[str, Any]] = []

    for _ in range(_RECOMMEND_LIMIT):
        if not remaining:
            break
        best_id = max(
            word_to_patterns,
            key=lambda wid: len(word_to_patterns[wid] & remaining),
        )
        new_coverage = word_to_patterns[best_id] & remaining
        if not new_coverage:
            break
        recommendations.append(
            {
                "word": word_texts.get(best_id, best_id),
                "new_patterns_covered": len(new_coverage),
                "patterns": [pattern_keys.get(pid, pid) for pid in sorted(new_coverage)],
            }
        )
        remaining -= new_coverage
        del word_to_patterns[best_id]

    return recommendations


def compute_coverage_progress(
    db: Session,
    vocab_version_id: str,
) -> dict[str, Any]:
    """
    Return coverage progress across char / bigram / trigram tiers,
    plus greedy word recommendations for the next annotation session.
    """
    # Detect which unit types actually exist in this vocab version
    unit_types_present = {
        r[0]
        for r in db.query(KbPattern.unit_type)
        .filter(KbPattern.vocab_version_id == vocab_version_id)
        .distinct()
        .all()
    }

    # Canonical tier names — prefer ng2/ng3 but fall back to bigram/trigram
    def _pick_unit_type(canonical: str, legacy: str) -> str | None:
        if canonical in unit_types_present:
            return canonical
        if legacy in unit_types_present:
            return legacy
        return None

    char_type = "char" if "char" in unit_types_present else None
    bi_type = _pick_unit_type("ngram_2", "bigram")
    tri_type = _pick_unit_type("ngram_3", "trigram")

    def _cov(ut: str | None, n: int) -> dict[str, Any] | None:
        if ut is None:
            return None
        return _coverage_for_type(db, vocab_version_id, ut, n)

    char_cov = _cov(char_type, _TOP_N["char"])
    bi_cov = _cov(bi_type, _TOP_N["ngram_2"])
    tri_cov = _cov(tri_type, _TOP_N["ngram_3"])

    uncovered_by_type: dict[str, list[str]] = {}
    if char_cov:
        uncovered_by_type["char"] = char_cov.pop("uncovered_ids", [])
    if bi_cov:
        uncovered_by_type["bi"] = bi_cov.pop("uncovered_ids", [])
    if tri_cov:
        uncovered_by_type["tri"] = tri_cov.pop("uncovered_ids", [])

    recommendations = _greedy_word_recommendations(db, vocab_version_id, uncovered_by_type)

    return {
        "vocab_version_id": vocab_version_id,
        "char_coverage": char_cov,
        "bigram_coverage": bi_cov,
        "trigram_coverage": tri_cov,
        "next_recommended": recommendations,
    }
