"""Rollup ingestion into metric_fact, workflow_metrics_snapshot, and experiment facts."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models.metric_fact import MetricFact
from app.models.ml_evaluation_run import MLEvaluationRun
from app.models.model_review_feedback import ModelReviewFeedback
from app.models.model_snapshot import ModelSnapshot
from app.models.workflow_metrics_snapshot import WorkflowMetricsSnapshot
from app.services.artifact_paths import _artifacts_root
from app.services.metrics_comparison import mae_error_reduction_pct


PRIMARY_MAE_KEYS = ("mae_lab", "mae_prominence", "mae_spread", "mae_boundary")


def _upsert_fact(
    db: Session,
    *,
    subject_type: str,
    subject_id: str,
    dataset_version_id: str | None,
    model_snapshot_id: str | None,
    metric_key: str,
    metric_value: float,
    metric_direction: str,
    comparison_kind: str = "none",
    baseline_name: str = "",
    improvement_pct: float | None = None,
    source_artifact_uri: str | None = None,
) -> None:
    row = (
        db.query(MetricFact)
        .filter(
            MetricFact.subject_type == subject_type,
            MetricFact.subject_id == subject_id,
            MetricFact.metric_key == metric_key,
            MetricFact.comparison_kind == comparison_kind,
            MetricFact.baseline_name == baseline_name,
        )
        .first()
    )
    if row:
        row.metric_value = metric_value
        row.metric_direction = metric_direction
        row.dataset_version_id = dataset_version_id
        row.model_snapshot_id = model_snapshot_id
        row.improvement_pct = improvement_pct
        row.source_artifact_uri = source_artifact_uri
        row.computed_at = datetime.now(timezone.utc)
    else:
        db.add(
            MetricFact(
                id=str(uuid.uuid4()),
                subject_type=subject_type,
                subject_id=subject_id,
                dataset_version_id=dataset_version_id,
                model_snapshot_id=model_snapshot_id,
                baseline_name=baseline_name or "",
                comparison_kind=comparison_kind,
                metric_key=metric_key,
                metric_value=metric_value,
                metric_direction=metric_direction,
                improvement_pct=improvement_pct,
                source_artifact_uri=source_artifact_uri,
            )
        )


def rollup_ml_evaluation_runs(db: Session, *, limit: int = 500) -> int:
    """Ingest primary MAE metrics from ml_evaluation_run.metrics_json."""
    n = 0
    rows = (
        db.query(MLEvaluationRun)
        .order_by(MLEvaluationRun.created_at.desc())
        .limit(limit)
        .all()
    )
    for er in rows:
        try:
            m = json.loads(er.metrics_json or "{}")
        except (json.JSONDecodeError, TypeError):
            continue
        if m.get("error"):
            continue
        for key in PRIMARY_MAE_KEYS:
            if key not in m or m[key] is None:
                continue
            try:
                val = float(m[key])
            except (TypeError, ValueError):
                continue
            _upsert_fact(
                db,
                subject_type="eval_run",
                subject_id=er.id,
                dataset_version_id=er.dataset_version_id,
                model_snapshot_id=er.model_snapshot_id,
                metric_key=key,
                metric_value=val,
                metric_direction="down",
            )
            n += 1
        if "n_examples" in m:
            try:
                _upsert_fact(
                    db,
                    subject_type="eval_run",
                    subject_id=er.id,
                    dataset_version_id=er.dataset_version_id,
                    model_snapshot_id=er.model_snapshot_id,
                    metric_key="n_examples",
                    metric_value=float(m["n_examples"]),
                    metric_direction="up",
                )
                n += 1
            except (TypeError, ValueError):
                pass
    return n


def _find_previous_eval_for_snapshot(
    db: Session,
    *,
    dataset_version_id: str,
    split_name: str,
    current_snapshot_id: str,
    current_created_at: datetime | None,
) -> MLEvaluationRun | None:
    if not current_created_at:
        return None
    prev_snaps = (
        db.query(ModelSnapshot)
        .filter(
            ModelSnapshot.dataset_version_id == dataset_version_id,
            ModelSnapshot.id != current_snapshot_id,
            ModelSnapshot.created_at.isnot(None),
            ModelSnapshot.created_at < current_created_at,
        )
        .order_by(ModelSnapshot.created_at.desc())
        .all()
    )
    for ps in prev_snaps:
        ev = (
            db.query(MLEvaluationRun)
            .filter(
                MLEvaluationRun.dataset_version_id == dataset_version_id,
                MLEvaluationRun.split_name == split_name,
                MLEvaluationRun.model_snapshot_id == ps.id,
            )
            .order_by(MLEvaluationRun.created_at.desc())
            .first()
        )
        if ev:
            return ev
    return None


def rollup_eval_vs_previous_snapshot(db: Session, *, limit: int = 200) -> int:
    """Compute mae_*_error_reduction_pct vs the immediately prior snapshot on the same dataset+split."""
    n = 0
    rows = (
        db.query(MLEvaluationRun)
        .order_by(MLEvaluationRun.created_at.desc())
        .limit(limit)
        .all()
    )
    for er in rows:
        try:
            m_new = json.loads(er.metrics_json or "{}")
        except (json.JSONDecodeError, TypeError):
            continue
        if m_new.get("error") or "mae_boundary" not in m_new:
            continue
        snap = db.query(ModelSnapshot).filter(ModelSnapshot.id == er.model_snapshot_id).first()
        if not snap or not snap.dataset_version_id:
            continue
        prev_er = _find_previous_eval_for_snapshot(
            db,
            dataset_version_id=snap.dataset_version_id,
            split_name=er.split_name,
            current_snapshot_id=snap.id,
            current_created_at=snap.created_at,
        )
        if not prev_er:
            continue
        try:
            m_prev = json.loads(prev_er.metrics_json or "{}")
        except (json.JSONDecodeError, TypeError):
            continue
        for key in PRIMARY_MAE_KEYS:
            if key not in m_new or key not in m_prev:
                continue
            try:
                new_v = float(m_new[key])
                prev_v = float(m_prev[key])
            except (TypeError, ValueError):
                continue
            pct = mae_error_reduction_pct(prev_v, new_v)
            mk = f"{key}_error_reduction_pct"
            _upsert_fact(
                db,
                subject_type="eval_run",
                subject_id=er.id,
                dataset_version_id=er.dataset_version_id,
                model_snapshot_id=er.model_snapshot_id,
                metric_key=mk,
                metric_value=pct,
                metric_direction="up",
                comparison_kind="vs_previous_snapshot",
                baseline_name="previous_snapshot",
                improvement_pct=pct,
            )
            n += 1
    return n


def rollup_review_feedback_window(
    db: Session,
    *,
    days: float = 7.0,
    selected_list_id: str | None = None,
) -> str | None:
    """Aggregate model_review_feedback into one workflow_metrics_snapshot row."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)

    q = db.query(ModelReviewFeedback).filter(
        ModelReviewFeedback.created_at.isnot(None),
        ModelReviewFeedback.created_at >= start,
        ModelReviewFeedback.created_at <= end,
    )

    rows = q.all()
    if not rows:
        wid = str(uuid.uuid4())
        db.add(
            WorkflowMetricsSnapshot(
                id=wid,
                window_start=start,
                window_end=end,
                selected_list_id=selected_list_id,
                accept_rate=None,
                reject_rate=None,
                minor_edit_rate=None,
                n_feedback_rows=0.0,
                notes="no_feedback_rows",
            )
        )
        return wid

    n = len(rows)
    acc = rej = minor = 0
    lab_sum = 0.0
    lab_n = 0
    b_sum = 0.0
    b_n = 0
    for r in rows:
        ft = (r.feedback_type or "").lower()
        if ft == "accept":
            acc += 1
        elif ft == "reject":
            rej += 1
        elif ft == "minor":
            minor += 1
        if r.lab_delta_mean is not None:
            lab_sum += float(r.lab_delta_mean)
            lab_n += 1
        if r.boundary_edit_count is not None and r.boundary_edit_count > 0:
            b_sum += float(r.boundary_edit_count)
            b_n += 1

    wid = str(uuid.uuid4())
    db.add(
        WorkflowMetricsSnapshot(
            id=wid,
            window_start=start,
            window_end=end,
            selected_list_id=selected_list_id,
            accept_rate=acc / n if n else None,
            reject_rate=rej / n if n else None,
            minor_edit_rate=minor / n if n else None,
            correction_magnitude_mean=lab_sum / lab_n if lab_n else None,
            mean_boundary_edits=b_sum / b_n if b_n else None,
            n_feedback_rows=float(n),
        )
    )
    return wid


