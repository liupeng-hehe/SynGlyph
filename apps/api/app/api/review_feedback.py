"""Structured feedback for letter-sequence / text-reveal model evaluation."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.model_snapshot import ModelSnapshot
from app.models.model_review_feedback import ModelReviewFeedback
from app.services.review_feedback_summary import merge_summary_into_row

router = APIRouter(prefix="/api/review-feedback", tags=["review-feedback"])


class ModelFeedbackRecordPatch(BaseModel):
    """Partial update: merge into existing record_json."""

    model_config = ConfigDict(populate_by_name=True)

    feedback: dict[str, Any] | None = None
    prediction: dict[str, Any] | None = None
    selected_span: dict[str, Any] | None = Field(None, alias="selectedSpan")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _span_key_from_body(body: dict[str, Any]) -> tuple[int, int] | None:
    """(start, end) in code units for the reviewed word span, or None if missing."""
    span = body.get("selectedSpan") or body.get("selected_span")
    if not isinstance(span, dict):
        return None
    try:
        start = int(span["start"])
        end = int(span["end"])
    except (KeyError, TypeError, ValueError):
        return None
    return start, end


def _delete_existing_feedback_for_span(
    db: Session, checkpoint_id: str, full_text: str, span_key: tuple[int, int]
) -> None:
    """Same model + same document + same word span: keep only the latest save (replace row)."""
    start, end = span_key
    candidates = (
        db.query(ModelReviewFeedback)
        .filter(
            ModelReviewFeedback.checkpoint_id == checkpoint_id,
            ModelReviewFeedback.full_text == full_text,
        )
        .all()
    )
    for row in candidates:
        try:
            rec = json.loads(row.record_json or "{}")
        except json.JSONDecodeError:
            continue
        sp = rec.get("selectedSpan") or rec.get("selected_span") or {}
        try:
            rs = int(sp.get("start"))
            re = int(sp.get("end"))
        except (TypeError, ValueError):
            continue
        if rs == start and re == end:
            db.delete(row)


def _parse_record(row: ModelReviewFeedback) -> dict[str, Any]:
    try:
        data = json.loads(row.record_json or "{}")
    except json.JSONDecodeError:
        data = {}
    data["id"] = row.id
    data["checkpointId"] = row.checkpoint_id
    data["text"] = row.full_text
    if row.created_at:
        data["createdAt"] = row.created_at.isoformat()
    if row.updated_at:
        data["updatedAt"] = row.updated_at.isoformat()
    return data


def _mean(vals: list[float]) -> float | None:
    return (sum(vals) / len(vals)) if vals else None


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


@router.post("")
def create_review_feedback(body: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    checkpoint_id = str(body.get("checkpointId") or body.get("checkpoint_id") or "")
    text = str(body.get("text") or "")
    if not text.strip():
        raise HTTPException(status_code=422, detail="text is required")

    span_key = _span_key_from_body(body)
    if span_key is not None:
        _delete_existing_feedback_for_span(db, checkpoint_id, text, span_key)

    rid = str(body.get("id") or uuid.uuid4())
    now = _now_iso()
    record: dict[str, Any] = {**body}
    record["id"] = rid
    record["checkpointId"] = checkpoint_id
    record["text"] = text
    record["createdAt"] = record.get("createdAt") or now
    record["updatedAt"] = record.get("updatedAt")

    rj = json.dumps(record, ensure_ascii=False)
    summ = merge_summary_into_row(rj, text)
    row = ModelReviewFeedback(
        id=rid,
        checkpoint_id=checkpoint_id,
        full_text=text,
        record_json=rj,
        span_start=summ.get("span_start"),
        span_end=summ.get("span_end"),
        span_key=summ.get("span_key"),
        feedback_type=summ.get("feedback_type"),
        severity=summ.get("severity"),
        lab_delta_mean=summ.get("lab_delta_mean"),
        prom_delta_mean=summ.get("prom_delta_mean"),
        spr_delta_mean=summ.get("spr_delta_mean"),
        boundary_edit_count=summ.get("boundary_edit_count"),
        is_retrain_eligible=bool(summ.get("is_retrain_eligible")),
        schema_version=str(summ.get("schema_version") or "review_feedback_v1"),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _parse_record(row)


@router.get("")
def list_review_feedback(
    checkpoint_id: str | None = Query(None, alias="checkpointId"),
    full_text: str | None = Query(None, alias="text"),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    q = db.query(ModelReviewFeedback)
    if checkpoint_id is not None:
        q = q.filter(ModelReviewFeedback.checkpoint_id == checkpoint_id)
    if full_text is not None:
        q = q.filter(ModelReviewFeedback.full_text == full_text)
    rows = q.order_by(ModelReviewFeedback.created_at.desc()).limit(500).all()
    return [_parse_record(r) for r in rows]


@router.get("/report")
def review_feedback_report(
    checkpoint_ids: str | None = Query(None, alias="checkpointIds"),
    min_reviews: int = Query(1, ge=0, le=1000, alias="minReviews"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Compare checkpoints using review-feedback + snapshot best_val_loss.

    Final score (0-100): 70% feedback score + 30% validation score.
    """
    requested_ids = [
        x.strip() for x in (checkpoint_ids or "").split(",") if x.strip()
    ]

    q = db.query(ModelReviewFeedback)
    if requested_ids:
        q = q.filter(ModelReviewFeedback.checkpoint_id.in_(requested_ids))
    rows = q.order_by(ModelReviewFeedback.created_at.desc()).all()

    by_ckpt: dict[str, list[ModelReviewFeedback]] = {}
    for r in rows:
        ck = r.checkpoint_id or ""
        if not ck:
            continue
        by_ckpt.setdefault(ck, []).append(r)

    if requested_ids:
        ordered_ids = requested_ids
    else:
        ordered_ids = sorted(by_ckpt.keys())

    snaps = (
        db.query(ModelSnapshot)
        .filter(ModelSnapshot.id.in_(ordered_ids))
        .all()
        if ordered_ids
        else []
    )
    snap_map = {s.id: s for s in snaps}

    # Normalize validation score across selected checkpoints with valid best_val_loss
    vals = [s.best_val_loss for s in snaps if s.best_val_loss is not None]
    vmin = min(vals) if vals else None
    vmax = max(vals) if vals else None

    rows_out: list[dict[str, Any]] = []
    for ck in ordered_ids:
        group = by_ckpt.get(ck, [])
        n = len(group)
        if n < min_reviews:
            continue

        accept = 0
        minor = 0
        reject = 0
        sev_minor = 0
        sev_medium = 0
        sev_major = 0
        prom_deltas: list[float] = []
        spr_deltas: list[float] = []
        boundary_counts: list[float] = []

        for r in group:
            try:
                rec = json.loads(r.record_json or "{}")
            except json.JSONDecodeError:
                rec = {}
            fb = rec.get("feedback") or {}
            outcome = str(fb.get("reviewOutcome") or "").strip().lower()
            if outcome == "accept":
                accept += 1
            elif outcome == "minor_edit":
                minor += 1
            elif outcome == "reject":
                reject += 1

            severity = str((r.severity or "")).strip().lower()
            if severity == "minor":
                sev_minor += 1
            elif severity == "medium":
                sev_medium += 1
            elif severity == "major":
                sev_major += 1

            if r.prom_delta_mean is not None:
                prom_deltas.append(float(r.prom_delta_mean))
            if r.spr_delta_mean is not None:
                spr_deltas.append(float(r.spr_delta_mean))
            if r.boundary_edit_count is not None:
                boundary_counts.append(float(r.boundary_edit_count))

        accept_rate = accept / n if n else 0.0
        minor_rate = minor / n if n else 0.0
        reject_rate = reject / n if n else 0.0
        major_rate = sev_major / n if n else 0.0
        medium_rate = sev_medium / n if n else 0.0

        prom_mean = _mean(prom_deltas)
        spr_mean = _mean(spr_deltas)
        boundary_mean = _mean(boundary_counts)

        # Feedback score (0-100)
        quality = 100.0 * (
            0.55 * accept_rate +
            0.25 * minor_rate +
            0.20 * (1.0 - reject_rate)
        )
        severity_penalty = 20.0 * major_rate + 8.0 * medium_rate
        delta_penalty = min(
            20.0,
            40.0 * (prom_mean or 0.0) +
            40.0 * (spr_mean or 0.0) +
            3.0 * (boundary_mean or 0.0),
        )
        feedback_score = _clamp(quality - severity_penalty - delta_penalty)

        snap = snap_map.get(ck)
        best_val = float(snap.best_val_loss) if (snap and snap.best_val_loss is not None) else None
        if best_val is None:
            validation_score = 50.0
        elif vmin is None or vmax is None or abs(vmax - vmin) < 1e-12:
            validation_score = 100.0
        else:
            validation_score = _clamp(100.0 * (vmax - best_val) / (vmax - vmin))

        final_score = _clamp(0.7 * feedback_score + 0.3 * validation_score)

        rows_out.append(
            {
                "checkpoint_id": ck,
                "snapshot_name": snap.name if snap else None,
                "model_family": snap.model_family if snap else None,
                "best_val_loss": best_val,
                "n_reviews": n,
                "accept_rate": accept_rate,
                "minor_edit_rate": minor_rate,
                "reject_rate": reject_rate,
                "major_severity_rate": major_rate,
                "avg_prom_delta": prom_mean,
                "avg_spr_delta": spr_mean,
                "avg_boundary_edit_count": boundary_mean,
                "feedback_score": feedback_score,
                "validation_score": validation_score,
                "final_score_100": final_score,
            }
        )

    rows_out.sort(key=lambda x: x["final_score_100"], reverse=True)

    return {
        "weights": {"feedback": 0.7, "validation": 0.3},
        "formula": {
            "feedback_quality": "100*(0.55*accept_rate + 0.25*minor_edit_rate + 0.20*(1-reject_rate))",
            "severity_penalty": "20*major_severity_rate + 8*medium_severity_rate",
            "delta_penalty_cap20": "min(20, 40*avg_prom_delta + 40*avg_spr_delta + 3*avg_boundary_edit_count)",
            "validation_score": "normalized inverse rank of best_val_loss among compared checkpoints (missing => 50)",
            "final_score_100": "0.7*feedback_score + 0.3*validation_score",
        },
        "rows": rows_out,
    }


