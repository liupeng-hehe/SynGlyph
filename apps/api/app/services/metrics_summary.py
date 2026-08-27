"""Assemble /api/metrics/summary payload from metric_fact and workflow snapshots."""

from __future__ import annotations

from typing import Any

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models.metric_fact import MetricFact
from app.models.workflow_metrics_snapshot import WorkflowMetricsSnapshot
from app.services.metrics_narrative import (
    sentence_accept_rate,
    sentence_al_vs_random,
    sentence_mean_lab_delta,
    sentence_mae_improvement,
)


def build_metrics_summary(db: Session) -> dict[str, Any]:
    latest_eval_boundary = (
        db.query(MetricFact)
        .filter(
            MetricFact.subject_type == "eval_run",
            MetricFact.comparison_kind == "none",
            MetricFact.metric_key == "mae_boundary",
        )
        .order_by(desc(MetricFact.computed_at))
        .first()
    )
    latest_reduction = (
        db.query(MetricFact)
        .filter(
            MetricFact.subject_type == "eval_run",
            MetricFact.comparison_kind == "vs_previous_snapshot",
            MetricFact.metric_key == "mae_boundary_error_reduction_pct",
        )
        .order_by(desc(MetricFact.computed_at))
        .first()
    )

    exp_rows = (
        db.query(MetricFact)
        .filter(
            MetricFact.subject_type == "experiment_run",
            MetricFact.metric_key == "final_mae_boundary",
        )
        .order_by(desc(MetricFact.computed_at))
        .limit(20)
        .all()
    )
    mae_random = mae_unc = None
    ds_for_al = None
    for r in exp_rows:
        bn = (r.baseline_name or "").lower()
        if bn == "random" and mae_random is None:
            mae_random = r.metric_value
            ds_for_al = r.dataset_version_id
        if bn in ("uncertainty", "uncertainty_v1") and mae_unc is None:
            mae_unc = r.metric_value
        if mae_random is not None and mae_unc is not None:
            break

    wf = (
        db.query(WorkflowMetricsSnapshot)
        .order_by(desc(WorkflowMetricsSnapshot.computed_at))
        .limit(1)
        .first()
    )

    sentences: list[str] = []
    if latest_reduction and latest_reduction.metric_value is not None:
        sentences.append(
            sentence_mae_improvement(
                "mae_boundary",
                float(latest_reduction.metric_value),
            )
        )
    if wf:
        sentences.append(sentence_accept_rate(wf.accept_rate))
        sentences.append(sentence_mean_lab_delta(wf.correction_magnitude_mean))
    sentences.append(sentence_al_vs_random(mae_random, mae_unc, ds_for_al))

    return {
        "latest_eval_mae_boundary": latest_eval_boundary.metric_value if latest_eval_boundary else None,
        "vs_previous_snapshot_pct": latest_reduction.metric_value if latest_reduction else None,
        "experiment_final_mae_random": mae_random,
        "experiment_final_mae_uncertainty": mae_unc,
        "workflow": _wf_to_dict(wf) if wf else None,
        "sentences": [s for s in sentences if s],
        "facts_sample": _facts_sample(db),
    }


def _wf_to_dict(wf: WorkflowMetricsSnapshot) -> dict[str, Any]:
    return {
        "window_start": wf.window_start.isoformat() if wf.window_start else None,
        "window_end": wf.window_end.isoformat() if wf.window_end else None,
        "accept_rate": wf.accept_rate,
        "reject_rate": wf.reject_rate,
        "minor_edit_rate": wf.minor_edit_rate,
        "correction_magnitude_mean": wf.correction_magnitude_mean,
        "mean_boundary_edits": wf.mean_boundary_edits,
        "n_feedback_rows": wf.n_feedback_rows,
    }


def _facts_sample(db: Session, limit: int = 24) -> list[dict[str, Any]]:
    rows = db.query(MetricFact).order_by(desc(MetricFact.computed_at)).limit(limit).all()
    out = []
    for r in rows:
        out.append(
            {
                "subject_type": r.subject_type,
                "subject_id": r.subject_id,
                "metric_key": r.metric_key,
                "metric_value": r.metric_value,
                "comparison_kind": r.comparison_kind,
                "baseline_name": r.baseline_name,
                "computed_at": r.computed_at.isoformat() if r.computed_at else None,
            }
        )
    return out


def list_workflow_history(db: Session, *, limit: int = 7) -> list[dict[str, Any]]:
    rows = (
        db.query(WorkflowMetricsSnapshot)
        .order_by(desc(WorkflowMetricsSnapshot.computed_at))
        .limit(limit)
        .all()
    )
    return [_wf_to_dict(r) for r in rows]