def _experiments_root() -> Path:
    return _artifacts_root() / "experiments"


def rollup_experiment_final_summaries(db: Session, *, max_files: int = 100) -> int:
    """Ingest artifacts/experiments/*/final_summary.json into metric_fact."""
    root = _experiments_root()
    if not root.is_dir():
        return 0
    n = 0
    paths = sorted(root.glob("*/final_summary.json"))[:max_files]
    for path in paths:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        exp_id = data.get("experiment_run_id") or path.parent.name
        rounds = data.get("rounds") or []
        if not rounds:
            continue
        last = rounds[-1]
        metrics = last.get("metrics") or {}
        ds_ver = data.get("dataset_version_id")
        strat = data.get("sampling_strategy") or "unknown"
        for key in PRIMARY_MAE_KEYS:
            if key not in metrics:
                continue
            try:
                val = float(metrics[key])
            except (TypeError, ValueError):
                continue
            _upsert_fact(
                db,
                subject_type="experiment_run",
                subject_id=str(exp_id),
                dataset_version_id=ds_ver,
                model_snapshot_id=None,
                metric_key=f"final_{key}",
                metric_value=val,
                metric_direction="down",
                comparison_kind="none",
                baseline_name=strat,
                source_artifact_uri=path.resolve().as_uri(),
            )
            n += 1
    return n


def rollup_all(
    db: Session,
    *,
    eval_limit: int = 500,
    vs_prev_limit: int = 200,
    experiment_files: int = 100,
    workflow_days: float = 7.0,
) -> dict[str, Any]:
    """Run all rollup steps (idempotent upserts). Call db.commit() after."""
    out: dict[str, Any] = {}
    out["eval_facts"] = rollup_ml_evaluation_runs(db, limit=eval_limit)
    out["vs_previous"] = rollup_eval_vs_previous_snapshot(db, limit=vs_prev_limit)
    out["experiments"] = rollup_experiment_final_summaries(db, max_files=experiment_files)
    out["workflow_snapshot_id"] = rollup_review_feedback_window(db, days=workflow_days)
    return out
