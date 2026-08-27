"""Letter-sequence training runs, live metrics, model snapshots."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.model_snapshot import ModelSnapshot
from app.models.training_run import TrainingRun
from app.schemas.training import (
    CreateSnapshotRequest,
    CreateTrainingRunRequest,
    ModelSnapshotResponse,
    TrainingMetricsResponse,
    TrainingRunResponse,
)
from app.services.model_snapshot_service import create_model_snapshot
from app.services.training_manager import (
    read_metrics_file,
    read_progress,
    start_training_run,
    stop_training_run,
)

router = APIRouter(prefix="/api/training", tags=["training"])

_CANONICAL_FAMILIES = frozenset({"bilstm", "mlp"})


def _model_family_from_training_run_config(r: TrainingRun) -> str:
    """Resolve model_family from persisted Workbench payload; default bilstm for legacy rows."""
    try:
        full = json.loads(r.config_json or "{}")
        hp = full.get("hyperparams")
        if isinstance(hp, dict):
            mf = hp.get("model_family")
            if isinstance(mf, str) and mf in _CANONICAL_FAMILIES:
                return mf
    except (json.JSONDecodeError, TypeError, ValueError):
        pass
    return "bilstm"


def _run_to_response(r: TrainingRun) -> TrainingRunResponse:
    return TrainingRunResponse(
        id=r.id,
        status=r.status,
        dataset_id=r.dataset_id,
        out_dir=r.out_dir,
        config_json=r.config_json,
        error_message=r.error_message,
        started_at=r.started_at.isoformat() if r.started_at else None,
        finished_at=r.finished_at.isoformat() if r.finished_at else None,
        best_val_loss=r.best_val_loss,
        n_samples=r.n_samples,
        n_unique_words=r.n_unique_words,
        process_pid=r.process_pid,
    )


def _snap_to_response(s: ModelSnapshot) -> ModelSnapshotResponse:
    metrics: dict | None = None
    if s.metrics_json:
        try:
            metrics = json.loads(s.metrics_json)
        except (json.JSONDecodeError, TypeError):
            pass
    return ModelSnapshotResponse(
        id=s.id,
        training_run_id=s.training_run_id,
        name=s.name,
        checkpoint_uri=s.checkpoint_uri,
        config_json=s.config_json,
        best_val_loss=s.best_val_loss,
        n_samples=s.n_samples,
        n_unique_words=s.n_unique_words,
        created_at=s.created_at.isoformat() if s.created_at else "",
        model_family=s.model_family,
        metrics_json=metrics,
        dataset_version_id=s.dataset_version_id,
        git_sha=s.git_sha,
    )


@router.get("/runs", response_model=list[TrainingRunResponse])
def list_runs(
    limit: int = Query(30, ge=1, le=200),
    db: Session = Depends(get_db),
):
    rows = db.query(TrainingRun).order_by(TrainingRun.started_at.desc()).limit(limit).all()
    return [_run_to_response(r) for r in rows]


@router.post("/runs", response_model=TrainingRunResponse)
def create_run(body: CreateTrainingRunRequest, db: Session = Depends(get_db)):
    ds = (body.dataset_id or "").strip() or None
    row = start_training_run(ds, body.hyperparams)
    return _run_to_response(row)


@router.get("/runs/{run_id}", response_model=TrainingRunResponse)
def get_run(run_id: str, db: Session = Depends(get_db)):
    r = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_to_response(r)


@router.get("/runs/{run_id}/metrics", response_model=TrainingMetricsResponse)
def get_run_metrics(run_id: str, db: Session = Depends(get_db)):
    r = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Run not found")
    prog = read_progress(run_id)
    metrics = read_metrics_file(run_id) if r.status == "finished" else None
    return TrainingMetricsResponse(run_id=run_id, status=r.status, progress=prog, metrics_json=metrics)


@router.post("/runs/{run_id}/stop")
def stop_run(run_id: str, db: Session = Depends(get_db)):
    r = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Run not found")
    if r.status != "running":
        return {"ok": False, "message": "Run is not running"}
    ok = stop_training_run(run_id)
    return {"ok": ok}


@router.post("/runs/{run_id}/snapshots", response_model=ModelSnapshotResponse)
def save_snapshot(
    run_id: str,
    body: CreateSnapshotRequest,
    db: Session = Depends(get_db),
):
    r = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Run not found")
    if r.status != "finished":
        raise HTTPException(status_code=400, detail="Can only snapshot after training finished successfully")
    ckpt = Path(r.out_dir) / "letter_sequence.pt"
    if not ckpt.is_file():
        raise HTTPException(status_code=400, detail="Checkpoint not found on disk")

    n_words = r.n_unique_words or 0
    auto_name = f"model_manual_words{n_words}"
    name = (body.name or "").strip() or auto_name

    snap = create_model_snapshot(
        db,
        r,
        checkpoint_path=ckpt,
        dataset_version_id=r.dataset_version_id,
        git_sha=r.git_sha,
        name=name,
        metrics_json=None,
        model_family=_model_family_from_training_run_config(r),
    )
    db.commit()
    db.refresh(snap)
    return _snap_to_response(snap)


@router.get("/snapshots", response_model=list[ModelSnapshotResponse])
def list_snapshots(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    rows = db.query(ModelSnapshot).order_by(ModelSnapshot.created_at.desc()).limit(limit).all()
    return [_snap_to_response(s) for s in rows]


@router.get("/snapshots/compare")
def compare_snapshots(
    ids: list[str] = Query(..., description="Repeated ?ids= snapshot IDs to compare"),
    db: Session = Depends(get_db),
):
    """Compare metrics across multiple snapshots side-by-side.

    Pass multiple ?ids=<id1>&ids=<id2> parameters. Also shows the current
    champion deployment so the caller knows which snapshot is live in the
    BYO rebase path.
    """
    from app.models.ml_deployment import MLDeployment
    from app.models.ml_evaluation_run import MLEvaluationRun

    snaps = db.query(ModelSnapshot).filter(ModelSnapshot.id.in_(ids)).all()
    if not snaps:
        raise HTTPException(status_code=404, detail="no snapshots found for given ids")

    champion_dep = (
        db.query(MLDeployment)
        .filter(
            MLDeployment.environment == "production",
            MLDeployment.product_line == "english",
            MLDeployment.task_name == "letter_sequence",
            MLDeployment.alias == "champion",
            MLDeployment.is_active.is_(True),
        )
        .first()
    )

    snap_ids = [s.id for s in snaps]
    eval_rows = (
        db.query(MLEvaluationRun)
        .filter(MLEvaluationRun.model_snapshot_id.in_(snap_ids))
        .all()
    )
    evals_by_snap: dict[str, list] = {sid: [] for sid in snap_ids}
    for e in eval_rows:
        evals_by_snap[e.model_snapshot_id].append(e)

    rows_out = []
    for s in sorted(snaps, key=lambda x: x.created_at or "", reverse=True):
        snap_metrics: dict | None = None
        if s.metrics_json:
            try:
                snap_metrics = json.loads(s.metrics_json)
            except (json.JSONDecodeError, TypeError):
                pass
        eval_summary: dict[str, Any] = {}
        for e in evals_by_snap.get(s.id, []):
            if e.metrics_json:
                try:
                    eval_summary[e.split_name] = json.loads(e.metrics_json)
                except (json.JSONDecodeError, TypeError):
                    pass
        rows_out.append(
            {
                "snapshot_id": s.id,
                "name": s.name,
                "model_family": s.model_family,
                "best_val_loss": s.best_val_loss,
                "n_samples": s.n_samples,
                "n_unique_words": s.n_unique_words,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "is_champion": champion_dep is not None and champion_dep.model_snapshot_id == s.id,
                "metrics": snap_metrics,
                "eval": eval_summary,
            }
        )

    return {
        "snapshots": rows_out,
        "champion_snapshot_id": champion_dep.model_snapshot_id if champion_dep else None,
    }


def _snapshot_model_family(s: ModelSnapshot) -> str:
    from letter_sequence.models.model_factory import normalize_model_family

    if s.model_family and str(s.model_family).strip():
        return normalize_model_family(str(s.model_family))
    try:
        cj = json.loads(s.config_json or "{}")
        mf = cj.get("model_family")
        if isinstance(mf, str) and mf.strip():
            return normalize_model_family(mf)
    except (json.JSONDecodeError, TypeError, ValueError):
        pass
    return normalize_model_family(None)


@router.post("/snapshots/{snapshot_id}/export-onnx")
def export_snapshot_to_onnx(
    snapshot_id: str,
    output_dir: str | None = Query(
        None,
        description="Directory for model.onnx and export_report.json; default: <checkpoint_dir>/onnx_runtime",
    ),
    db: Session = Depends(get_db),
):
    """
    One-click ONNX export for a **saved** model snapshot (BiLSTM only).
    Requires ``ENABLE_MODEL_RUNTIME_MUTATIONS=1`` (same as ``/api/models/export-onnx``).
    """
    from app.services.mutation_guards import enable_model_runtime_mutations

    if not enable_model_runtime_mutations():
        raise HTTPException(
            status_code=403,
            detail="Set ENABLE_MODEL_RUNTIME_MUTATIONS=1 to export ONNX from the workbench or API",
        )

    s = db.query(ModelSnapshot).filter(ModelSnapshot.id == snapshot_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    fam = _snapshot_model_family(s)
    if fam != "bilstm":
        raise HTTPException(
            status_code=400,
            detail=f"ONNX export is only supported for model_family bilstm; this snapshot is {fam!r}",
        )

    ck = Path(s.checkpoint_uri).expanduser()
    if not ck.is_file():
        raise HTTPException(status_code=400, detail=f"Checkpoint file not found: {ck}")

    out = Path(output_dir).expanduser().resolve() if output_dir and output_dir.strip() else ck.parent / "onnx_runtime"
    out.mkdir(parents=True, exist_ok=True)

    try:
        from letter_sequence.onnx.export_bilstm import export_bilstm_to_onnx

        report = export_bilstm_to_onnx(ck, out, opset=14, dry_run=False)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"ONNX export failed: {e!s}") from e

    return {
        "ok": True,
        "snapshot_id": snapshot_id,
        "checkpoint_path": str(ck),
        "output_dir": str(out.resolve()),
        "report": report,
    }


class PaletteBody(BaseModel):
    palette: dict[str, list[float]]  # letter -> [L, a, b]


@router.post("/palette")
def save_palette(body: PaletteBody):
    """Save the trainer's 26-letter Lab palette to disk for use in inference-time rebasing."""
    from app.services.trainer_palette import save_trainer_palette

    raw = body.palette
    if not raw or not isinstance(raw, dict):
        raise HTTPException(status_code=422, detail="palette must be a non-empty dict")
    # Validate: keys must be single lowercase alpha letters, values must be [L,a,b] triples
    cleaned: dict[str, list[float]] = {}
    for k, v in raw.items():
        k = k.lower().strip()
        if len(k) != 1 or not k.isalpha():
            raise HTTPException(status_code=422, detail=f"palette key {k!r} is not a single letter")
        if not isinstance(v, (list, tuple)) or len(v) != 3:
            raise HTTPException(status_code=422, detail=f"palette[{k!r}] must be a 3-element [L,a,b] list")
        try:
            cleaned[k] = [float(v[0]), float(v[1]), float(v[2])]
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=f"palette[{k!r}] has non-numeric values") from exc
    save_trainer_palette(cleaned)
    return {"ok": True, "letters_saved": len(cleaned)}


