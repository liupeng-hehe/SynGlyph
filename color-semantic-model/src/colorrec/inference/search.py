"""Cosine retrieval search over precomputed candidate embeddings."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from colorrec.inference.encoder import TextEncoder


def load_candidate_index(
    embeddings_path: str | Path,
    metadata_path: str | Path,
) -> tuple[np.ndarray, pd.DataFrame]:
    embeddings = np.load(embeddings_path)
    metadata = pd.read_parquet(metadata_path)
    if len(metadata) != len(embeddings):
        raise ValueError(
            f"Embedding count ({len(embeddings)}) != metadata rows ({len(metadata)})"
        )
    return embeddings.astype(np.float32), metadata


def _row_to_result(row: pd.Series, rank: int, score: float) -> dict[str, Any]:
    family_display = row.get("family_display")
    if pd.isna(family_display):
        family_display = None
    family_hsl = row.get("family_hsl")
    if pd.isna(family_hsl):
        family_hsl = None
    return {
        "rank": rank,
        "score": float(score),
        "color_id": row.get("color_id"),
        "name": row.get("name"),
        "display_name": row.get("display_name") if not pd.isna(row.get("display_name")) else row.get("name"),
        "hex": row.get("hex"),
        "rgb": [int(row.get("r", 0)), int(row.get("g", 0)), int(row.get("b", 0))],
        "hsl": [float(row.get("h", 0)), float(row.get("s", 0)), float(row.get("l", 0))],
        "family": row.get("family"),
        "family_display": family_display or row.get("family"),
        "family_hsl": family_hsl,
        "source": row.get("source"),
        "descriptor": row.get("descriptor"),
    }


def search(
    query_embedding: np.ndarray,
    candidate_embeddings: np.ndarray,
    metadata_df: pd.DataFrame,
    top_k: int,
) -> list[dict[str, Any]]:
    """Search normalized embeddings with dot product (= cosine)."""
    if query_embedding.ndim != 1:
        query_embedding = query_embedding.reshape(-1)

    n = len(candidate_embeddings)
    k = min(max(int(top_k), 1), n)
    scores = candidate_embeddings @ query_embedding.astype(np.float32)
    top_idx = np.argsort(-scores)[:k]

    results: list[dict[str, Any]] = []
    for rank, idx in enumerate(top_idx, start=1):
        row = metadata_df.iloc[int(idx)]
        results.append(_row_to_result(row, rank, float(scores[int(idx)])))
    return results


def build_explanation(query: str, descriptor: str, family: str) -> str:
    q_tokens = set(re.findall(r"[a-z0-9]+", query.lower()))
    d_tokens = set(re.findall(r"[a-z0-9]+", str(descriptor).lower()))
    matched = sorted(q_tokens & d_tokens)
    parts: list[str] = []
    if matched:
        parts.append("matched: " + ", ".join(matched[:8]))
    parts.append(f"selected {family} family")
    return "; ".join(parts)


def cosine_search(
    query_text: str,
    model_or_encoder: TextEncoder,
    candidate_embeddings: np.ndarray,
    metadata_df: pd.DataFrame,
    top_k: int,
    *,
    normalize_embeddings: bool = True,
    include_explanation: bool = False,
) -> list[dict[str, Any]]:
    query_emb = model_or_encoder.encode(
        [query_text],
        normalize_embeddings=normalize_embeddings,
        show_progress_bar=False,
    )[0]
    results = search(query_emb, candidate_embeddings, metadata_df, top_k)
    if include_explanation:
        for item in results:
            item["explanation"] = build_explanation(
                query_text,
                str(item.get("descriptor", "")),
                str(item.get("family", "")),
            )
    return results
