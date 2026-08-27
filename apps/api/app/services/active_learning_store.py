"""Persistence helpers for active-learning snapshots and prediction history."""

from __future__ import annotations

import json
import uuid
from datetime import datetime

from sqlalchemy import and_, desc, func
from sqlalchemy.orm import Session

from app.config.active_learning import HISTORY
from app.models import ALPredictionHistory, ALQueueSnapshot
from app.services.active_learning_scoring import ALScoringResult


def history_lookup_for_stimulus(db: Session, stimulus_id: str, window: int) -> tuple[list[float], list[float]]:
    rows = (
        db.query(ALPredictionHistory.boundary_uncertainty, ALPredictionHistory.segment_attribute_uncertainty)
        .filter(ALPredictionHistory.stimulus_id == stimulus_id)
        .order_by(ALPredictionHistory.snapshot_time.desc())
        .limit(max(0, int(window)))
        .all()
    )
    if not rows:
        return [], []
    rows = list(reversed(rows))
    return [float(r[0]) for r in rows], [float(r[1]) for r in rows]


def persist_scoring_snapshot(db: Session, result: ALScoringResult) -> str:
    refresh_batch_id = str(uuid.uuid4())
    snapshot_time = result.snapshot_time
    queue_rows: list[ALQueueSnapshot] = []
    history_rows: list[ALPredictionHistory] = []
    for idx, row in enumerate(result.rows):
        queue_rows.append(
            ALQueueSnapshot(
                id=str(uuid.uuid4()),
                refresh_batch_id=refresh_batch_id,
                selected_list_id=result.selected_list_id,
                stimulus_id=row.stimulus_id,
                text=row.text,
                rank=idx + 1,
                score=float(row.score),
                boundary_uncertainty=float(row.boundary_uncertainty),
                segment_attribute_uncertainty=float(row.segment_attribute_uncertainty),
                segment_novelty=float(row.segment_novelty),
                coverage_gain=float(row.coverage_gain),
                instability=float(row.instability),
                score_raw_json=json.dumps(row.score_raw_json, ensure_ascii=False),
                score_norm_json=json.dumps(row.score_norm_json, ensure_ascii=False),
                model_snapshot_id=result.model_snapshot_id,
                scoring_stage=result.scoring_stage,
                snapshot_time=snapshot_time,
            )
        )
        history_rows.append(
            ALPredictionHistory(
                id=str(uuid.uuid4()),
                refresh_batch_id=refresh_batch_id,
                selected_list_id=result.selected_list_id,
                stimulus_id=row.stimulus_id,
                model_snapshot_id=result.model_snapshot_id,
                scoring_stage=result.scoring_stage,
                snapshot_time=snapshot_time,
                boundary_uncertainty=float(row.boundary_uncertainty),
                segment_attribute_uncertainty=float(row.segment_attribute_uncertainty),
            )
        )
    if queue_rows:
        db.add_all(queue_rows)
    if history_rows:
        db.add_all(history_rows)
    db.commit()
    return refresh_batch_id


def latest_snapshot_meta(
    db: Session,
    *,
    selected_list_id: str | None = None,
) -> tuple[datetime, str] | None:
    q = db.query(ALQueueSnapshot.snapshot_time, ALQueueSnapshot.refresh_batch_id)
    if selected_list_id:
        q = q.filter(ALQueueSnapshot.selected_list_id == selected_list_id)
    row = q.order_by(desc(ALQueueSnapshot.snapshot_time), desc(ALQueueSnapshot.rank)).first()
    if not row:
        return None
    return row[0], row[1]


def fetch_latest_snapshot_rows(
    db: Session,
    *,
    limit: int,
    selected_list_id: str | None = None,
) -> list[ALQueueSnapshot]:
    meta = latest_snapshot_meta(db, selected_list_id=selected_list_id)
    if not meta:
        return []
    snapshot_time, refresh_batch_id = meta
    rows = (
        db.query(ALQueueSnapshot)
        .filter(
            and_(
                ALQueueSnapshot.snapshot_time == snapshot_time,
                ALQueueSnapshot.refresh_batch_id == refresh_batch_id,
            )
        )
        .order_by(ALQueueSnapshot.rank.asc())
        .limit(max(1, int(limit)))
        .all()
    )
    return rows


def prune_old_history(db: Session) -> None:
    keep_snapshots = max(1, int(HISTORY.queue_snapshot_keep))
    keep_history = max(1, int(HISTORY.prediction_history_keep))

    snapshot_ids = [
        row[0]
        for row in (
            db.query(ALQueueSnapshot.id)
            .order_by(ALQueueSnapshot.snapshot_time.desc(), ALQueueSnapshot.rank.asc())
            .offset(keep_snapshots)
            .all()
        )
    ]
    if snapshot_ids:
        db.query(ALQueueSnapshot).filter(ALQueueSnapshot.id.in_(snapshot_ids)).delete(
            synchronize_session=False
        )

    history_ids = [
        row[0]
        for row in db.query(ALPredictionHistory.id)
        .order_by(ALPredictionHistory.snapshot_time.desc())
        .offset(keep_history)
        .all()
    ]
    if history_ids:
        db.query(ALPredictionHistory).filter(ALPredictionHistory.id.in_(history_ids)).delete(
            synchronize_session=False
        )
    db.commit()
