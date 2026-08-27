"""Batch model predictions for AL component uncertainty values."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import ModelSnapshot
from app.services.letter_sequence_checkpoint_resolve import resolve_letter_sequence_checkpoint
from letter_sequence.al.batch_uncertainty import batch_uncertainty_for_texts

_model_cache: dict[str, object] = {"path": None, "model": None}


@dataclass(frozen=True)
class ALPredictionRow:
    stimulus_id: str
    text: str
    boundary_uncertainty: float
    segment_attribute_uncertainty: float


def _resolve_model_snapshot_id(
    db: Session, *, checkpoint_path: Path, explicit_snapshot_id: str | None
) -> str | None:
    if explicit_snapshot_id:
        return explicit_snapshot_id
    resolved = str(checkpoint_path.expanduser().resolve())
    snap = db.query(ModelSnapshot).filter(ModelSnapshot.checkpoint_uri == resolved).first()
    if snap:
        return snap.id
    snap = (
        db.query(ModelSnapshot)
        .filter(ModelSnapshot.checkpoint_uri.isnot(None))
        .order_by(ModelSnapshot.created_at.desc())
        .first()
    )
    if snap and Path(snap.checkpoint_uri).expanduser().resolve() == checkpoint_path.expanduser().resolve():
        return snap.id
    return None


def _load_model(checkpoint_path: Path):
    import torch
    from letter_sequence.models.letter_sequence_model import letter_sequence_model_from_config
    from letter_sequence.training.io import load_checkpoint

    path_str = str(checkpoint_path.expanduser().resolve())
    if _model_cache["path"] != path_str or _model_cache["model"] is None:
        ckpt = load_checkpoint(checkpoint_path, map_location=torch.device("cpu"))
        cfg = ckpt.get("config") or {}
        model = letter_sequence_model_from_config(cfg)
        model.load_state_dict(ckpt["model_state"])
        model.eval()
        _model_cache["path"] = path_str
        _model_cache["model"] = model
    return _model_cache["model"]


def score_candidate_stimuli(
    db: Session,
    *,
    candidates: list[tuple[str, str]],
    snapshot_id: str | None,
    checkpoint_path_override: str | None,
    batch_size: int = 64,
) -> tuple[list[ALPredictionRow], str | None]:
    if not candidates:
        return [], None

    ckpt_path = resolve_letter_sequence_checkpoint(
        db, snapshot_id=snapshot_id, checkpoint_path_override=checkpoint_path_override
    )
    if ckpt_path is None:
        out = [
            ALPredictionRow(
                stimulus_id=sid,
                text=text,
                boundary_uncertainty=0.0,
                segment_attribute_uncertainty=0.0,
            )
            for sid, text in candidates
        ]
        return out, None

    import torch

    model = _load_model(ckpt_path)
    used_snapshot_id = _resolve_model_snapshot_id(
        db, checkpoint_path=ckpt_path, explicit_snapshot_id=snapshot_id
    )

    dev = torch.device("cpu")
    texts = [t for _, t in candidates]
    pairs = batch_uncertainty_for_texts(model, texts, device=dev, batch_size=batch_size)
    output = [
        ALPredictionRow(stimulus_id=sid, text=text, boundary_uncertainty=b, segment_attribute_uncertainty=a)
        for (sid, text), (b, a) in zip(candidates, pairs)
    ]
    return output, used_snapshot_id
