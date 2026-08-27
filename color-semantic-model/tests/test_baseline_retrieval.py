"""Tests for baseline retrieval embedding cache guard."""

from __future__ import annotations

import json

import pandas as pd
import pytest
from omegaconf import OmegaConf

from colorrec.evaluation.baseline_retrieval import run_baseline_retrieval
from colorrec.inference.embed_candidates import embed_candidate_bank
from colorrec.inference.embedding_manifest import EmbeddingCacheMismatchError
from colorrec.inference.encoder import FakeEncoder


def _setup_bank(tmp_path, rows=1):
    bank = tmp_path / "bank.parquet"
    pd.DataFrame(
        [
            {
                "color_id": "c1",
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
                "descriptor": "red warm",
                "metadata": {"_empty": True},
            }
        ]
    ).to_parquet(bank, index=False)
    return bank


def test_skip_embed_validates_manifest(tmp_path, monkeypatch) -> None:
    bank = _setup_bank(tmp_path)
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
                "val_pairs": str(tmp_path / "val.jsonl"),
                "test_pairs": str(tmp_path / "test.jsonl"),
                "baseline_retrieval_json": str(tmp_path / "baseline.json"),
                "baseline_retrieval_md": str(tmp_path / "baseline.md"),
                "baseline_qualitative_json": str(tmp_path / "qual.json"),
                "baseline_qualitative_md": str(tmp_path / "qual.md"),
            },
            "evaluation": {"fixed_prompts": [], "ks": [1, 3, 5, 10]},
        }
    )
    embed_candidate_bank(cfg, encoder=FakeEncoder(dim=8), force=True)

    monkeypatch.setattr(
        "colorrec.evaluation.baseline_retrieval.evaluate_split",
        lambda cfg, split, **kwargs: {"split": split, "metrics": {"exact": {"recall@1": 1.0}}, "skipped_queries": 0},
    )
    monkeypatch.setattr(
        "colorrec.evaluation.baseline_retrieval.run_qualitative_report",
        lambda *args, **kwargs: {"prompts": {}},
    )
    monkeypatch.setattr(
        "colorrec.evaluation.baseline_retrieval.write_qualitative_outputs",
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        "colorrec.evaluation.baseline_retrieval.metadata_holdout_available",
        lambda cfg: False,
    )
    monkeypatch.setattr(
        "colorrec.evaluation.baseline_retrieval.render_eval_md",
        lambda report: f"# {report.get('split', 'split')}",
    )

    run_baseline_retrieval(cfg, skip_embed=True, encoder=FakeEncoder(dim=8))

    pd.DataFrame(
        [
            {
                "color_id": "c2",
                "source": "xkcd",
                "name": "Blue",
                "hex": "#0000FF",
                "r": 0,
                "g": 0,
                "b": 255,
                "h": 240.0,
                "s": 1.0,
                "l": 0.5,
                "family": "blue",
                "descriptor": "blue cool",
                "metadata": {"_empty": True},
            }
        ]
    ).to_parquet(bank, index=False)

    with pytest.raises(EmbeddingCacheMismatchError):
        run_baseline_retrieval(cfg, skip_embed=True, encoder=FakeEncoder(dim=8))