@router.get("/palette")
def get_palette():
    """Return the currently saved trainer palette (or empty dict if none saved)."""
    from app.services.trainer_palette import load_trainer_palette

    palette = load_trainer_palette()
    return {"palette": palette or {}, "letters_count": len(palette) if palette else 0}


# ---------------------------------------------------------------------------
# Deployment management
# ---------------------------------------------------------------------------

class PromoteSnapshotBody(BaseModel):
    snapshot_id: str
    environment: str = Field(default="production", max_length=32)
    product_line: str = Field(default="english", max_length=64)
    task_name: str = Field(default="letter_sequence", max_length=128)
    alias: str = Field(default="champion", max_length=64)
    notes: str | None = None


@router.post("/deployments")
def promote_snapshot(body: PromoteSnapshotBody, db: Session = Depends(get_db)):
    """Promote a model snapshot to the active deployment alias (champion or candidate).

    This is the missing link that wires the trained model into the BYO rebase path:
    after promoting, _trainer_checkpoint() will find this snapshot and use it for
    inference-time palette rebasing in the public-facing BYO flow.
    """
    from app.services.ml_deployment_service import promote_model_snapshot

    snap = db.query(ModelSnapshot).filter(ModelSnapshot.id == body.snapshot_id).first()
    if not snap:
        raise HTTPException(status_code=404, detail="snapshot not found")
    if snap.checkpoint_uri and not Path(snap.checkpoint_uri).is_file():
        raise HTTPException(
            status_code=400,
            detail=f"checkpoint file not found on disk: {snap.checkpoint_uri}",
        )
    dep = promote_model_snapshot(
        db,
        model_snapshot_id=body.snapshot_id,
        environment=body.environment,
        product_line=body.product_line,
        task_name=body.task_name,
        alias=body.alias,
        notes=body.notes,
    )
    return {
        "ok": True,
        "deployment_id": dep.id,
        "snapshot_id": body.snapshot_id,
        "environment": dep.environment,
        "product_line": dep.product_line,
        "task_name": dep.task_name,
        "alias": dep.alias,
        "is_active": dep.is_active,
        "created_at": dep.created_at.isoformat() if dep.created_at else None,
    }


