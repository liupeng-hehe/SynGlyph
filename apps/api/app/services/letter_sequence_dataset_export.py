"""Freeze English letter-sequence dataset (default: stimulus raw-export path)."""

from __future__ import annotations

import json
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models.ml_dataset_version import MLDatasetVersion
from app.models.model_review_feedback import ModelReviewFeedback
from app.services.artifact_paths import dataset_version_dir, file_uri
from app.services.raw_export_payload import get_raw_export_payload
from app.services.review_feedback_summary import merge_summary_into_row

# Lazy import letter_sequence package (training env)
try:
    from letter_sequence.data.export_dataset import (
        CANONICAL_SCHEMA,
        PRODUCT_LINE,
        SPLIT_STRATEGY,
        TASK_NAME,
        assign_split,
        canonical_to_v2_legacy,
        compute_dataset_hash,
        example_id_stimulus,
        v2_sample_row_to_canonical,
    )
    from letter_sequence.data.preprocess_letter_sequences import annotation_record_to_sample
except ImportError:
    annotation_record_to_sample = None  # type: ignore[misc,assignment]


def get_git_sha() -> str | None:
    try:
        root = Path(__file__).resolve().parents[4]
        r = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()[:64]
    except OSError:
        pass
    return None


def _build_stimulus_samples(data: dict[str, Any]) -> list[dict[str, Any]]:
    if annotation_record_to_sample is None:
        raise RuntimeError("letter_sequence package not importable")
    stimuli = data.get("stimuli") or []
    annotated = data.get("annotated") or {}
    out: list[dict[str, Any]] = []
    for stim in stimuli:
        sid = stim["id"]
        ann = annotated.get(sid)
        if not ann:
            continue
        rec = {
            "raw_input": ann.get("raw_input"),
            "spans": ann.get("spans") or [],
            "boundary_influence": ann.get("boundary_influence"),
        }
        sample = annotation_record_to_sample(
            annotation_id=ann["id"],
            stimulus_id=sid,
            word_text=stim.get("text") or "",
            record=rec,
        )
        if sample is None:
            continue
        out.append(sample)
    return out


def _feedback_matches_canonical(
    fb: ModelReviewFeedback,
    stimulus_text: str,
    word_text: str,
) -> bool:
    if fb.full_text != stimulus_text:
        return False
    summ = merge_summary_into_row(fb.record_json, fb.full_text)
    start, end = summ.get("span_start"), summ.get("span_end")
    if start is None or end is None:
        return False
    try:
        frag = fb.full_text[int(start) : int(end)]
    except (TypeError, ValueError, IndexError):
        return False
    return frag.strip().lower() == (word_text or "").strip().lower()


def _try_apply_feedback_targets(canonical: dict[str, Any], record: dict[str, Any]) -> bool:
    """Best-effort merge of letterColorCorrections into targets.lab when lengths match and LAB given."""
    fb = record.get("feedback") or {}
    fixes = fb.get("letterColorCorrections") or []
    letters = canonical.get("letters") or []
    if not isinstance(fixes, list) or len(fixes) != len(letters):
        return False
    t = canonical["targets"]
    lab = [list(x) for x in t["lab"]]
    changed = False
    for i, ent in enumerate(fixes):
        if not isinstance(ent, dict):
            continue
        cc = ent.get("correctedColor") or {}
        if cc.get("space") == "lab" and isinstance(cc.get("value"), list) and len(cc["value"]) >= 3:
            lab[i] = [float(cc["value"][j]) for j in range(3)]
            changed = True
    if changed:
        t["lab"] = lab
        canonical["source"]["feedback_applied"] = True
        if "feedback_id" in canonical["source"]:
            pass
    return changed


