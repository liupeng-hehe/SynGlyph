"""Typed summary columns derived from model_review_feedback record_json (no format change to JSON)."""

from __future__ import annotations

import hashlib
import json
from typing import Any


def _span_from_record(rec: dict[str, Any]) -> tuple[int | None, int | None]:
    sp = rec.get("selectedSpan") or rec.get("selected_span") or {}
    try:
        return int(sp["start"]), int(sp["end"])
    except (KeyError, TypeError, ValueError):
        return None, None


def compute_span_key(full_text: str, start: int, end: int) -> str:
    key = f"{full_text}\0{start}\0{end}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def compute_typed_summary(record: dict[str, Any], full_text: str) -> dict[str, Any]:
    """
    Returns keys matching ModelReviewFeedback ORM columns (snake_case).
    """
    fb = record.get("feedback") or {}
    pred = record.get("prediction") or {}
    start, end = _span_from_record(record)
    span_key = compute_span_key(full_text, start, end) if start is not None and end is not None else None

    outcome = str(fb.get("reviewOutcome") or fb.get("review_outcome") or "")
    save_mode = str(fb.get("saveMode") or fb.get("save_mode") or "")
    # Coarse feedback_type for analytics: accept | minor | reject | correct
    if save_mode in ("correction_sample", "retraining_queue"):
        ft_coarse = "correct"
    else:
        ft_coarse = {"accept": "accept", "minor_edit": "minor", "reject": "reject"}.get(outcome, outcome or None)

    severity = fb.get("severity")
    if severity is not None:
        severity = str(severity)

    lab_deltas: list[float] = []
    prom_deltas: list[float] = []
    spr_deltas: list[float] = []
    letter_fixes = fb.get("letterColorCorrections") or []
    if isinstance(letter_fixes, list):
        for ent in letter_fixes:
            if not isinstance(ent, dict):
                continue
            pch = ent.get("predictedColor") or {}
            cch = ent.get("correctedColor") or {}
            # Skip full OKLab in Phase 1 summary — use 0 placeholder if hex diff only
            if pch.get("space") == "lab" and cch.get("space") == "lab":
                pv = pch.get("value") or []
                cv = cch.get("value") or []
                if len(pv) >= 3 and len(cv) >= 3:
                    lab_deltas.append(
                        sum(abs(float(cv[i]) - float(pv[i])) for i in range(3)) / 3.0
                    )
            pp = ent.get("predictedProminence")
            cp = ent.get("correctedProminence")
            if pp is not None and cp is not None:
                prom_deltas.append(abs(float(cp) - float(pp)))
            ps = ent.get("predictedSpread")
            cs = ent.get("correctedSpread")
            if ps is not None and cs is not None:
                spr_deltas.append(abs(float(cs) - float(ps)))

    lab_delta_mean = sum(lab_deltas) / len(lab_deltas) if lab_deltas else None
    prom_delta_mean = sum(prom_deltas) / len(prom_deltas) if prom_deltas else None
    spr_delta_mean = sum(spr_deltas) / len(spr_deltas) if spr_deltas else None

    boundary_edit_count = 0
    mig = fb.get("letterBoundaryMigrationEval") or []
    if isinstance(mig, list):
        for m in mig:
            if isinstance(m, dict) and m.get("lean") is not None and float(m.get("lean", 0)) != 0.0:
                boundary_edit_count += 1

    # Retrain eligibility (TODO: make minor configurable)
    is_retrain = False
    if outcome == "reject":
        is_retrain = True
    elif outcome == "minor_edit":
        is_retrain = True
    elif save_mode in ("retraining_queue", "correction_sample"):
        is_retrain = True

    return {
        "span_start": start,
        "span_end": end,
        "span_key": span_key,
        "feedback_type": ft_coarse,
        "severity": severity,
        "lab_delta_mean": lab_delta_mean,
        "prom_delta_mean": prom_delta_mean,
        "spr_delta_mean": spr_delta_mean,
        "boundary_edit_count": boundary_edit_count if boundary_edit_count else None,
        "is_retrain_eligible": is_retrain,
        "schema_version": "review_feedback_v1",
    }


def merge_summary_into_row(record_json_str: str, full_text: str) -> dict[str, Any]:
    try:
        rec = json.loads(record_json_str or "{}")
    except json.JSONDecodeError:
        rec = {}
    summary = compute_typed_summary(rec, full_text)
    return summary