@router.patch("/{record_id}")
def patch_review_feedback(
    record_id: str,
    patch: ModelFeedbackRecordPatch,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    row = db.query(ModelReviewFeedback).filter(ModelReviewFeedback.id == record_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    try:
        record = json.loads(row.record_json or "{}")
    except json.JSONDecodeError:
        record = {}
    if patch.feedback is not None:
        fb = dict(record.get("feedback") or {})
        fb.update(patch.feedback)
        record["feedback"] = fb
    if patch.prediction is not None:
        pr = dict(record.get("prediction") or {})
        pr.update(patch.prediction)
        record["prediction"] = pr
    if patch.selected_span is not None:
        sp = dict(record.get("selectedSpan") or record.get("selected_span") or {})
        sp.update(patch.selected_span)
        record["selectedSpan"] = sp

    record["updatedAt"] = _now_iso()
    rj = json.dumps(record, ensure_ascii=False)
    row.record_json = rj
    summ = merge_summary_into_row(rj, row.full_text)
    row.span_start = summ.get("span_start")
    row.span_end = summ.get("span_end")
    row.span_key = summ.get("span_key")
    row.feedback_type = summ.get("feedback_type")
    row.severity = summ.get("severity")
    row.lab_delta_mean = summ.get("lab_delta_mean")
    row.prom_delta_mean = summ.get("prom_delta_mean")
    row.spr_delta_mean = summ.get("spr_delta_mean")
    row.boundary_edit_count = summ.get("boundary_edit_count")
    row.is_retrain_eligible = bool(summ.get("is_retrain_eligible"))
    row.schema_version = str(summ.get("schema_version") or "review_feedback_v1")
    if patch.feedback is None and patch.prediction is None and patch.selected_span is None:
        pass
    db.commit()
    db.refresh(row)
    return _parse_record(row)
