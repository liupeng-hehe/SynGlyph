"""Read-only Knowledge Base Explorer API."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import KbPattern, KbVocabVersion, KbWord
from app.services.kb_analytics.coverage_progress import compute_coverage_progress
from app.services.kb_analytics.queries import (
    filter_segments,
    latest_gap_snapshot,
    letter_neighbors,
    pattern_positions,
    segments_for_word,
    top_words_for_pattern,
)
from app.services.kb_analytics.rebuild import get_active_vocab_version_id
from app.services.kb_top_pattern_words import top_words_by_pattern_count_data
from app.services.kb_analytics.text_units import candidate_pattern_keys
from app.services.pattern_supply.normalization import normalize_word

router = APIRouter(prefix="/api/kb", tags=["knowledge-base"])


def _resolve_vid(db: Session, vocab_version_id: str | None) -> str:
    vid = vocab_version_id or get_active_vocab_version_id(db)
    if not vid:
        raise HTTPException(status_code=404, detail="No KB vocab version (build one via POST /api/kb/catalog/rebuild).")
    row = db.query(KbVocabVersion).filter(KbVocabVersion.id == vid).first()
    if not row:
        raise HTTPException(status_code=404, detail="kb_vocab_version not found")
    return vid


@router.get("/catalog/versions")
def list_versions(db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = db.query(KbVocabVersion).order_by(KbVocabVersion.created_at.desc()).limit(50).all()
    return {
        "items": [
            {
                "id": r.id,
                "label": r.label,
                "word_count": r.word_count,
                "is_active": r.is_active,
                "source_kind": r.source_kind,
                "source_name": r.source_name,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }


@router.get("/{vocab_version_id}/patterns")
def list_patterns(
    vocab_version_id: str,
    unit_type: str = Query(..., description="e.g. ngram_2, ngram_3, ngram_4, char"),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    vid = _resolve_vid(db, vocab_version_id)
    rows = (
        db.query(KbPattern)
        .filter(KbPattern.vocab_version_id == vid, KbPattern.unit_type == unit_type)
        .order_by(KbPattern.corpus_freq.desc())
        .limit(limit)
        .all()
    )
    return {
        "unit_type": unit_type,
        "items": [
            {"id": r.id, "pattern_key": r.pattern_key, "corpus_freq": r.corpus_freq}
            for r in rows
        ],
    }


@router.get("/{vocab_version_id}/patterns/{pattern_key}/top-words")
def pattern_top_words(
    vocab_version_id: str,
    pattern_key: str,
    limit: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    vid = _resolve_vid(db, vocab_version_id)
    pat = None
    for candidate in candidate_pattern_keys(pattern_key):
        pat = db.query(KbPattern).filter(KbPattern.vocab_version_id == vid, KbPattern.pattern_key == candidate).first()
        if pat:
            break
    if not pat:
        raise HTTPException(status_code=404, detail="pattern not found in this version")
    return {
        "pattern": {"id": pat.id, "unit_type": pat.unit_type, "pattern_key": pat.pattern_key, "corpus_freq": pat.corpus_freq},
        "top_words": top_words_for_pattern(db, vid, pat.id, limit=limit),
    }


@router.get("/{vocab_version_id}/patterns/{pattern_key}/positions")
def pattern_positions_ep(
    vocab_version_id: str,
    pattern_key: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    vid = _resolve_vid(db, vocab_version_id)
    pat = None
    for candidate in candidate_pattern_keys(pattern_key):
        pat = db.query(KbPattern).filter(KbPattern.vocab_version_id == vid, KbPattern.pattern_key == candidate).first()
        if pat:
            break
    if not pat:
        raise HTTPException(status_code=404, detail="pattern not found")
    return {"positions": pattern_positions(db, vid, pat.id)}


@router.get("/{vocab_version_id}/neighbors/letter/{letter}")
def neighbors_for_letter(
    vocab_version_id: str,
    letter: str,
    side: str = Query("right", pattern="^(left|right)$"),
    limit: int = Query(30, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    vid = _resolve_vid(db, vocab_version_id)
    return {"letter": letter[:1], "side": side, "neighbors": letter_neighbors(db, vid, letter, side=side, limit=limit)}


@router.get("/{vocab_version_id}/words/{kb_word_id}/segments")
def word_segments(
    vocab_version_id: str,
    kb_word_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    vid = _resolve_vid(db, vocab_version_id)
    w = db.query(KbWord).filter(KbWord.id == kb_word_id, KbWord.vocab_version_id == vid).first()
    if not w:
        raise HTTPException(status_code=404, detail="kb_word not found")
    return {
        "word": {
            "id": w.id,
            "normalized_word": w.normalized_word,
            "raw_text": w.raw_text,
            "stimulus_id": w.stimulus_id,
        },
        "segments": segments_for_word(db, vid, kb_word_id),
    }


@router.get("/{vocab_version_id}/segments")
def segments_filter(
    vocab_version_id: str,
    word: str | None = None,
    letter: str | None = None,
    pattern: str | None = None,
    limit: int = Query(40, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    vid = _resolve_vid(db, vocab_version_id)
    nw = normalize_word(word) if word else None
    return {
        "items": filter_segments(
            db,
            vid,
            normalized_word=nw,
            letter=letter,
            pattern_substr=pattern,
            limit=limit,
        )
    }


@router.get("/active/coverage-progress")
def active_coverage_progress(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Coverage progress for the active KB version (no version ID required)."""
    vid = get_active_vocab_version_id(db)
    if not vid:
        raise HTTPException(status_code=404, detail="No active KB vocab version found.")
    return compute_coverage_progress(db, vid)


