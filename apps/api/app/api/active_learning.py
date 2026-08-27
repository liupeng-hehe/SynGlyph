"""Active Learning API (persisted hybrid scoring v1)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user_word_registry import UserWordRegistry
from app.schemas.active_learning import (
    ActiveLearningSnapshotMeta,
    PrioritizedStimulus,
    PrioritizedStimuliResponse,
    RefreshActiveLearningRequest,
    RefreshActiveLearningResponse,
)
from app.services.pattern_supply.normalization import normalize_word
from app.services.active_learning_scoring import compute_hybrid_al_scores
from app.services.active_learning_store import (
    fetch_latest_snapshot_rows,
    history_lookup_for_stimulus,
    persist_scoring_snapshot,
    prune_old_history,
)

router = APIRouter(prefix="/api/active-learning", tags=["active-learning"])

def _materialize_refresh(
    db: Session,
    *,
    limit: int,
    snapshot_id: str | None,
    checkpoint_path_override: str | None,
    selected_list_id: str | None,
    exclude_existing: bool,
    exclude_selected: bool,
    kb_vocab_version_id: str | None = None,
    candidate_source: str = "stimulus",
    tie_break_mode: str | None = None,
    include_kb_pattern_debug: bool = False,
) -> RefreshActiveLearningResponse:
    result = compute_hybrid_al_scores(
        db,
        limit=limit,
        snapshot_id=snapshot_id,
        checkpoint_path_override=checkpoint_path_override,
        selected_list_id=selected_list_id,
        exclude_existing=exclude_existing,
        exclude_selected=exclude_selected,
        history_lookup=lambda stim_id, window: history_lookup_for_stimulus(db, stim_id, window),
        kb_vocab_version_id=kb_vocab_version_id,
        candidate_source=candidate_source,
        tie_break_mode=tie_break_mode,
        include_kb_pattern_debug=include_kb_pattern_debug,
    )
    refresh_batch_id = persist_scoring_snapshot(db, result)
    prune_old_history(db)
    meta = ActiveLearningSnapshotMeta(
        model_snapshot_id=result.model_snapshot_id,
        scoring_stage=result.scoring_stage,
        snapshot_time=result.snapshot_time.isoformat(),
        refresh_batch_id=refresh_batch_id,
    )
    return RefreshActiveLearningResponse(
        ok=True,
        rows_written=len(result.rows),
        refresh_batch_id=refresh_batch_id,
        meta=meta,
    )


@router.post("/refresh", response_model=RefreshActiveLearningResponse)
def refresh_prioritized_stimuli(
    body: RefreshActiveLearningRequest,
    db: Session = Depends(get_db),
):
    return _materialize_refresh(
        db,
        limit=max(1, min(200, int(body.limit))),
        snapshot_id=body.snapshot_id,
        checkpoint_path_override=body.checkpoint_path_override,
        selected_list_id=body.selected_list_id,
        exclude_existing=body.exclude_existing,
        exclude_selected=body.exclude_selected,
        kb_vocab_version_id=body.kb_vocab_version_id,
        candidate_source=body.candidate_source,
        tie_break_mode=body.tie_break_mode,
        include_kb_pattern_debug=body.include_kb_pattern_debug,
    )


@router.get("/prioritized", response_model=PrioritizedStimuliResponse)
def get_prioritized_stimuli(
    limit: int = Query(50, ge=1, le=200),
    selected_list_id: str | None = None,
    exclude_existing: bool = True,
    exclude_selected: bool = True,
    candidate_source: str = Query("stimulus", pattern="^(stimulus|kb)$"),
    tie_break_mode: str | None = Query(
        None,
        pattern="^(none|hash|random)$",
        description="Score tie-break for auto-refresh; omit for default.",
    ),
    db: Session = Depends(get_db),
):
    if candidate_source == "kb":
        _materialize_refresh(
            db,
            limit=max(50, limit),
            snapshot_id=None,
            checkpoint_path_override=None,
            selected_list_id=selected_list_id,
            exclude_existing=exclude_existing,
            exclude_selected=exclude_selected,
            kb_vocab_version_id=None,
            candidate_source=candidate_source,
            tie_break_mode=tie_break_mode,
        )
    rows = fetch_latest_snapshot_rows(db, limit=limit * 2, selected_list_id=selected_list_id)
    if not rows:
        _materialize_refresh(
            db,
            limit=max(50, limit),
            snapshot_id=None,
            checkpoint_path_override=None,
            selected_list_id=selected_list_id,
            exclude_existing=exclude_existing,
            exclude_selected=exclude_selected,
            kb_vocab_version_id=None,
            candidate_source=candidate_source,
            tie_break_mode=tie_break_mode,
        )
        rows = fetch_latest_snapshot_rows(db, limit=limit * 2, selected_list_id=selected_list_id)
    if not rows:
        return PrioritizedStimuliResponse(rows=[], meta=ActiveLearningSnapshotMeta())

    if exclude_existing and selected_list_id:
        status_set = ["annotated"]
        if exclude_selected:
            status_set.append("selected")
        excluded = {
            r[0]
            for r in db.query(UserWordRegistry.normalized_word)
            .filter(
                UserWordRegistry.selected_list_id == selected_list_id,
                UserWordRegistry.status.in_(status_set),
            )
            .all()
        }
        rows = [r for r in rows if normalize_word(r.text) not in excluded]
        rows = rows[:limit]

    first = rows[0]
    items = [
        PrioritizedStimulus(
            stimulus_id=r.stimulus_id,
            text=r.text,
            score=float(r.score),
            boundary_uncertainty=float(r.boundary_uncertainty),
            segment_attribute_uncertainty=float(r.segment_attribute_uncertainty),
            segment_novelty=float(r.segment_novelty),
            coverage_gain=float(r.coverage_gain),
            instability=float(r.instability),
        )
        for r in rows
    ]
    # Keep both per-row fields and richer metadata for workbench.
    meta = ActiveLearningSnapshotMeta(
        model_snapshot_id=first.model_snapshot_id,
        scoring_stage=first.scoring_stage,
        snapshot_time=first.snapshot_time.isoformat() if first.snapshot_time else None,
        refresh_batch_id=first.refresh_batch_id,
    )
    return PrioritizedStimuliResponse(rows=items, meta=meta)


@router.get("/syllable-slice-report")
def syllable_slice_report_stub() -> dict:
    """Stub payload for stress/syllable slice reporting (extend with real aggregates later)."""
    from app.services.syllable_al import slice_report_stubs

    return slice_report_stubs()
