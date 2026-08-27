"""Single entry point for creating model_snapshot rows + on-disk model manifest."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models.model_snapshot import ModelSnapshot
from app.models.training_run import TrainingRun
from app.services.artifact_paths import file_uri, model_snapshot_dir

DEFAULT_MODEL_FAMILY = "bilstm"


def create_model_snapshot(
    db: Session,
    training_run: TrainingRun,
    *,
    checkpoint_path: Path,
    dataset_version_id: str | None,
    git_sha: str | None,
    name: str | None = None,
    metrics_json: dict[str, Any] | None = None,
    label_schema_version: str | None = "letter_sequence_v2",
    model_family: str | None = DEFAULT_MODEL_FAMILY,
) -> ModelSnapshot:
    """
    Persist ModelSnapshot and artifacts/models/{id}/manifest.json.
    Caller commits the session.
    """
    snap_id = str(uuid.uuid4())
    ckpt = Path(checkpoint_path).resolve()
    if not ckpt.is_file():
        raise FileNotFoundError(f"checkpoint not found: {ckpt}")

    out_m = model_snapshot_dir(snap_id)
    manifest_path = out_m / "manifest.json"
    manifest = {
        "model_snapshot_id": snap_id,
        "checkpoint_path": str(ckpt),
        "model_class": "LetterSequenceModel",
        "model_config": json.loads(training_run.config_json or "{}") if training_run.config_json else {},
        "dataset_version_id": dataset_version_id,
        "training_run_id": training_run.id,
        "git_sha": git_sha,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model_family": model_family or DEFAULT_MODEL_FAMILY,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M")
    n_words = training_run.n_unique_words or 0
    auto_name = f"model_{ts}_words{n_words}"
    final_name = (name or "").strip() or auto_name

    snap = ModelSnapshot(
        id=snap_id,
        training_run_id=training_run.id,
        name=final_name,
        checkpoint_uri=str(ckpt),
        config_json=training_run.config_json,
        best_val_loss=training_run.best_val_loss,
        n_samples=training_run.n_samples,
        n_unique_words=training_run.n_unique_words,
        dataset_version_id=dataset_version_id,
        git_sha=git_sha,
        artifact_manifest_uri=file_uri(manifest_path),
        label_schema_version=label_schema_version,
        metrics_json=json.dumps(metrics_json, ensure_ascii=False) if metrics_json else None,
        model_family=model_family,
    )
    db.add(snap)
    db.flush()
    return snap
