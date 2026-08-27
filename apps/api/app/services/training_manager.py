"""Spawn build + train subprocesses; track PIDs for stop; update TrainingRun rows."""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from app.db import SessionLocal
from app.models.training_run import TrainingRun
from app.schemas.training import TrainingHyperParams
from app.services.artifact_paths import dataset_version_dir
from app.services.letter_sequence_dataset_export import freeze_dataset_version, get_git_sha
from app.services.letter_sequence_evaluate import run_evaluation_for_snapshot
from app.services.model_snapshot_service import create_model_snapshot
from app.utils.repo_root import get_repo_root

logger = logging.getLogger(__name__)

# run_id -> Popen for train subprocess (after build completes)
_running_train: dict[str, subprocess.Popen] = {}
# run_ids for which user requested stop (avoid marking SIGTERM as failed)
_stopped_by_user: set[str] = set()
_lock = threading.Lock()


def _utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_run_config_yaml(hp: TrainingHyperParams) -> dict[str, Any]:
    """Build train_loop YAML dict for ``train_letter_sequence_model.py`` (canonical ``model_family``)."""
    fam = hp.model_family
    model: dict[str, Any] = {
        "model_family": fam,
        "emb_dim": hp.emb_dim,
        "pos_dim": hp.pos_dim,
        "dropout": hp.dropout,
        "max_len": 64,
        "num_layers": hp.num_layers,
    }
    if fam == "bilstm":
        model["hidden"] = hp.hidden_size
        model["use_extra_features"] = True
        model["extra_dim"] = 4
    elif fam == "mlp":
        model["hidden_dim"] = hp.hidden_size
        model["use_neighbor_char_emb"] = True

    return {
        "data": {
            "max_seq_len": 64,
            "train_ratio": hp.train_ratio,
            "split_seed": hp.split_seed,
            "split_key": "stimulus_id",
        },
        "model_family": fam,
        "model": model,
        "loss_weights": {
            "lab": hp.loss_lab,
            "prominence": hp.loss_prominence,
            "spread": hp.loss_spread,
            "boundary": hp.loss_boundary,
        },
        "train": {
            "epochs": hp.epochs,
            "batch_size": hp.batch_size,
            "lr": hp.learning_rate,
            "weight_decay": hp.weight_decay,
            "device": "cpu",
        },
    }


def _env_for_subprocess(repo_root: Path) -> dict[str, str]:
    env = os.environ.copy()
    pkg = repo_root / "packages" / "letter_sequence"
    prev = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = str(pkg) + (os.pathsep + prev if prev else "")
    api_url = os.environ.get("SYNGLYPH_API_URL", "http://127.0.0.1:8000")
    env["SYNGLYPH_API_URL"] = api_url
    return env


