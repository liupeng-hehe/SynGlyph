"""Read queries for KB Explorer APIs."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    AnalyticsGapSnapshot,
    KbLetterNeighbor,
    KbPattern,
    KbPatternPosition,
    KbSegmentInstance,
    KbSegmentLabel,
    KbSegmentParam,
    KbWord,
    KbWordPattern,
)


def get_pattern_by_key(db: Session, vocab_version_id: str, pattern_key: str) -> KbPattern | None:
    return (
        db.query(KbPattern)
        .filter(KbPattern.vocab_version_id == vocab_version_id, KbPattern.pattern_key == pattern_key)
        .first()
    )


def top_words_for_pattern(
    db: Session,
    vocab_version_id: str,
    pattern_id: str,
    *,
    limit: int = 30,
) -> list[dict[str, Any]]:
    rows = (
        db.query(KbWord.normalized_word, func.sum(KbWordPattern.count_in_word))
        .join(KbWordPattern, KbWordPattern.kb_word_id == KbWord.id)
        .filter(
            KbWord.vocab_version_id == vocab_version_id,
            KbWordPattern.vocab_version_id == vocab_version_id,
            KbWordPattern.pattern_id == pattern_id,
        )
        .group_by(KbWord.id, KbWord.normalized_word)
        .order_by(func.sum(KbWordPattern.count_in_word).desc())
        .limit(limit)
        .all()
    )
    return [{"word": r[0], "hits": int(r[1])} for r in rows]


def pattern_positions(
    db: Session,
    vocab_version_id: str,
    pattern_id: str,
) -> list[dict[str, Any]]:
    rows = (
        db.query(KbPatternPosition)
        .filter(
            KbPatternPosition.vocab_version_id == vocab_version_id,
            KbPatternPosition.pattern_id == pattern_id,
        )
        .order_by(KbPatternPosition.char_index)
        .all()
    )
    return [{"char_index": r.char_index, "count": r.count} for r in rows]


def letter_neighbors(
    db: Session,
    vocab_version_id: str,
    letter: str,
    *,
    side: str,
    limit: int = 40,
) -> list[dict[str, Any]]:
    c = (letter or "").lower()[:1]
    rows = (
        db.query(KbLetterNeighbor)
        .filter(
            KbLetterNeighbor.vocab_version_id == vocab_version_id,
            KbLetterNeighbor.center_letter == c,
            KbLetterNeighbor.side == side,
        )
        .order_by(KbLetterNeighbor.count.desc())
        .limit(limit)
        .all()
    )
    return [{"neighbor": r.neighbor_char, "count": r.count, "pmi": r.pmi} for r in rows]


def segments_for_word(db: Session, vocab_version_id: str, kb_word_id: str) -> list[dict[str, Any]]:
    instances = (
        db.query(KbSegmentInstance)
        .filter(
            KbSegmentInstance.vocab_version_id == vocab_version_id,
            KbSegmentInstance.kb_word_id == kb_word_id,
        )
        .order_by(KbSegmentInstance.span_order)
        .all()
    )
    out: list[dict[str, Any]] = []
    for inst in instances:
        labels = (
            db.query(KbSegmentLabel)
            .filter(KbSegmentLabel.segment_instance_id == inst.id)
            .all()
        )
        params = (
            db.query(KbSegmentParam)
            .filter(KbSegmentParam.segment_instance_id == inst.id)
            .all()
        )
        out.append(
            {
                "id": inst.id,
                "span_order": inst.span_order,
                "span_start": inst.span_start,
                "span_end": inst.span_end,
                "source": inst.source,
                "labels": [{"key": x.label_key, "value": x.label_value} for x in labels],
                "params": [
                    {
                        "key": x.param_key,
                        "value_float": x.param_value_float,
                        "json": json.loads(x.param_json) if x.param_json else None,
                    }
                    for x in params
                ],
            }
        )
    return out


def filter_segments(
    db: Session,
    vocab_version_id: str,
    *,
    normalized_word: str | None = None,
    letter: str | None = None,
    pattern_substr: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    q = db.query(KbSegmentInstance, KbWord).join(KbWord, KbWord.id == KbSegmentInstance.kb_word_id).filter(
        KbSegmentInstance.vocab_version_id == vocab_version_id,
        KbWord.vocab_version_id == vocab_version_id,
    )
    if normalized_word:
        q = q.filter(KbWord.normalized_word == normalized_word.lower().strip())
    rows = q.limit(limit * 5).all()
    out: list[dict[str, Any]] = []
    let = (letter or "").lower()[:1] if letter else None
    ps = (pattern_substr or "").lower() if pattern_substr else None

    for inst, kw in rows:
        if let and let not in (kw.raw_text or "").lower():
            continue
        detail = segments_for_word(db, vocab_version_id, kw.id)
        seg_part = next((x for x in detail if x["id"] == inst.id), None)
        if not seg_part:
            continue
        if ps and ps not in json.dumps(seg_part).lower():
            continue
        out.append(
            {
                "kb_word_id": kw.id,
                "normalized_word": kw.normalized_word,
                "stimulus_id": kw.stimulus_id,
                "segment": seg_part,
            }
        )
        if len(out) >= limit:
            break
    return out


def latest_gap_snapshot(db: Session, vocab_version_id: str) -> dict[str, Any] | None:
    row = (
        db.query(AnalyticsGapSnapshot)
        .filter(AnalyticsGapSnapshot.vocab_version_id == vocab_version_id)
        .order_by(AnalyticsGapSnapshot.computed_at.desc())
        .first()
    )
    if not row:
        return None
    return {"computed_at": row.computed_at.isoformat() if row.computed_at else None, "gap": json.loads(row.gap_json or "{}")}
