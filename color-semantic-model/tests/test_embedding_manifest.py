"""Tests for embedding cache manifest."""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest
from omegaconf import OmegaConf

from colorrec.inference.embed_candidates import embed_candidate_bank
from colorrec.inference.embedding_manifest import (
    EmbeddingCacheMismatchError,
    fingerprint_candidate_bank,
    manifest_path_for_embeddings,
    validate_embedding_cache,
)
from colorrec.inference.encoder import FakeEncoder


def _write_bank(path, rows=2):
    pd.DataFrame(
        [
            {
                "color_id": f"c{i}",
                "source": "xkcd",
                "name": f"Color{i}",
                "hex": f"#AABB0{i}",
                "r": 170,
                "g": 187,
                "b": i,
                "h": 200.0,
                "s": 0.5,
                "l": 0.5,
                "family": "blue",
                "descriptor": f"color {i}",
                "metadata": {"raw_name": f"Color{i}", "display_name": f"Color{i}", "family_hsl": "blue", "family_display": "blue"},
            }
            for i in range(rows)
        ]
    ).to_parquet(path, index=False)


def test_manifest_written_on_embed(tmp_path) -> None:
    bank = tmp_path / "bank.parquet"
    _write_bank(bank, rows=1)
    emb_out = tmp_path / "candidate_embeddings.npy"
    meta_out = tmp_path / "candidate_metadata.parquet"
    cfg = OmegaConf.create(
        {
            "model": {"name": "fake-model"},
            "inference": {"encode_batch_size": 8, "normalize_embeddings": True, "auto_reembed_on_mismatch": False},
            "paths": {
                "candidate_bank_parquet": str(bank),
                "candidate_embeddings": str(emb_out),
                "candidate_metadata": str(meta_out),
            },
        }
    )

    embed_candidate_bank(cfg, encoder=FakeEncoder(dim=8), force=True)
    manifest_path = manifest_path_for_embeddings(emb_out)
    assert manifest_path.exists()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["candidate_bank_row_count"] == 1
    assert manifest["model_path"] == "fake-model"
    assert manifest["embedding_shape"] == [1, 8]


def test_rejects_stale_embeddings_when_bank_row_count_changes(tmp_path) -> None:
    bank = tmp_path / "bank.parquet"
    _write_bank(bank, rows=1)
    emb_out = tmp_path / "candidate_embeddings.npy"
    meta_out = tmp_path / "candidate_metadata.parquet"
    cfg = OmegaConf.create(
        {
            "model": {"name": "fake-model"},
            "inference": {"encode_batch_size": 8, "normalize_embeddings": True, "auto_reembed_on_mismatch": False},
            "paths": {
                "candidate_bank_parquet": str(bank),
                "candidate_embeddings": str(emb_out),
                "candidate_metadata": str(meta_out),
            },
        }
    )

    embed_candidate_bank(cfg, encoder=FakeEncoder(dim=8), force=True)
    _write_bank(bank, rows=3)

    with pytest.raises(EmbeddingCacheMismatchError, match="row count"):
        validate_embedding_cache(cfg, embeddings_path=emb_out, metadata_path=meta_out)


def test_rejects_stale_embeddings_when_model_changes(tmp_path) -> None:
    bank = tmp_path / "bank.parquet"
    _write_bank(bank, rows=1)
    emb_out = tmp_path / "candidate_embeddings.npy"
    meta_out = tmp_path / "candidate_metadata.parquet"
    cfg = OmegaConf.create(
        {
            "model": {"name": "fake-model-a"},
            "inference": {"encode_batch_size": 8, "normalize_embeddings": True, "auto_reembed_on_mismatch": False},
            "paths": {
                "candidate_bank_parquet": str(bank),
                "candidate_embeddings": str(emb_out),
                "candidate_metadata": str(meta_out),
            },
        }
    )

    embed_candidate_bank(cfg, encoder=FakeEncoder(dim=8), force=True)
    cfg.model.name = "fake-model-b"

    with pytest.raises(EmbeddingCacheMismatchError, match="model_path"):
        validate_embedding_cache(cfg, embeddings_path=emb_out, metadata_path=meta_out)


def test_force_reembed_updates_manifest(tmp_path) -> None:
    bank = tmp_path / "bank.parquet"
    _write_bank(bank, rows=1)
    emb_out = tmp_path / "candidate_embeddings.npy"
    meta_out = tmp_path / "candidate_metadata.parquet"
    cfg = OmegaConf.create(
        {
            "model": {"name": "fake-model"},
            "inference": {"encode_batch_size": 8, "normalize_embeddings": True, "auto_reembed_on_mismatch": False},
            "paths": {
                "candidate_bank_parquet": str(bank),
                "candidate_embeddings": str(emb_out),
                "candidate_metadata": str(meta_out),
            },
        }
    )

    embed_candidate_bank(cfg, encoder=FakeEncoder(dim=8), force=True)
    _write_bank(bank, rows=2)
    embed_candidate_bank(cfg, encoder=FakeEncoder(dim=8), force=True)

    manifest = json.loads(manifest_path_for_embeddings(emb_out).read_text(encoding="utf-8"))
    assert manifest["candidate_bank_row_count"] == 2
    embeddings = np.load(emb_out)
    assert embeddings.shape[0] == 2


def test_fingerprint_candidate_bank(tmp_path) -> None:
    bank = tmp_path / "bank.parquet"
    _write_bank(bank, rows=2)
    fp = fingerprint_candidate_bank(bank)
    assert fp["candidate_bank_row_count"] == 2
    assert len(fp["candidate_bank_sha256"]) == 64
