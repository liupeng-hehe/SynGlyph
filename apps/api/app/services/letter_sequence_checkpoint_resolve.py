"""Resolve letter-sequence checkpoint path: explicit → env → champion deployment → latest snapshot."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.db import settings
from app.models.model_snapshot import ModelSnapshot
from app.services.deployment_resolution import AmbiguousActiveDeploymentError, get_active_deployment

ENGLISH_PRODUCT_LINE = "english"
LETTER_SEQUENCE_TASK = "letter_sequence"
DEFAULT_ALIAS = "champion"


def describe_active_champion_letter_sequence(
    db: Session,
    *,
    environment: str | None = None,
    alias: str = DEFAULT_ALIAS,
) -> dict[str, str | bool | None]:
    """Structured champion resolution for BYO health checks and ops scripts.

    ``environment`` defaults to ``settings.ml_environment`` (``SYNGLYPH_ML_ENV``).
    """
    env = settings.ml_environment if environment is None else environment
    out: dict[str, str | bool | None] = {"environment": env, "ok": False}
    try:
        dep = get_active_deployment(
            db,
            environment=env,
            product_line=ENGLISH_PRODUCT_LINE,
            task_name=LETTER_SEQUENCE_TASK,
            alias=alias,
        )
    except AmbiguousActiveDeploymentError as e:
        out["reason"] = "ambiguous_active_deployment"
        out["detail"] = str(e)
        return out

    if not dep:
        out["reason"] = "no_active_deployment"
        out["detail"] = (
            "No active MLDeployment champion for english/letter_sequence in this environment. "
            "BYO preview uses rule_fallback until a checkpoint is promoted."
        )
        return out

    snap = db.query(ModelSnapshot).filter(ModelSnapshot.id == dep.model_snapshot_id).first()
    if not snap:
        out["reason"] = "snapshot_row_missing"
        out["detail"] = f"model_snapshot id={dep.model_snapshot_id} not found"
        return out
    if not snap.checkpoint_uri:
        out["reason"] = "snapshot_missing_checkpoint_uri"
        out["detail"] = f"model_snapshot id={snap.id} has empty checkpoint_uri"
        return out

    path = Path(snap.checkpoint_uri).expanduser()
    if not path.is_file():
        out["reason"] = "checkpoint_not_readable"
        out["checkpoint_uri"] = str(path)
        out["detail"] = "Checkpoint path is not a readable file on this host (wrong volume or not synced)."
        return out

    out["ok"] = True
    out["reason"] = None
    out["detail"] = None
    out["checkpoint_uri"] = str(path.resolve())
    out["snapshot_id"] = snap.id
    out["model_family"] = snap.model_family
    return out


def resolve_active_champion_checkpoint_path(
    db: Session,
    *,
    environment: str | None = None,
    alias: str = DEFAULT_ALIAS,
) -> Path | None:
    """Return filesystem path for active english/letter_sequence champion if readable."""
    info = describe_active_champion_letter_sequence(db, environment=environment, alias=alias)
    if info.get("ok") is True and info.get("checkpoint_uri"):
        return Path(str(info["checkpoint_uri"]))
    return None


def resolve_letter_sequence_checkpoint(
    db: Session,
    *,
    snapshot_id: str | None,
    checkpoint_path_override: str | None,
) -> Path | None:
    """
    Resolution order:
    1. ``checkpoint_path_override`` if present and file exists
    2. ``snapshot_id`` if present (ModelSnapshot.checkpoint_uri)
    3. ``LETTER_SEQUENCE_CHECKPOINT`` (settings) if file exists
    4. Active ``ml_deployment`` champion for english/letter_sequence
    5. Latest ``ModelSnapshot`` by ``created_at``
    """
    if checkpoint_path_override:
        p = Path(checkpoint_path_override).expanduser()
        return p if p.is_file() else None

    if snapshot_id:
        snap = db.query(ModelSnapshot).filter(ModelSnapshot.id == snapshot_id).first()
        if not snap:
            return None
        p = Path(snap.checkpoint_uri).expanduser()
        return p if p.is_file() else None

    if settings.letter_sequence_checkpoint:
        p = Path(settings.letter_sequence_checkpoint).expanduser()
        if p.is_file():
            return p

    p_champ = resolve_active_champion_checkpoint_path(db)
    if p_champ:
        return p_champ

    snap = db.query(ModelSnapshot).order_by(ModelSnapshot.created_at.desc()).first()
    if snap and snap.checkpoint_uri:
        p = Path(snap.checkpoint_uri).expanduser()
        if p.is_file():
            return p
    return None