@router.get("/{vocab_version_id}/analytics/coverage-progress")
def coverage_progress(vocab_version_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Coverage progress: how much of top-N char/bigram/trigram space is annotated."""
    vid = _resolve_vid(db, vocab_version_id)
    return compute_coverage_progress(db, vid)


@router.get("/{vocab_version_id}/analytics/coverage-gaps")
def coverage_gaps(vocab_version_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    vid = _resolve_vid(db, vocab_version_id)
    snap = latest_gap_snapshot(db, vid)
    if not snap:
        return {"gap": None, "detail": "Run rebuild to compute gaps"}
    return snap


class OnlineHybridOptions(BaseModel):
    random_rounds: int = Field(3, ge=1, le=50)
    random_per_round: int = Field(50, ge=1, le=100)
    length_buckets: list[int | None] | None = None
    datamuse_queries: list[dict[str, Any]] | None = None
    datamuse_max_per_query: int = Field(200, ge=1, le=1000)
    seed_enrichment_count: int = Field(0, ge=0, le=500)
    seed_enrichment_max_per_seed: int = Field(40, ge=1, le=500)
    target_words: int = Field(0, ge=0, le=50000)


class RebuildKbRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=128, description="Human-readable label for this KB version")
    set_active: bool = True
    mode: Literal["stimuli", "lexicon_text", "online_hybrid", "lexicon_file", "builtin_wordfreq", "api_cached"] = (
        "stimuli"
    )
    max_words: int | None = Field(
        300,
        description="Cap stimuli before dedupe. Use null for no cap (full dataset / selected list).",
    )
    dataset_id: str | None = None
    lexicon_text: str | None = Field(None, description="Newline-separated words when mode=lexicon_text")
    lexicon_file: str | None = Field(None, description="Server filesystem path when mode=lexicon_file")
    api_cached_file: str | None = Field(None, description="Server path to cached API JSON when mode=api_cached")
    builtin_wordfreq_limit: int = Field(5000, ge=50, le=100_000)
    online_hybrid: OnlineHybridOptions | None = None

    @field_validator("max_words")
    @classmethod
    def _max_words_bounds(cls, v: int | None) -> int | None:
        if v is None:
            return None
        if v < 1 or v > 20000:
            raise ValueError("max_words must be between 1 and 20000, or null for no cap")
        return v

    @model_validator(mode="after")
    def _validate_mode_payload(self) -> RebuildKbRequest:
        if self.mode == "lexicon_text":
            if not (self.lexicon_text and self.lexicon_text.strip()):
                raise ValueError("lexicon_text is required when mode=lexicon_text")
        elif self.mode == "lexicon_file":
            if not self.lexicon_file:
                raise ValueError("lexicon_file is required when mode=lexicon_file")
        elif self.mode == "api_cached":
            if not self.api_cached_file:
                raise ValueError("api_cached_file is required when mode=api_cached")
        return self


@router.delete("/catalog/versions/{vocab_version_id}")
def delete_kb_version(
    vocab_version_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    row = db.query(KbVocabVersion).filter(KbVocabVersion.id == vocab_version_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="KB version not found")
    if row.is_active:
        raise HTTPException(status_code=400, detail="Cannot delete the active version — set another version active first")
    db.delete(row)
    db.commit()
    return {"ok": True, "deleted_id": vocab_version_id}


@router.post("/catalog/versions/{vocab_version_id}/set-active")
def set_kb_version_active(
    vocab_version_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    target = db.query(KbVocabVersion).filter(KbVocabVersion.id == vocab_version_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="KB version not found")
    for v in db.query(KbVocabVersion).all():
        v.is_active = False
    target.is_active = True
    db.commit()
    return {"ok": True, "active_id": vocab_version_id}


@router.get("/{vocab_version_id}/words/top-by-pattern-count")
def words_top_by_pattern_count(
    vocab_version_id: str,
    limit: int = Query(30, ge=1, le=200),
    min_freq: int = Query(20, ge=1),
    max_word_len: int = Query(15, ge=3, le=100),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    vid = _resolve_vid(db, vocab_version_id)
    return top_words_by_pattern_count_data(
        db, vid, limit=limit, min_freq=min_freq, max_word_len=max_word_len
    )


@router.get("/{vocab_version_id}/analytics/weighted-coverage")
def weighted_coverage(
    vocab_version_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Weighted coverage: each pattern's weight = corpus_freq.
    Returns what fraction of total weight is already covered by labeled words.
    """
    from app.models import KbWordPattern as KbWP

    vid = _resolve_vid(db, vocab_version_id)

    # All non-char patterns with their frequencies
    pattern_rows = (
        db.query(KbPattern.id, KbPattern.corpus_freq)
        .filter(KbPattern.vocab_version_id == vid, KbPattern.unit_type != "char")
        .all()
    )
    freq_by_pid: dict[str, int] = {r[0]: r[1] for r in pattern_rows}
    total_weight = sum(freq_by_pid.values())

    if total_weight == 0:
        return {"total_weight": 0, "labeled_weight": 0, "coverage_pct": 0.0}

    # Patterns that appear in at least one annotated word
    # Use AnalyticsPatternLabeled which tracks which patterns have labeled instances
    labeled_pids: set[str] = {
        r[0]
        for r in db.query(AnalyticsPatternLabeled.pattern_id)
        .filter(
            AnalyticsPatternLabeled.vocab_version_id == vid,
            AnalyticsPatternLabeled.count_labeled > 0,
        )
        .all()
    }

    labeled_weight = sum(freq_by_pid.get(pid, 0) for pid in labeled_pids)

    return {
        "total_weight": total_weight,
        "labeled_weight": labeled_weight,
        "coverage_pct": round(labeled_weight / total_weight, 4),
        "total_patterns": len(freq_by_pid),
        "labeled_patterns": len(labeled_pids),
    }


@router.post("/{vocab_version_id}/analytics/recompute-patterns")
def recompute_patterns(
    vocab_version_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    from app.services.kb_analytics.rebuild import recompute_patterns_for_version
    vid = _resolve_vid(db, vocab_version_id)
    result = recompute_patterns_for_version(db, vid)
    return {"ok": True, **result}


@router.post("/catalog/rebuild")
def rebuild_kb(
    body: RebuildKbRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    from app.services.kb_analytics.rebuild import rebuild_kb_from_stimuli
    from app.services.kb_lexicon.ingest import (
        ingest_api_cached,
        ingest_builtin_wordfreq,
        ingest_lexicon_path,
        ingest_lexicon_text,
        ingest_online_hybrid,
    )
    from app.services.kb_lexicon.online_hybrid import OnlineHybridConfig

    import_summary: dict[str, Any] | None = None

    if body.mode == "stimuli":
        vid = rebuild_kb_from_stimuli(
            db,
            label=body.label,
            max_words=body.max_words,
            dataset_id=body.dataset_id,
            source="api_kb_rebuild",
            set_active=body.set_active,
        )
    elif body.mode == "lexicon_text":
        vid, import_summary = ingest_lexicon_text(
            db,
            text=body.lexicon_text or "",
            label=body.label,
            set_active=body.set_active,
        )
    elif body.mode == "lexicon_file":
        vid, import_summary = ingest_lexicon_path(
            db,
            path=Path(body.lexicon_file or "").expanduser(),
            label=body.label,
            set_active=body.set_active,
        )
    elif body.mode == "api_cached":
        vid, import_summary = ingest_api_cached(
            db,
            path=Path(body.api_cached_file or "").expanduser(),
            label=body.label,
            set_active=body.set_active,
        )
    elif body.mode == "builtin_wordfreq":
        vid, import_summary = ingest_builtin_wordfreq(
            db,
            label=body.label,
            limit=body.builtin_wordfreq_limit,
            set_active=body.set_active,
        )
    else:
        oh = body.online_hybrid or OnlineHybridOptions()
        buckets = oh.length_buckets if oh.length_buckets is not None else [None, 4, 7]
        cfg = OnlineHybridConfig(
            label=body.label,
            random_rounds=oh.random_rounds,
            random_per_round=oh.random_per_round,
            length_buckets=buckets,
            datamuse_queries=oh.datamuse_queries,
            datamuse_max_per_query=oh.datamuse_max_per_query,
            seed_enrichment_count=oh.seed_enrichment_count,
            seed_enrichment_max_per_seed=oh.seed_enrichment_max_per_seed,
            target_words=oh.target_words,
        )
        vid, import_summary = ingest_online_hybrid(db, cfg=cfg, set_active=body.set_active)

    out: dict[str, Any] = {"ok": True, "vocab_version_id": vid}
    if import_summary is not None:
        out["import_summary"] = import_summary
    return out
