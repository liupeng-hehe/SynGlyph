"""Background training: lab samples JSONL → K-fold CV → letter_sequence train → activate checkpoint."""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path

import yaml

from app.db import SessionLocal
from app.models.lab_profile import LabProfile, LabTrainingRun
from app.services.lab_dataset import write_samples_jsonl
from app.services.lab_manifest import parse_manifest
from app.utils.repo_root import get_repo_root

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_running: dict[str, subprocess.Popen] = {}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _lab_train_epochs() -> int:
    try:
        return max(1, int(os.environ.get("LAB_TRAIN_EPOCHS", "12")))
    except ValueError:
        return 12


def _lab_cv_epochs() -> int:
    try:
        return max(1, int(os.environ.get("LAB_CV_EPOCHS", "8")))
    except ValueError:
        return 8


def lab_cv_epochs() -> int:
    return _lab_cv_epochs()


def _lab_micro_train_epochs() -> int:
    try:
        return max(1, int(os.environ.get("LAB_MICRO_TRAIN_EPOCHS", "8")))
    except ValueError:
        return 8


def lab_micro_train_epochs() -> int:
    return _lab_micro_train_epochs()


def _lab_train_config(seed: int, *, epochs: int) -> dict:
    return {
        "data": {
            "max_seq_len": 64,
            "train_ratio": 0.85,
            "split_seed": seed,
            "split_key": "stimulus_id",
        },
        "model_family": "bilstm",
        "model": {
            "model_family": "bilstm",
            "emb_dim": 64,
            "hidden": 128,
            "num_layers": 1,
            "dropout": 0.1,
            "max_len": 64,
            "pos_dim": 16,
            "use_extra_features": True,
            "extra_dim": 4,
        },
        "loss_weights": {"lab": 1.0, "prominence": 1.0, "spread": 1.0, "boundary": 1.0},
        "train": {
            "epochs": epochs,
            "batch_size": 8,
            "lr": 0.001,
            "weight_decay": 0.0001,
            "device": "cpu",
        },
    }


def _build_lab_train_yaml(out_dir: Path, seed: int, *, epochs: int | None = None) -> dict:
    ep = epochs if epochs is not None else _lab_train_epochs()
    cfg = _lab_train_config(seed, epochs=ep)
    (out_dir / "run_config.yaml").write_text(yaml.safe_dump(cfg, sort_keys=False), encoding="utf-8")
    return cfg


