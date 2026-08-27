"""Persist ml_evaluation_run + eval artifacts."""

from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models.ml_evaluation_run import MLEvaluationRun
from app.models.model_snapshot import ModelSnapshot
from app.services.artifact_paths import evaluation_run_dir, file_uri

logger = logging.getLogger(__name__)


def run_evaluation_for_snapshot(
    *,
    model_snapshot_id: str,
    dataset_version_id: str,
    samples_jsonl: Path,
    split_name: str = "val",
    eval_config: dict[str, Any] | None = None,
    git_sha: str | None = None,
    db: Session | None = None,
) -> MLEvaluationRun | None:
    """
    Run package ``evaluate_snapshot`` and write ``ml_evaluation_run`` + ``artifacts/evals/{id}/``.

    If ``db`` is omitted, opens a short-lived session. Returns None if eval cannot run (e.g. ImportError).
    """
    own_session = db is None
    if own_session:
        db = SessionLocal()
    assert db is not None
    try:
        try:
            from letter_sequence.eval.evaluate_snapshot import evaluate_snapshot
        except ImportError as e:
            logger.warning("letter_sequence eval unavailable: %s", e)
            return None

        snap = db.query(ModelSnapshot).filter(ModelSnapshot.id == model_snapshot_id).first()
        if not snap:
            raise ValueError("model snapshot not found")
        ckpt = Path(snap.checkpoint_uri).expanduser()
        if not ckpt.is_file():
            raise FileNotFoundError(f"checkpoint missing: {ckpt}")

        metrics = evaluate_snapshot(ckpt, samples_jsonl, split=split_name, batch_size=16, device="cpu")
        eid = str(uuid.uuid4())
        out = evaluation_run_dir(eid)
        metrics_path = out / "metrics.json"
        metrics_path.write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")

        row = MLEvaluationRun(
            id=eid,
            product_line="english",
            task_name="letter_sequence",
            dataset_version_id=dataset_version_id,
            model_snapshot_id=model_snapshot_id,
            split_name=split_name,
            metrics_json=json.dumps(metrics, ensure_ascii=False),
            eval_config_json=json.dumps(eval_config or {}, ensure_ascii=False),
            artifact_uri=file_uri(metrics_path),
            git_sha=git_sha,
            status="completed",
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        raise
    finally:
        if own_session:
            db.close()
