"""HTTP API: letter-sequence model predictions for annotation preview."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Stimulus
from app.models.model_snapshot import ModelSnapshot
from app.services.deployment_resolution import AmbiguousActiveDeploymentError
from app.services.letter_sequence_checkpoint_resolve import resolve_letter_sequence_checkpoint
from app.services.letter_sequence_predict import predict_word
from app.services.stable_checkpoints import get_stable_by_id

router = APIRouter(prefix="/api/letter-sequence", tags=["letter-sequence"])


def _resolve_checkpoint_or_raise(
    db: Session,
    snapshot_id: str | None,
    checkpoint_path: str | None,
) -> Path:
    if snapshot_id:
        snap = db.query(ModelSnapshot).filter(ModelSnapshot.id == snapshot_id).first()
        if not snap:
            raise HTTPException(status_code=404, detail="Snapshot not found")

    try:
        ckpt = resolve_letter_sequence_checkpoint(
            db,
            snapshot_id=snapshot_id,
            checkpoint_path_override=checkpoint_path,
        )
    except AmbiguousActiveDeploymentError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    if checkpoint_path and not ckpt:
        raise HTTPException(
            status_code=400,
            detail=f"Checkpoint file not found: {checkpoint_path}",
        )
    if snapshot_id and not ckpt:
        snap = db.query(ModelSnapshot).filter(ModelSnapshot.id == snapshot_id).first()
        if snap:
            raise HTTPException(
                status_code=400,
                detail=f"Checkpoint file not found: {snap.checkpoint_uri}",
            )
    if not ckpt:
        raise HTTPException(
            status_code=503,
            detail="No letter-sequence checkpoint: pick a snapshot, set LETTER_SEQUENCE_CHECKPOINT, promote a champion, or save a model snapshot.",
        )
    return ckpt


def _resolve_predict_paths(
    db: Session,
    *,
    snapshot_id: str | None,
    checkpoint_path: str | None,
    checkpoint_id: str | None,
) -> tuple[Path, str | None, str | None]:
    """
    Returns ``(ckpt_path, stable_checkpoint_id, onnx_path_str)``.
    If ``checkpoint_id`` is set, the stable manifest is the only source for the .pt path.
    """
    if checkpoint_id and checkpoint_id.strip():
        sc = get_stable_by_id(checkpoint_id.strip())
        if not sc:
            raise HTTPException(status_code=404, detail=f"Unknown stable checkpoint_id: {checkpoint_id}")
        if not sc.pt_exists:
            raise HTTPException(
                status_code=400, detail=f"Checkpoint file not found: {sc.path}"
            )
        onx = str(sc.onnx_path) if (sc.onnx_path and sc.onnx_path.is_file()) else None
        return sc.path, sc.checkpoint_id, onx
    ck = _resolve_checkpoint_or_raise(db, snapshot_id, checkpoint_path)
    return ck, None, None


def _inference_metadata(
    *,
    backend: str,
    checkpoint_id: str | None,
) -> dict[str, str | None]:
    b = (backend or "pytorch").strip().lower()
    note: str | None = None
    if b == "onnx":
        note = "deployed inference path (ONNX Runtime)"
    return {
        "inference_backend": b,
        "checkpoint_id": checkpoint_id,
        "runtime_note": note,
    }


class PredictTextBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)
    snapshot_id: str | None = None
    checkpoint_path: str | None = None
    checkpoint_id: str | None = None
    backend: str | None = Field(
        default="pytorch", description="pytorch (default) or onnx for deploy validation"
    )
    mode: str | None = Field(default=None, description="word_mono | fine_grained (informational)")
    user_id: str | None = None
    session_id: str | None = None
    preprocessing_override: dict | None = Field(
        default=None,
        description="Optional cached feature_matrix from prior /api/phonology or client cache",
    )
    include_pairwise: bool = True


@router.get("/predict/{stimulus_id}")
def predict_for_stimulus(
    stimulus_id: str,
    snapshot_id: str | None = Query(None),
    checkpoint_path: str | None = Query(None),
    checkpoint_id: str | None = Query(None),
    backend: str | None = Query("pytorch"),
    db: Session = Depends(get_db),
):
    stim = db.query(Stimulus).filter(Stimulus.id == stimulus_id).first()
    if not stim:
        raise HTTPException(status_code=404, detail="Stimulus not found")

    ckpt, stable_id, onnx_p = _resolve_predict_paths(
        db, snapshot_id=snapshot_id, checkpoint_path=checkpoint_path, checkpoint_id=checkpoint_id
    )
    b = (backend or "pytorch").strip().lower()
    op = Path(onnx_p) if onnx_p else None

    word = stim.text or ""
    try:
        out = predict_word(ckpt, word, backend=b, onnx_path=op)
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {e!s}") from e

    return {
        "stimulus_id": stimulus_id,
        **out,
        **_inference_metadata(backend=b, checkpoint_id=stable_id),
    }


@router.post("/predict-text")
def predict_text(body: PredictTextBody, db: Session = Depends(get_db)):
    """Predict Lab / P×S / boundary for arbitrary text (e.g. Text reveal)."""
    raw = body.text
    if not raw or not raw.strip():
        raise HTTPException(status_code=400, detail="Text is empty")

    b = (body.backend or "pytorch").strip().lower()
    if b not in ("pytorch", "onnx"):
        raise HTTPException(status_code=400, detail="backend must be pytorch or onnx")
    ckpt, stable_id, onnx_p = _resolve_predict_paths(
        db,
        snapshot_id=body.snapshot_id,
        checkpoint_path=body.checkpoint_path,
        checkpoint_id=body.checkpoint_id,
    )
    op = Path(onnx_p) if onnx_p else None

    try:
        out = predict_word(
            ckpt,
            raw,
            backend=b,
            onnx_path=op,
            preprocessing_override=body.preprocessing_override,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {e!s}") from e

    meta = {**_inference_metadata(backend=b, checkpoint_id=stable_id)}
    if body.mode:
        meta["mode"] = body.mode
    if body.user_id:
        meta["user_id"] = body.user_id
    if body.session_id:
        meta["session_id"] = body.session_id
    if not body.include_pairwise:
        out.pop("pairwise", None)
    return {**out, **meta}
