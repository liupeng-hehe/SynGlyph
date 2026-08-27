"""Embedding cache manifest and validation for candidate bank embeddings."""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from omegaconf import DictConfig

from colorrec.config import get_path

logger = logging.getLogger(__name__)


class EmbeddingCacheMismatchError(RuntimeError):
    """Raised when cached embeddings do not match the current candidate bank or model."""


def manifest_path_for_embeddings(embeddings_path: Path) -> Path:
    return embeddings_path.with_name(f"{embeddings_path.stem}_manifest.json")


def fingerprint_candidate_bank(parquet_path: Path) -> dict[str, Any]:
    stat = parquet_path.stat()
    digest = hashlib.sha256()
    with parquet_path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    row_count = len(pd.read_parquet(parquet_path, columns=["color_id"]))
    return {
        "candidate_bank_path": str(parquet_path.resolve()),
        "candidate_bank_row_count": int(row_count),
        "candidate_bank_sha256": digest.hexdigest(),
        "candidate_bank_size_bytes": int(stat.st_size),
        "candidate_bank_mtime": stat.st_mtime,
    }


def resolve_model_path(cfg: DictConfig, model_path: str | None = None) -> str:
    if model_path:
        return str(Path(model_path).resolve())
    return str(cfg.model.get("name", ""))


def build_manifest(
    *,
    cfg: DictConfig,
    candidate_bank_path: Path,
    embedding_path: Path,
    metadata_path: Path,
    embedding_shape: tuple[int, ...],
    model_path: str | None = None,
) -> dict[str, Any]:
    bank_fp = fingerprint_candidate_bank(candidate_bank_path)
    return {
        **bank_fp,
        "model_path": resolve_model_path(cfg, model_path),
        "embedding_path": str(embedding_path.resolve()),
        "metadata_path": str(metadata_path.resolve()),
        "embedding_shape": list(embedding_shape),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def write_manifest(manifest: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    logger.info("Wrote embedding manifest: %s", path)


def load_manifest(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _shape_mismatch(current: tuple[int, ...], expected: list[Any] | tuple[Any, ...]) -> bool:
    try:
        return tuple(int(x) for x in current) != tuple(int(x) for x in expected)
    except (TypeError, ValueError):
        return True


def validate_embedding_cache(
    cfg: DictConfig,
    *,
    embeddings_path: Path,
    metadata_path: Path,
    model_path: str | None = None,
    manifest_path: Path | None = None,
) -> None:
    """Validate cached embeddings against candidate bank and model manifest."""
    if not embeddings_path.exists():
        raise EmbeddingCacheMismatchError(
            f"Missing embeddings at {embeddings_path}. "
            "Run: python -m colorrec.inference.embed_candidates --config <config>"
        )
    if not metadata_path.exists():
        raise EmbeddingCacheMismatchError(
            f"Missing candidate metadata at {metadata_path}. "
            "Run: python -m colorrec.inference.embed_candidates --config <config>"
        )

    embeddings = np.load(embeddings_path, mmap_mode="r")
    metadata = pd.read_parquet(metadata_path)
    if len(embeddings) != len(metadata):
        raise EmbeddingCacheMismatchError(
            f"Embedding row count ({len(embeddings)}) != metadata rows ({len(metadata)}). "
            f"Delete {embeddings_path} and re-run embed_candidates."
        )

    manifest_file = manifest_path or manifest_path_for_embeddings(embeddings_path)
    manifest = load_manifest(manifest_file)
    if manifest is None:
        raise EmbeddingCacheMismatchError(
            f"Missing embedding manifest at {manifest_file}. "
            f"Delete stale embeddings or run embed_candidates with --force."
        )

    bank_path = get_path(cfg, "candidate_bank_parquet")
    current_fp = fingerprint_candidate_bank(bank_path)
    resolved_model = resolve_model_path(cfg, model_path)

    mismatches: list[str] = []
    if manifest.get("candidate_bank_path") and Path(str(manifest["candidate_bank_path"])) != bank_path.resolve():
        mismatches.append("candidate bank path changed")
    if manifest.get("candidate_bank_row_count") != current_fp["candidate_bank_row_count"]:
        mismatches.append(
            f"candidate bank row count {current_fp['candidate_bank_row_count']} != "
            f"manifest {manifest.get('candidate_bank_row_count')}"
        )
    if manifest.get("candidate_bank_sha256") != current_fp["candidate_bank_sha256"]:
        mismatches.append("candidate bank content hash changed")
    if manifest.get("model_path") != resolved_model:
        mismatches.append(
            f"model_path {resolved_model!r} != manifest {manifest.get('model_path')!r}"
        )
    if _shape_mismatch(embeddings.shape, manifest.get("embedding_shape", [])):
        mismatches.append(
            f"embedding shape {embeddings.shape} != manifest {manifest.get('embedding_shape')}"
        )

    if mismatches:
        raise EmbeddingCacheMismatchError(
            "Stale embedding cache detected (" + "; ".join(mismatches) + "). "
            f"Delete {embeddings_path} or run embed_candidates with --force."
        )


def ensure_valid_embeddings(
    cfg: DictConfig,
    *,
    embeddings_path: Path,
    metadata_path: Path,
    model_path: str | None = None,
    force: bool = False,
) -> bool:
    """Return True if re-embedding is required."""
    if force:
        return True
    if not embeddings_path.exists() or not metadata_path.exists():
        return True
    try:
        validate_embedding_cache(
            cfg,
            embeddings_path=embeddings_path,
            metadata_path=metadata_path,
            model_path=model_path,
        )
    except EmbeddingCacheMismatchError:
        auto = bool(cfg.inference.get("auto_reembed_on_mismatch", False))
        if auto:
            logger.warning("Embedding cache mismatch; auto_reembed_on_mismatch=true")
            return True
        raise
    return False