def _run_pipeline(
    run_id: str,
    dataset_id: str | None,
    hp: TrainingHyperParams,
    full_config: dict[str, Any],
) -> None:
    repo_root = get_repo_root()
    out_dir = (repo_root / "data" / "training_runs" / run_id).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg_path = out_dir / "run_config.yaml"
    cfg_path.write_text(yaml.safe_dump(build_run_config_yaml(hp), sort_keys=False), encoding="utf-8")
    (out_dir / "run_config_full.json").write_text(json.dumps(full_config, indent=2), encoding="utf-8")

    env = _env_for_subprocess(repo_root)
    tr = float(hp.train_ratio)
    vr = (1.0 - tr) / 2.0
    samples_path: Path | None = None
    dv_id: str | None = None
    gsha: str | None = None

    db = SessionLocal()
    try:
        dv = freeze_dataset_version(
            db,
            source_mode="stimulus",
            dataset_id=dataset_id,
            split_seed=hp.split_seed,
            train_ratio=tr,
            val_ratio=vr,
            test_ratio=vr,
            created_by_run_id=run_id,
        )
        dv_id = dv.id
        gsha = dv.git_sha or get_git_sha()
        samples_path = dataset_version_dir(dv_id) / "letter_sequence_samples.jsonl"
        if dv.example_count == 0 or not samples_path.is_file():
            _update_run(
                run_id,
                status="failed",
                error_message="dataset freeze produced no examples",
                finished_at_now=True,
                clear_pid=True,
            )
            return
        _update_run(run_id, dataset_version_id=dv_id, git_sha=gsha)
    except Exception as e:
        logger.exception("dataset freeze failed")
        _update_run(
            run_id,
            status="failed",
            error_message=str(e)[:8000],
            finished_at_now=True,
            clear_pid=True,
        )
        return
    finally:
        db.close()

    train_cmd = [
        sys.executable,
        str(repo_root / "scripts" / "train_letter_sequence_model.py"),
        "--config",
        str(cfg_path),
        "--samples-jsonl",
        str(samples_path),
        "--out-dir",
        str(out_dir),
        "--epochs",
        str(hp.epochs),
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
            _running_train[run_id] = proc
        _update_run(run_id, process_pid=proc.pid)
        err = proc.communicate()[1]
        with _lock:
            _running_train.pop(run_id, None)
        if proc.returncode != 0:
            msg = (err.decode("utf-8", errors="replace") if err else "") or f"exit {proc.returncode}"
            _update_run(
                run_id,
                status="failed",
                error_message=msg[:8000],
                finished_at_now=True,
                clear_pid=True,
            )
            return
    except Exception as e:
        logger.exception("train failed")
        with _lock:
            _running_train.pop(run_id, None)
        _update_run(
            run_id,
            status="failed",
            error_message=str(e)[:8000],
            finished_at_now=True,
            clear_pid=True,
        )
        return

    # Success: read meta + metrics
    meta_path = out_dir / "letter_sequence_meta.json"
    metrics_path = out_dir / "metrics.json"
    n_samples = None
    n_words = None
    best_val = None
    if meta_path.is_file():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            n_samples = meta.get("n_samples")
            n_words = meta.get("n_unique_words")
        except (json.JSONDecodeError, OSError):
            pass
    if metrics_path.is_file():
        try:
            m = json.loads(metrics_path.read_text(encoding="utf-8"))
            bv = m.get("best_val_loss")
            if bv is not None and bv != float("inf"):
                best_val = float(bv)
        except (json.JSONDecodeError, OSError, TypeError):
            pass

    if n_samples is None and samples_path and samples_path.is_file():
        dbm = SessionLocal()
        try:
            from app.models.ml_dataset_version import MLDatasetVersion

            if dv_id:
                dv_row = dbm.query(MLDatasetVersion).filter(MLDatasetVersion.id == dv_id).first()
                if dv_row:
                    n_samples = dv_row.example_count
        finally:
            dbm.close()
        try:
            words: set[str] = set()
            with samples_path.open(encoding="utf-8") as sf:
                for line in sf:
                    line = line.strip()
                    if not line:
                        continue
                    o = json.loads(line)
                    words.add((o.get("word_text") or "").strip().lower())
            if words:
                n_words = len(words)
        except (json.JSONDecodeError, OSError):
            pass

    _update_run(
        run_id,
        status="finished",
        best_val_loss=best_val,
        n_samples=n_samples,
        n_unique_words=n_words,
        finished_at_now=True,
        clear_pid=True,
    )

    if dv_id and samples_path and samples_path.is_file():
        db2 = SessionLocal()
        try:
            row = db2.query(TrainingRun).filter(TrainingRun.id == run_id).first()
            if row:
                metrics_obj: dict[str, Any] = {}
                if metrics_path.is_file():
                    try:
                        metrics_obj = json.loads(metrics_path.read_text(encoding="utf-8"))
                    except (json.JSONDecodeError, OSError):
                        pass
                val_detail = metrics_obj.get("val_detail")
                metrics_for_snap = val_detail if isinstance(val_detail, dict) else {}
                if not metrics_for_snap and best_val is not None:
                    metrics_for_snap = {"best_val_loss": best_val}
                mf = metrics_obj.get("model_family") or "bilstm"
                snap = create_model_snapshot(
                    db2,
                    row,
                    checkpoint_path=out_dir / "letter_sequence.pt",
                    dataset_version_id=dv_id,
                    git_sha=gsha,
                    metrics_json=metrics_for_snap or None,
                    model_family=mf,
                )
                db2.commit()
                run_evaluation_for_snapshot(
                    model_snapshot_id=snap.id,
                    dataset_version_id=dv_id,
                    samples_jsonl=samples_path,
                    split_name="val",
                    eval_config={"split": "val", "batch_size": 16},
                    git_sha=gsha,
                )
        except Exception:
            logger.exception("post-train snapshot or eval failed")
        finally:
            db2.close()


def _update_run(
    run_id: str,
    *,
    status: str | None = None,
    error_message: str | None = None,
    best_val_loss: float | None = None,
    n_samples: int | None = None,
    n_unique_words: int | None = None,
    finished_at_now: bool = False,
    clear_pid: bool = False,
    process_pid: int | None = None,
    dataset_version_id: str | None = None,
    git_sha: str | None = None,
) -> None:
    db = SessionLocal()
    try:
        row = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
        if not row:
            return
        if status is not None:
            row.status = status
        if error_message is not None:
            row.error_message = error_message
        if best_val_loss is not None:
            row.best_val_loss = best_val_loss
        if n_samples is not None:
            row.n_samples = n_samples
        if n_unique_words is not None:
            row.n_unique_words = n_unique_words
        if finished_at_now:
            row.finished_at = datetime.now(timezone.utc)
        if clear_pid:
            row.process_pid = None
        elif process_pid is not None:
            row.process_pid = process_pid
        if dataset_version_id is not None:
            row.dataset_version_id = dataset_version_id
        if git_sha is not None:
            row.git_sha = git_sha
        db.commit()
    finally:
        db.close()


def start_training_run(
    dataset_id: str | None,
    hp: TrainingHyperParams,
) -> TrainingRun:
    run_id = str(uuid.uuid4())
    repo_root = get_repo_root()
    out_dir = (repo_root / "data" / "training_runs" / run_id).resolve()
    full_config = {
        "dataset_id": dataset_id,
        "hyperparams": hp.model_dump(),
    }

    db = SessionLocal()
    try:
        row = TrainingRun(
            id=run_id,
            status="running",
            dataset_id=dataset_id,
            config_json=json.dumps(full_config),
            out_dir=str(out_dir),
            process_pid=None,
            error_message=None,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    finally:
        db.close()

    threading.Thread(
        target=_run_pipeline,
        args=(run_id, dataset_id, hp, full_config),
        daemon=True,
    ).start()

    db2 = SessionLocal()
    try:
        return db2.query(TrainingRun).filter(TrainingRun.id == run_id).one()
    finally:
        db2.close()


def stop_training_run(run_id: str) -> bool:
    """SIGTERM train subprocess. Returns True if a process was signalled."""
    with _lock:
        proc = _running_train.get(run_id)
        if proc is not None:
            _stopped_by_user.add(run_id)
    if proc is None:
        return False
    try:
        proc.terminate()
        return True
    except ProcessLookupError:
        with _lock:
            _stopped_by_user.discard(run_id)
        return False


def read_progress(run_id: str) -> dict[str, Any] | None:
    repo_root = get_repo_root()
    p = repo_root / "data" / "training_runs" / run_id / "progress.json"
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def read_metrics_file(run_id: str) -> dict[str, Any] | None:
    repo_root = get_repo_root()
    p = repo_root / "data" / "training_runs" / run_id / "metrics.json"
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
