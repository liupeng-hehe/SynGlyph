"""Resolve monorepo root (SynGlyph/) from paths under apps/api/."""

from pathlib import Path

_REPO_ROOT: Path | None = None


def get_repo_root() -> Path:
    global _REPO_ROOT
    if _REPO_ROOT is None:
        # apps/api/app/utils/repo_root.py -> parents[4] == repo root
        _REPO_ROOT = Path(__file__).resolve().parents[4]
    return _REPO_ROOT
