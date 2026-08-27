"""KB-derived scores for Active Learning fusion."""

from __future__ import annotations

from typing import Any, Final

from sqlalchemy.orm import Session

from app.config.active_learning import pattern_target_for_unit_type
from app.models import AnalyticsPatternLabeled, AnalyticsSegmentComboLabeled, KbPattern
from app.services.kb_analytics.rebuild import get_active_vocab_version_id
from app.services.kb_analytics.text_units import (
    all_pattern_keys_for_text,
    char_units,
    flatten_pattern_keys,
    pattern_key_prefix_for_unit_type,
)

# Weights for blending deficit across unit types present in the candidate text (sum need not be 1; we normalize).
_KB_PATTERN_GAP_WEIGHTS: Final[dict[str, float]] = {
    "char": 0.28,
    "ngram_2": 0.22,
    "ngram_3": 0.20,
    "ngram_4": 0.18,
    "ngram_5": 0.12,
    "bigram": 0.22,
    "trigram": 0.20,
}


def _deficit_for_type(
    flat: set[str],
    lookup: dict[tuple[str, str], int],
    ut: str,
    prefix: str,
    target: int,
) -> float:
    typed = [pk for pk in flat if pk.startswith(prefix)]
    if not typed:
        return 0.0
    seen = set(typed)
    return (
        sum(max(0.0, float(target - lookup.get((ut, pk), 0)) / float(max(1, target))) for pk in seen)
        / float(len(seen))
    )


def _pattern_labeled_lookup(db: Session, vocab_version_id: str) -> dict[tuple[str, str], int]:
    rows = (
        db.query(KbPattern, AnalyticsPatternLabeled.count_labeled)
        .join(AnalyticsPatternLabeled, AnalyticsPatternLabeled.pattern_id == KbPattern.id)
        .filter(
            KbPattern.vocab_version_id == vocab_version_id,
            AnalyticsPatternLabeled.vocab_version_id == vocab_version_id,
        )
        .all()
    )
    lookup: dict[tuple[str, str], int] = {}
    for p, cnt in rows:
        lookup[(p.unit_type, p.pattern_key)] = int(cnt)
    return lookup


def kb_pattern_gap_score_for_text(
    db: Session,
    text: str,
    vocab_version_id: str,
    *,
    lookup: dict[tuple[str, str], int] | None = None,
) -> float:
    """Blend KB pattern deficits across n-gram orders present in ``text``."""
    keys_by = all_pattern_keys_for_text(text)
    flat: set[str] = set()
    active_units: list[str] = []
    for ut, lst in keys_by.items():
        if not lst:
            continue
        flat.update(lst)
        active_units.append(ut)

    if not flat:
        return 0.0

    if lookup is None:
        lookup = _pattern_labeled_lookup(db, vocab_version_id)

    total_w = sum(_KB_PATTERN_GAP_WEIGHTS.get(ut, 0.1) for ut in active_units)
    if total_w <= 0:
        return 0.0
    acc = 0.0
    for ut in active_units:
        prefix = pattern_key_prefix_for_unit_type(ut)
        if not prefix:
            continue
        tgt = pattern_target_for_unit_type(ut)
        d = _deficit_for_type(flat, lookup, ut, prefix, tgt)
        w = _KB_PATTERN_GAP_WEIGHTS.get(ut, 0.1)
        acc += w * d
    return float(acc / total_w)


def kb_segment_gap_score_for_text(db: Session, text: str, vocab_version_id: str) -> float:
    """Proxy: max deficit over wlen buckets for segment combo rows."""
    ch = char_units(text)
    if not ch:
        return 0.0
    L = min(len(ch), 40)
    rows = (
        db.query(AnalyticsSegmentComboLabeled)
        .filter(AnalyticsSegmentComboLabeled.vocab_version_id == vocab_version_id)
        .all()
    )
    target = 4
    best = 0.0
    for nseg in range(1, 8):
        prefix = f"wlen:{L}|nseg:{nseg}"
        for r in rows:
            if r.combo_key.startswith(prefix):
                cnt = int(r.count_labeled)
                deficit = max(0.0, float(target - cnt)) / float(max(1, target))
                best = max(best, deficit)
    return float(best)


def kb_confirm_need_score_for_text(_db: Session, _text: str, _vocab_version_id: str) -> float:
    return 0.0


def kb_pattern_deficit_detail_for_text(
    text: str,
    *,
    lookup: dict[tuple[str, str], int],
    limit: int = 32,
) -> list[dict[str, Any]]:
    """Per-pattern deficit for keys present in ``text`` (sorted by deficit desc)."""
    keys_by = all_pattern_keys_for_text(text)
    flat_pairs = flatten_pattern_keys(keys_by)
    seen: set[tuple[str, str]] = set()
    rows: list[dict[str, Any]] = []
    for ut, pk in flat_pairs:
        if (ut, pk) in seen:
            continue
        seen.add((ut, pk))
        cnt = int(lookup.get((ut, pk), 0))
        tgt = pattern_target_for_unit_type(ut)
        deficit = max(0.0, float(tgt - cnt)) / float(max(1, tgt))
        rows.append(
            {
                "unit_type": ut,
                "pattern_key": pk,
                "count_labeled": cnt,
                "target": tgt,
                "deficit": round(deficit, 6),
            }
        )
    rows.sort(key=lambda r: (-float(r["deficit"]), r["pattern_key"]))
    return rows[: max(1, min(limit, 256))]


def kb_scores_for_text(
    db: Session,
    text: str,
    *,
    vocab_version_id: str | None = None,
    include_pattern_deficit_detail: bool = False,
    pattern_deficit_detail_limit: int = 32,
) -> dict[str, Any]:
    vid = vocab_version_id or get_active_vocab_version_id(db)
    if not vid:
        return {"kb_active": False, "kb_pattern_gap": None, "kb_segment_gap": None, "kb_confirm_need": None}
    lookup: dict[tuple[str, str], int] | None = None
    if include_pattern_deficit_detail:
        lookup = _pattern_labeled_lookup(db, vid)
    gap = kb_pattern_gap_score_for_text(db, text, vid, lookup=lookup)
    seg = kb_segment_gap_score_for_text(db, text, vid)
    out: dict[str, Any] = {
        "kb_active": True,
        "kb_pattern_gap": gap,
        "kb_segment_gap": seg,
        "kb_confirm_need": kb_confirm_need_score_for_text(db, text, vid),
    }
    if include_pattern_deficit_detail and lookup is not None:
        out["kb_pattern_deficit_detail"] = kb_pattern_deficit_detail_for_text(
            text, lookup=lookup, limit=pattern_deficit_detail_limit
        )
    return out
