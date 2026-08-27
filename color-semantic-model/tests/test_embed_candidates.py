"""Tests for candidate embedding."""

from __future__ import annotations

import numpy as np
import pandas as pd
from omegaconf import OmegaConf

from colorrec.inference.embed_candidates import embed_candidate_bank
from colorrec.inference.encoder import FakeEncoder


def test_embed_candidates_writes_npy_and_parquet(tmp_path) -> None:
    bank = tmp_path / "candidate_colors.parquet"
    pd.DataFrame(
        [
            {
                "color_id": "xkcd:red",
                "source": "xkcd",
                "name": "Red",
                "hex": "#FF0000",
                "r": 255,
                "g": 0,
                "b": 0,
                "h": 0.0,
                "s": 1.0,
                "l": 0.5,
                "family": "red",
                "descriptor": "red warm vivid",
                "metadata": {"_empty": True},
            }
        ]
    ).to_parquet(bank, index=False)

    emb_out = tmp_path / "candidate_embeddings.npy"
    meta_out = tmp_path / "candidate_metadata.parquet"
    cfg = OmegaConf.create(
        {
            "model": {"name": "fake", "max_seq_length": 128},
            "inference": {"encode_batch_size": 8, "normalize_embeddings": True},
            "paths": {
                "candidate_bank_parquet": str(bank),
                "candidate_embeddings": str(emb_out),
                "candidate_metadata": str(meta_out),
            },
        }
    )

    embeddings, metadata = embed_candidate_bank(cfg, encoder=FakeEncoder(dim=16))
    assert emb_out.exists()
    assert meta_out.exists()
    assert embeddings.shape[0] == 1
    assert embeddings.shape[1] == 16
    norm = np.linalg.norm(embeddings[0])
    assert abs(norm - 1.0) < 1e-5
    assert "color_id" in metadata.columns

    manifest_path = emb_out.with_name("candidate_embeddings_manifest.json")
    assert manifest_path.exists()


def test_embed_reuses_valid_cache(tmp_path) -> None:
    bank = tmp_path / "candidate_colors.parquet"
    pd.DataFrame(
        [
            {
                "color_id": "xkcd:red",
                "source": "xkcd",
                "name": "Red",
                "hex": "#FF0000",
                "r": 255,
                "g": 0,
                "b": 0,
                "h": 0.0,
                "s": 1.0,
                "l": 0.5,
                "family": "red",
                "descriptor": "red warm vivid",
                "metadata": {"_empty": True},
            }
        ]
    ).to_parquet(bank, index=False)

    emb_out = tmp_path / "candidate_embeddings.npy"
    meta_out = tmp_path / "candidate_metadata.parquet"
    cfg = OmegaConf.create(
        {
            "model": {"name": "fake"},
            "inference": {"encode_batch_size": 8, "normalize_embeddings": True, "auto_reembed_on_mismatch": False},
            "paths": {
                "candidate_bank_parquet": str(bank),
                "candidate_embeddings": str(emb_out),
                "candidate_metadata": str(meta_out),
            },
        }
    )

    enc = FakeEncoder(dim=16)
    embed_candidate_bank(cfg, encoder=enc, force=True)
    first_mtime = emb_out.stat().st_mtime
    embed_candidate_bank(cfg, encoder=FakeEncoder(dim=16), force=False)
    assert emb_out.stat().st_mtime == first_mtime
