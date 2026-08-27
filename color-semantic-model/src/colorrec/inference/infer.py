"""CLI inference for text-to-color retrieval."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from omegaconf import DictConfig

from colorrec.config import get_path, load_config, resolve_path
from colorrec.inference.encoder import load_encoder
from colorrec.inference.search import cosine_search, load_candidate_index
from colorrec.logging_utils import setup_logging

logger = logging.getLogger(__name__)


def infer_query(
    cfg: DictConfig,
    query: str,
    *,
    top_k: int | None = None,
    model_path: str | None = None,
    encoder=None,
) -> list[dict]:
    emb_path = get_path(cfg, "candidate_embeddings")
    meta_path = get_path(cfg, "candidate_metadata")
    if not emb_path.exists() or not meta_path.exists():
        raise FileNotFoundError(
            f"Candidate embeddings not found at {emb_path}. "
            "Run: python -m colorrec.inference.embed_candidates --config <config>"
        )

    embeddings, metadata = load_candidate_index(emb_path, meta_path)
    enc = encoder or load_encoder(cfg, model_path=model_path)
    k = top_k or int(cfg.inference.get("top_k_default", 8))
    normalize = bool(cfg.inference.get("normalize_embeddings", True))

    return cosine_search(
        query,
        enc,
        embeddings,
        metadata,
        k,
        normalize_embeddings=normalize,
        include_explanation=True,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Retrieve top-k colors for a text query.")
    parser.add_argument("--config", type=str, default="configs/local_debug.yaml")
    parser.add_argument("--query", type=str, required=True)
    parser.add_argument("--top_k", type=int, default=None)
    parser.add_argument("--model_path", type=str, default=None)
    parser.add_argument("--output", type=str, default=None, help="Optional JSON output path")
    return parser.parse_args()


def main() -> None:
    setup_logging()
    args = parse_args()
    cfg = load_config(resolve_path(args.config))
    results = infer_query(
        cfg,
        args.query,
        top_k=args.top_k,
        model_path=args.model_path,
    )
    payload = json.dumps(results, indent=2, ensure_ascii=False)
    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(payload + "\n", encoding="utf-8")
        logger.info("Wrote results to %s", out)
    print(payload)


if __name__ == "__main__":
    main()