def freeze_dataset_version(
    db: Session,
    *,
    source_mode: str = "stimulus",
    dataset_id: str | None = None,
    split_seed: int = 42,
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
    test_ratio: float = 0.1,
    source_cutoff_at: datetime | None = None,
    created_by_run_id: str | None = None,
) -> MLDatasetVersion:
    """
    Default source_mode=stimulus: same data as build_letter_sequence_dataset + annotation_record_to_sample.
    Writes canonical examples.jsonl + derived letter_sequence_samples.jsonl + manifest + stats.
    """
    if abs(train_ratio + val_ratio + test_ratio - 1.0) > 1e-6:
        raise ValueError("train_ratio + val_ratio + test_ratio must sum to 1")

    if source_mode != "stimulus":
        raise NotImplementedError("Only source_mode=stimulus is implemented in Phase 1")

    raw = get_raw_export_payload(db, dataset_id)
    # Optional cutoff: drop stimuli whose annotation created_at after cutoff (best-effort)
    if source_cutoff_at is not None:
        ann = raw.get("annotated") or {}
        kept = {}
        for sid, a in ann.items():
            ca = a.get("created_at")
            if ca:
                try:
                    adt = datetime.fromisoformat(ca.replace("Z", "+00:00"))
                    if adt > source_cutoff_at.replace(tzinfo=adt.tzinfo or timezone.utc):
                        continue
                except ValueError:
                    pass
            kept[sid] = a
        raw["annotated"] = kept
        raw["stimuli"] = [s for s in raw["stimuli"] if s["id"] in kept]

    samples = _build_stimulus_samples(raw)
    stimulus_by_id = {s["id"]: s for s in raw.get("stimuli") or []}

    canonical_rows: list[dict[str, Any]] = []
    for row in samples:
        sid = row["stimulus_id"]
        aid = row["annotation_id"]
        wt = row.get("word_text") or ""
        eid = example_id_stimulus(sid, aid, wt)
        sp = assign_split(eid, split_seed, train_ratio, val_ratio)
        c = v2_sample_row_to_canonical(
            row,
            stimulus_id=sid,
            annotation_id=aid,
            example_id=eid,
            split=sp,
        )
        canonical_rows.append(c)

    # Feedback pass (best-effort)
    feedback_rows = db.query(ModelReviewFeedback).all()
    feedback_total_count = len(feedback_rows)
    matched_count = 0
    unmatched_count = 0
    applied_count = 0
    retrain_eligible_count = sum(
        1 for f in feedback_rows if merge_summary_into_row(f.record_json, f.full_text).get("is_retrain_eligible")
    )

    for fb in feedback_rows:
        try:
            rec = json.loads(fb.record_json or "{}")
        except json.JSONDecodeError:
            unmatched_count += 1
            continue
        matched_any = False
        for c in canonical_rows:
            st = stimulus_by_id.get(c["source"]["stimulus_id"])
            if not st:
                continue
            stim_text = st.get("text") or ""
            if not _feedback_matches_canonical(fb, stim_text, c["word_text"]):
                continue
            matched_any = True
            c["source"]["feedback_id"] = fb.id
            summ = merge_summary_into_row(fb.record_json, fb.full_text)
            if summ.get("is_retrain_eligible") and _try_apply_feedback_targets(c, rec):
                applied_count += 1
            break
        if matched_any:
            matched_count += 1
        else:
            unmatched_count += 1

    dvh = compute_dataset_hash(canonical_rows)
    dvid = str(uuid.uuid4())
    out_dir = dataset_version_dir(dvid)
    examples_path = out_dir / "examples.jsonl"
    legacy_path = out_dir / "letter_sequence_samples.jsonl"

    with examples_path.open("w", encoding="utf-8") as fe:
        for c in sorted(canonical_rows, key=lambda x: x["example_id"]):
            fe.write(json.dumps(c, ensure_ascii=False) + "\n")
    with legacy_path.open("w", encoding="utf-8") as fl:
        for c in canonical_rows:
            fl.write(json.dumps(canonical_to_v2_legacy(c), ensure_ascii=False) + "\n")

    train_c = sum(1 for c in canonical_rows if c["split"] == "train")
    val_c = sum(1 for c in canonical_rows if c["split"] == "val")
    test_c = sum(1 for c in canonical_rows if c["split"] == "test")

    stats = {
        "n_examples": len(canonical_rows),
        "n_train": train_c,
        "n_val": val_c,
        "n_test": test_c,
        "feedback_total_count": feedback_total_count,
        "matched_count": matched_count,
        "unmatched_count": unmatched_count,
        "applied_count": applied_count,
        "retrain_eligible_count": retrain_eligible_count,
        "word_length_hist": {},  # optional: fill simple hist
    }
    (out_dir / "stats.json").write_text(json.dumps(stats, indent=2), encoding="utf-8")

    manifest = {
        "dataset_version_id": dvid,
        "product_line": PRODUCT_LINE,
        "task_name": TASK_NAME,
        "source_mode": source_mode,
        "schema_version": CANONICAL_SCHEMA,
        "split_seed": split_seed,
        "split_strategy": SPLIT_STRATEGY,
        "source_cutoff_at": source_cutoff_at.isoformat() if source_cutoff_at else None,
        "example_count": len(canonical_rows),
        "train_count": train_c,
        "val_count": val_c,
        "test_count": test_c,
        "dataset_hash": dvh,
        "git_sha": get_git_sha(),
        "files": ["examples.jsonl", "letter_sequence_samples.jsonl", "stats.json"],
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    man_uri = file_uri(out_dir / "manifest.json")

    row = MLDatasetVersion(
        id=dvid,
        product_line=PRODUCT_LINE,
        task_name=TASK_NAME,
        source_mode=source_mode,
        schema_version=CANONICAL_SCHEMA,
        split_seed=split_seed,
        split_strategy=SPLIT_STRATEGY,
        source_cutoff_at=source_cutoff_at,
        example_count=len(canonical_rows),
        train_count=train_c,
        val_count=val_c,
        test_count=test_c,
        dataset_hash=dvh,
        manifest_uri=man_uri,
        stats_json=json.dumps(stats, ensure_ascii=False),
        git_sha=get_git_sha(),
        created_by_run_id=created_by_run_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
