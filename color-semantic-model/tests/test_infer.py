"""Tests for infer CLI helpers."""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest
from omegaconf import OmegaConf

from colorrec.inference.encoder import FakeEncoder
from colorrec.inference.infer import infer_query


def _setup(tmp_path):
    metadata = pd.DataFrame(
        [
            {
                "color_id": "c1",
                "name": "Warm Orange",
                "hex": "#FF8800",
                "r": 255,
                "g": 136,
                "b": 0,
                "h": 30.0,
                "s": 1.0,
                "l": 0.5,
                "family": "orange",
                "source": "xkcd",
                "descriptor": "warm nostalgic jazz orange",
            }
        ]
    )
    enc = FakeEncoder(dim=16)
    embeddings = enc.encode(metadata["descriptor"].tolist())
    emb_path = tmp_path / "candidate_embeddings.npy"
    meta_path = tmp_path / "candidate_metadata.parquet"
    np.save(emb_path, embeddings)
    metadata.to_parquet(meta_path, index=False)
    cfg = OmegaConf.create(
        {
            "model": {"name": "fake"},
            "inference": {"top_k_default": 3, "normalize_embeddings": True},
            "paths": {
                "candidate_embeddings": str(emb_path),
                "candidate_metadata": str(meta_path),
            },
        }
    )
    return cfg, enc


def test_infer_returns_json_top_k(tmp_path) -> None:
    cfg, enc = _setup(tmp_path)
    results = infer_query(cfg, "warm nostalgic jazz orange", encoder=enc, top_k=1)
    assert len(results) == 1
    assert results[0]["name"] == "Warm Orange"
    assert "explanation" in results[0]


def test_infer_missing_embeddings_error(tmp_path) -> None:
    cfg = OmegaConf.create(
        {
            "model": {"name": "fake"},
            "inference": {"top_k_default": 3, "normalize_embeddings": True},
            "paths": {
                "candidate_embeddings": str(tmp_path / "missing.npy"),
                "candidate_metadata": str(tmp_path / "missing.parquet"),
            },
        }
    )
    with pytest.raises(FileNotFoundError, match="embed_candidates"):
        infer_query(cfg, "test query", encoder=FakeEncoder())
