"""Precompute candidate descriptor embeddings."""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

import numpy as np
import pandas as pd
from omegaconf import DictConfig

from colorrec.config import get_path, get_project_root, load_config, resolve_path
from colorrec.inference.embedding_manifest import (
    build_manifest,
    ensure_valid_embeddings,
    manifest_path_for_embeddings,
    write_manifest,
)
from colorrec.inference.encoder import TextEncoder, load_encoder
from colorrec.logging_utils import setup_logging

logger = logging.getLogger(__name__)

METADATA_COLUMNS = [
    "color_id",
    "name",
    "hex",
    "r",
    "g",
    "b",
    "h",
    "s",
    "l",
    "family",
    "family_hsl",
    "family_display",
    "raw_name",
    "display_name",
    "source",
    "descriptor",
]


def embed_candidate_bank(
    cfg: DictConfig,
    *,
    encoder: TextEncoder | None = None,
    model_path: str | None = None,
    embeddings_path: Path | None = None,
    metadata_path: Path | None = None,
    force: bool = False,
) -> tuple[np.ndarray, pd.DataFrame]:
    parquet_path = get_path(cfg, "candidate_bank_parquet")
    if not parquet_path.exists():
        raise FileNotFoundError(
            f"Candidate bank not found at {parquet_path}. Run build_candidate_bank first."
        )

    emb_path = embeddings_path or get_path(cfg, "candidate_embeddings")
    meta_path = metadata_path or get_path(cfg, "candidate_metadata")

    if not ensure_valid_embeddings(
        cfg,
        embeddings_path=emb_path,
        metadata_path=meta_path,
        model_path=model_path,
        force=force,
    ):
        metadata = pd.read_parquet(meta_path)
        embeddings = np.load(emb_path).astype(np.float32)
        logger.info("Reusing cached embeddings: %s shape=%s", emb_path, embeddings.shape)
        return embeddings, metadata

    df = pd.read_parquet(parquet_path)
    descriptors = df["descriptor"].astype(str).tolist()

    enc = encoder or load_encoder(cfg, model_path=model_path)
    batch_size = int(cfg.inference.get("encode_batch_size", 128))
    normalize = bool(cfg.inference.get("normalize_embeddings", True))

    logger.info("Encoding %d candidate descriptors (batch_size=%d)", len(descriptors), batch_size)
    embeddings = enc.encode(
        descriptors,
        batch_size=batch_size,
        normalize_embeddings=normalize,
        show_progress_bar=False,
    ).astype(np.float32)

    meta_cols = [c for c in METADATA_COLUMNS if c in df.columns]
    metadata = df[meta_cols].copy()
    # Flatten common metadata fields when stored nested in parquet metadata column.
    if "metadata" in df.columns:
        for key in ("raw_name", "display_name", "family_hsl", "family_display"):
            if key not in metadata.columns:
                metadata[key] = df["metadata"].apply(
                    lambda m: m.get(key) if isinstance(m, dict) else None
                )

    emb_path = embeddings_path or get_path(cfg, "candidate_embeddings")
    meta_path = metadata_path or get_path(cfg, "candidate_metadata")
    emb_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path.parent.mkdir(parents=True, exist_ok=True)

    np.save(emb_path, embeddings)
    metadata.to_parquet(meta_path, index=False)

    manifest = build_manifest(
        cfg=cfg,
        candidate_bank_path=parquet_path,
        embedding_path=emb_path,
        metadata_path=meta_path,
        embedding_shape=embeddings.shape,
        model_path=model_path,
    )
    write_manifest(manifest, manifest_path_for_embeddings(emb_path))

    logger.info("Wrote embeddings: %s shape=%s", emb_path, embeddings.shape)
    logger.info("Wrote metadata: %s rows=%d", meta_path, len(metadata))
    return embeddings, metadata


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Embed candidate color descriptors.")
    parser.add_argument("--config", type=str, default="configs/local_debug.yaml")
    parser.add_argument("--model_path", type=str, default=None, help="Override model name/path")
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Override candidate embeddings output .npy path",
    )
    parser.add_argument(
        "--metadata_output",
        type=str,
        default=None,
        help="Override candidate metadata output parquet path",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-embed even when cached embeddings exist",
    )
    return parser.parse_args()


def main() -> None:
    setup_logging()
    args = parse_args()
    cfg = load_config(resolve_path(args.config))
    logger.info("Project root: %s", get_project_root())
    embed_candidate_bank(
        cfg,
        model_path=args.model_path,
        embeddings_path=resolve_path(args.output) if args.output else None,
        metadata_path=resolve_path(args.metadata_output) if args.metadata_output else None,
        force=args.force,
    )


if __name__ == "__main__":
    main()
