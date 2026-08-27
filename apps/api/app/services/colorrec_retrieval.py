"""Lazy-loaded colorrec sentence-transformer retrieval for SynGlyph API."""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.db import settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_runtime: "ColorRecRuntime | None" = None
_load_error: str | None = None


@dataclass
class ColorRecRuntime:
    model_path: Path
    embeddings_path: Path
    metadata_path: Path
    config_path: Path
    encoder: Any
    embeddings: Any
    metadata: Any
    top_k_default: int
    normalize_embeddings: bool


def default_colorrec_repo_root() -> Path:
    if settings.colorrec_repo_root:
        return Path(settings.colorrec_repo_root).resolve()
    # apps/api/app/services -> SynGlyph/color-semantic-model
    return Path(__file__).resolve().parents[4] / "color-semantic-model"


def _resolve_colorrec_path(raw: str | Path, *, repo_root: Path) -> Path:
    p = Path(raw)
    return p.resolve() if p.is_absolute() else (repo_root / p).resolve()


def resolve_colorrec_assets() -> dict[str, Path | str | bool]:
    """Return resolved paths and readiness without loading the model."""
    repo_root = default_colorrec_repo_root()
    config_path = _resolve_colorrec_path(
        settings.colorrec_config or "configs/deploy_api.yaml",
        repo_root=repo_root,
    )

    from colorrec.config import get_path, load_config, resolve_path

    cfg = load_config(config_path)
    model_path = (
        Path(settings.colorrec_model_path).resolve()
        if settings.colorrec_model_path
        else resolve_path(str(cfg.train.get("final_model_dir", "")), base=repo_root)
    )

    if settings.colorrec_embeddings_path:
        embeddings_path = Path(settings.colorrec_embeddings_path).resolve()
    else:
        emb_candidates: list[Path] = []
        for key in ("candidate_embeddings", "fine_tuned_candidate_embeddings"):
            raw = cfg.paths.get(key)
            if raw:
                emb_candidates.append(resolve_path(str(raw), base=repo_root))
        emb_candidates.append(repo_root / "artifacts/candidate_bank/candidate_embeddings.npy")
        embeddings_path = next((p for p in emb_candidates if p.is_file()), emb_candidates[0])

    metadata_path = get_path(cfg, "candidate_metadata")
    if not metadata_path.is_absolute():
        metadata_path = resolve_path(str(cfg.paths["candidate_metadata"]), base=repo_root)

    missing: list[str] = []
    if not config_path.is_file():
        missing.append("config")
    if not model_path.is_dir():
        missing.append("model")
    if not embeddings_path.is_file():
        missing.append("embeddings")
    if not metadata_path.is_file():
        missing.append("metadata")

    ready = settings.colorrec_enabled and not missing

    return {
        "enabled": settings.colorrec_enabled,
        "ready": ready,
        "missing": missing,
        "repo_root": repo_root,
        "config_path": config_path,
        "model_path": model_path,
        "embeddings_path": embeddings_path,
        "metadata_path": metadata_path,
        "top_k_default": int(cfg.inference.get("top_k_default", 8)),
        "normalize_embeddings": bool(cfg.inference.get("normalize_embeddings", True)),
        "device": str(cfg.inference.get("device", "auto")),
    }


def colorrec_status() -> dict[str, Any]:
    global _load_error
    assets = resolve_colorrec_assets()
    status: dict[str, Any] = {
        "enabled": assets["enabled"],
        "ready": assets["ready"],
        "loaded": _runtime is not None,
        "repo_root": str(assets["repo_root"]),
        "config_path": str(assets["config_path"]),
        "model_path": str(assets["model_path"]),
        "embeddings_path": str(assets["embeddings_path"]),
        "metadata_path": str(assets["metadata_path"]),
    }
    if _load_error:
        status["load_error"] = _load_error
    if assets.get("missing"):
        status["missing"] = assets["missing"]
    status["top_k_default"] = assets.get("top_k_default", 8)
    return status


def _load_runtime() -> ColorRecRuntime:
    global _runtime, _load_error
    with _lock:
        if _runtime is not None:
            return _runtime

        assets = resolve_colorrec_assets()
        if not assets["enabled"]:
            raise RuntimeError("colorrec is disabled (COLORREC_ENABLED=false)")
        if not assets["ready"]:
            missing = assets.get("missing") or ["assets"]
            raise FileNotFoundError(
                f"colorrec assets incomplete: missing {', '.join(missing)}"
            )

        from colorrec.config import load_config
        from colorrec.inference.encoder import load_encoder
        from colorrec.inference.search import load_candidate_index

        config_path = Path(str(assets["config_path"]))
        model_path = Path(str(assets["model_path"]))
        embeddings_path = Path(str(assets["embeddings_path"]))
        metadata_path = Path(str(assets["metadata_path"]))

        cfg = load_config(config_path)
        logger.info(
            "Loading colorrec encoder from %s (embeddings=%s)",
            model_path,
            embeddings_path,
        )
        encoder = load_encoder(cfg, model_path=str(model_path))
        embeddings, metadata = load_candidate_index(embeddings_path, metadata_path)

        _runtime = ColorRecRuntime(
            model_path=model_path,
            embeddings_path=embeddings_path,
            metadata_path=metadata_path,
            config_path=config_path,
            encoder=encoder,
            embeddings=embeddings,
            metadata=metadata,
            top_k_default=int(assets["top_k_default"]),
            normalize_embeddings=bool(assets["normalize_embeddings"]),
        )
        _load_error = None
        logger.info("colorrec runtime ready (%d candidates)", len(metadata))
        return _runtime


def retrieve_colors(query: str, *, top_k: int | None = None) -> list[dict[str, Any]]:
    """Encode query and return top-k color hits."""
    text = (query or "").strip()
    if not text:
        raise ValueError("query must be non-empty")

    runtime = _load_runtime()
    from colorrec.inference.search import cosine_search

    k = top_k or runtime.top_k_default
    return cosine_search(
        text,
        runtime.encoder,
        runtime.embeddings,
        runtime.metadata,
        k,
        normalize_embeddings=runtime.normalize_embeddings,
        include_explanation=True,
    )


def reset_runtime_for_tests() -> None:
    """Clear cached encoder/index (tests only)."""
    global _runtime, _load_error
    with _lock:
        _runtime = None
        _load_error = None
