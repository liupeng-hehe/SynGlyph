"""Resolve repo artifacts directory without importing the FastAPI app."""

from __future__ import annotations

import os
from pathlib import Path


def repo_root() -> Path:
    """``packages/letter_sequence/letter_sequence/paths.py`` -> monorepo root."""
    return Path(__file__).resolve().parents[3]


def default_artifacts_root() -> Path:
    r = os.environ.get("ARTIFACTS_ROOT")
    if r:
        return Path(r).expanduser().resolve()
    return (repo_root() / "artifacts").resolve()


def experiment_run_dir(experiment_run_id: str) -> Path:
    p = default_artifacts_root() / "experiments" / experiment_run_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def dataset_version_dir(dataset_version_id: str) -> Path:
    p = default_artifacts_root() / "datasets" / dataset_version_id
    return p