def _run_kfold_cv(samples_path: Path, out_dir: Path, cfg: dict, seed: int) -> dict:
    try:
        from letter_sequence.eval.group_kfold import run_group_kfold

        return run_group_kfold(
            samples_path,
            out_dir,
            cfg,
            cv_epochs=_lab_cv_epochs(),
            seed=seed,
        )
    except Exception as e:
        logger.exception("group k-fold failed")
        report = {"status": "failed", "error": str(e)[:500], "folds": [], "summary": {}}
        (out_dir / "kfold_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        return report


def _write_holdout_report(out_dir: Path, profile: LabProfile) -> None:
    m = parse_manifest(profile)
    words = [spec.get("word") for spec in m.checks if spec.get("word")]
    report = {
        "status": "feedback_only",
        "validation_words": words,
        "note": "Validation checks are user-feedback only; no ground-truth MAE.",
    }
    (out_dir / "holdout_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


def _run_training_thread(profile_id: str, run_id: str) -> None:
    repo_root = get_repo_root()
    out_dir = (repo_root / "data" / "lab_training_runs" / run_id).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    samples_path = out_dir / "letter_sequence_samples.jsonl"

    db = SessionLocal()
    seed_for_yaml = 42
    profile_ref: LabProfile | None = None
    try:
        profile = db.query(LabProfile).filter(LabProfile.id == profile_id).first()
        run_row = db.query(LabTrainingRun).filter(LabTrainingRun.id == run_id).first()
        if not profile or not run_row:
            return
        profile_ref = profile
        seed_for_yaml = int(profile.seed)
        n = write_samples_jsonl(db, profile, samples_path)
        run_row.train_sample_count = n
        run_row.status = "running"
        profile.training_status = "running"
        if n < 1:
            run_row.status = "failed"
            run_row.error_message = "no training samples; anchor letters or complete coverage first"
            run_row.finished_at = _utc_now()
            profile.training_status = "failed"
            db.commit()
            return
        db.commit()
    except Exception as e:
        logger.exception("lab train prepare failed")
        _fail_run(run_id, profile_id, str(e)[:8000])
        return
    finally:
        db.close()

    cfg = _build_lab_train_yaml(out_dir, seed_for_yaml)
    _run_kfold_cv(samples_path, out_dir, cfg, seed_for_yaml)

    env = os.environ.copy()
    pkg = repo_root / "packages" / "letter_sequence"
    prev = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = str(pkg) + (os.pathsep + prev if prev else "")

    train_cmd = [
        sys.executable,
        str(repo_root / "scripts" / "train_letter_sequence_model.py"),
        "--config",
        str(out_dir / "run_config.yaml"),
        "--samples-jsonl",
        str(samples_path),
        "--out-dir",
        str(out_dir),
        "--epochs",
        str(_lab_train_epochs()),
    ]
    try:
        proc = subprocess.Popen(
            train_cmd,
            cwd=str(repo_root),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        with _lock:
            _running[run_id] = proc
        err = proc.communicate()[1]
        with _lock:
            _running.pop(run_id, None)
        if proc.returncode != 0:
            msg = (err.decode("utf-8", errors="replace") if err else "") or f"exit {proc.returncode}"
            _fail_run(run_id, profile_id, msg[:8000])
            return
    except Exception as e:
        logger.exception("lab train subprocess failed")
        with _lock:
            _running.pop(run_id, None)
        _fail_run(run_id, profile_id, str(e)[:8000])
        return

    ckpt = out_dir / "letter_sequence.pt"
    if not ckpt.is_file():
        _fail_run(run_id, profile_id, "missing letter_sequence.pt after train")
        return

    db2 = SessionLocal()
    try:
        profile = db2.query(LabProfile).filter(LabProfile.id == profile_id).first()
        run_row = db2.query(LabTrainingRun).filter(LabTrainingRun.id == run_id).first()
        if profile:
            _write_holdout_report(out_dir, profile)
        if profile and run_row:
            run_row.status = "succeeded"
            run_row.checkpoint_uri = str(ckpt.resolve())
            run_row.finished_at = _utc_now()
            profile.active_checkpoint_uri = str(ckpt.resolve())
            profile.training_status = "succeeded"
            db2.commit()
    finally:
        db2.close()


def _fail_run(run_id: str, profile_id: str, message: str) -> None:
    db = SessionLocal()
    try:
        profile = db.query(LabProfile).filter(LabProfile.id == profile_id).first()
        run_row = db.query(LabTrainingRun).filter(LabTrainingRun.id == run_id).first()
        if run_row:
            run_row.status = "failed"
            run_row.error_message = message
            run_row.finished_at = _utc_now()
        if profile:
            profile.training_status = "failed"
        db.commit()
    finally:
        db.close()


def read_kfold_report(run_id: str) -> dict:
    p = get_repo_root() / "data" / "lab_training_runs" / run_id / "kfold_report.json"
    if not p.is_file():
        return {"status": "missing"}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"status": "invalid"}


def read_holdout_report(run_id: str) -> dict:
    p = get_repo_root() / "data" / "lab_training_runs" / run_id / "holdout_report.json"
    if not p.is_file():
        return {"status": "missing"}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"status": "invalid"}


def start_lab_training(profile_id: str, triggered_by: str = "manual") -> str:
    """Create run row and spawn daemon thread."""
    db = SessionLocal()
    try:
        profile = db.query(LabProfile).filter(LabProfile.id == profile_id).first()
        if not profile:
            raise ValueError("profile not found")
        import uuid

        run_id = str(uuid.uuid4())
        row = LabTrainingRun(
            id=run_id,
            profile_id=profile_id,
            status="queued",
            triggered_by=triggered_by,
            train_sample_count=0,
        )
        db.add(row)
        profile.training_status = "queued"
        db.commit()
    finally:
        db.close()

    t = threading.Thread(
        target=_run_training_thread,
        args=(profile_id, run_id),
        daemon=True,
        name=f"lab-train-{run_id[:8]}",
    )
    t.start()
    return run_id
