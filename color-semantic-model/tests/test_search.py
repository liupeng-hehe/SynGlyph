"""Tests for cosine search."""

from __future__ import annotations

import numpy as np
import pandas as pd

from colorrec.inference.encoder import FakeEncoder
from colorrec.inference.search import build_explanation, cosine_search, load_candidate_index, search


def _toy_index():
    metadata = pd.DataFrame(
        [
            {
                "color_id": "a",
                "name": "Alpha",
                "hex": "#FF0000",
                "r": 255,
                "g": 0,
                "b": 0,
                "h": 0.0,
                "s": 1.0,
                "l": 0.5,
                "family": "red",
                "source": "xkcd",
                "descriptor": "alpha red warm",
            },
            {
                "color_id": "b",
                "name": "Beta",
                "hex": "#0000FF",
                "r": 0,
                "g": 0,
                "b": 255,
                "h": 240.0,
                "s": 1.0,
                "l": 0.5,
                "family": "blue",
                "source": "xkcd",
                "descriptor": "beta blue cool",
            },
            {
                "color_id": "c",
                "name": "Gamma",
                "hex": "#00FF00",
                "r": 0,
                "g": 255,
                "b": 0,
                "h": 120.0,
                "s": 1.0,
                "l": 0.5,
                "family": "green",
                "source": "xkcd",
                "descriptor": "gamma green fresh",
            },
        ]
    )
    enc = FakeEncoder(dim=16)
    embeddings = enc.encode(metadata["descriptor"].tolist())
    return embeddings, metadata


def test_search_top_k_order() -> None:
    embeddings, metadata = _toy_index()
    enc = FakeEncoder(dim=16)
    query = enc.encode(["alpha red warm"])[0]
    results = search(query, embeddings, metadata, top_k=2)
    assert len(results) == 2
    assert results[0]["color_id"] == "a"
    assert results[0]["score"] >= results[1]["score"]


def test_top_k_exceeds_candidate_count() -> None:
    embeddings, metadata = _toy_index()
    enc = FakeEncoder(dim=16)
    query = enc.encode(["beta blue cool"])[0]
    results = search(query, embeddings, metadata, top_k=100)
    assert len(results) == 3


def test_cosine_search_metadata_fields() -> None:
    embeddings, metadata = _toy_index()
    enc = FakeEncoder(dim=16)
    results = cosine_search("gamma green fresh", enc, embeddings, metadata, top_k=1)
    hit = results[0]
    assert hit["name"] == "Gamma"
    assert hit["hex"] == "#00FF00"
    assert hit["family"] == "green"
    assert hit["rgb"] == [0, 255, 0]


def test_load_candidate_index(tmp_path) -> None:
    embeddings, metadata = _toy_index()
    emb_path = tmp_path / "emb.npy"
    meta_path = tmp_path / "meta.parquet"
    np.save(emb_path, embeddings)
    metadata.to_parquet(meta_path, index=False)
    loaded_emb, loaded_meta = load_candidate_index(emb_path, meta_path)
    assert loaded_emb.shape == embeddings.shape
    assert len(loaded_meta) == 3


def test_build_explanation() -> None:
    expl = build_explanation("warm nostalgic jazz", "burnt orange, warm, nostalgic", "orange")
    assert "warm" in expl
    assert "orange family" in expl
