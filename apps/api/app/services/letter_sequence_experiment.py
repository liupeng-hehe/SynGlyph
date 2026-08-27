"""Optional helpers for experiment artifact paths (API layer; core logic lives in letter_sequence package)."""

from __future__ import annotations

from pathlib import Path

from app.services.artifact_paths import file_uri
from app.utils.repo_root import get_repo_root


def experiments_root() -> Path:
    from app.db import settings

    if settings.artifacts_root:
        return Path(settings.artifacts_root).expanduser().resolve() / "experiments"
    return get_repo_root() / "artifacts" / "experiments"


def experiment_final_summary_uri(experiment_run_id: str) -> str:
    p = experiments_root() / experiment_run_id / "final_summary.json"
    return file_uri(p) if p.is_file() else ""