@router.get("/deployments")
def list_deployments(
    environment: str | None = Query(None),
    product_line: str | None = Query(None),
    task_name: str | None = Query(None),
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    """List deployment aliases — defaults to active deployments only."""
    from app.models.ml_deployment import MLDeployment

    q = db.query(MLDeployment)
    if active_only:
        q = q.filter(MLDeployment.is_active.is_(True))
    if environment:
        q = q.filter(MLDeployment.environment == environment)
    if product_line:
        q = q.filter(MLDeployment.product_line == product_line)
    if task_name:
        q = q.filter(MLDeployment.task_name == task_name)
    rows = q.order_by(MLDeployment.created_at.desc()).all()

    snap_ids = {r.model_snapshot_id for r in rows}
    snaps = {
        s.id: s
        for s in db.query(ModelSnapshot).filter(ModelSnapshot.id.in_(snap_ids)).all()
    }

    return [
        {
            "deployment_id": r.id,
            "environment": r.environment,
            "product_line": r.product_line,
            "task_name": r.task_name,
            "alias": r.alias,
            "is_active": r.is_active,
            "snapshot_id": r.model_snapshot_id,
            "snapshot_name": snaps[r.model_snapshot_id].name if r.model_snapshot_id in snaps else None,
            "best_val_loss": snaps[r.model_snapshot_id].best_val_loss if r.model_snapshot_id in snaps else None,
            "checkpoint_uri": snaps[r.model_snapshot_id].checkpoint_uri if r.model_snapshot_id in snaps else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "notes": r.notes,
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Snapshot evaluation results + cross-run comparison
# ---------------------------------------------------------------------------

@router.get("/snapshots/{snapshot_id}/eval")
def get_snapshot_eval(snapshot_id: str, db: Session = Depends(get_db)):
    """Return all evaluation runs for a snapshot (one per split: val, test)."""
    from app.models.ml_evaluation_run import MLEvaluationRun

    s = db.query(ModelSnapshot).filter(ModelSnapshot.id == snapshot_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="snapshot not found")
    evals = (
        db.query(MLEvaluationRun)
        .filter(MLEvaluationRun.model_snapshot_id == snapshot_id)
        .order_by(MLEvaluationRun.created_at.desc())
        .all()
    )
    return {
        "snapshot_id": snapshot_id,
        "snapshot_name": s.name,
        "best_val_loss": s.best_val_loss,
        "evals": [
            {
                "eval_id": e.id,
                "split_name": e.split_name,
                "status": e.status,
                "metrics": json.loads(e.metrics_json) if e.metrics_json else None,
                "dataset_version_id": e.dataset_version_id,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in evals
        ],
    }


