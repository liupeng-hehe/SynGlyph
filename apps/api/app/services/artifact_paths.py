"""Local file:// artifact layout for Phase 1 (datasets / models / evals)."""

from __future__ import annotations

from pathlib import Path

from app.utils.repo_root import get_repo_root


def _artifacts_root() -> Path:
    from app.db import settings

    if settings.artifacts_root:
        return Path(settings.artifacts_root).expanduser().resolve()
    return (get_repo_root() / "artifacts").resolve()


def dataset_version_dir(dataset_version_id: str) -> Path:
    p = _artifacts_root() / "datasets" / dataset_version_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def model_snapshot_dir(model_snapshot_id: str) -> Path:
    p = _artifacts_root() / "models" / model_snapshot_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def evaluation_run_dir(evaluation_run_id: str) -> Path:
    p = _artifacts_root() / "evals" / evaluation_run_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def file_uri(path: Path) -> str:
    """Return file:///absolute/path (RFC 8089 style)."""
    abs_p = path.expanduser().resolve()
    return abs_p.as_uri()
