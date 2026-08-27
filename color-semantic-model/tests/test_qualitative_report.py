"""Tests for qualitative report generation."""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
from omegaconf import OmegaConf

from colorrec.evaluation.qualitative_report import (
    render_markdown,
    run_qualitative_report,
    write_qualitative_outputs,
)
from colorrec.inference.encoder import FakeEncoder


def test_qualitative_report_outputs(tmp_path) -> None:
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
    emb_path = tmp_path / "emb.npy"
    meta_path = tmp_path / "meta.parquet"
    np.save(emb_path, embeddings)
    metadata.to_parquet(meta_path, index=False)

    cfg = OmegaConf.create(
        {
            "model": {"name": "fake"},
            "inference": {"top_k_default": 3, "normalize_embeddings": True},
            "evaluation": {"fixed_prompts": ["warm nostalgic jazz poster"]},
            "paths": {
                "candidate_embeddings": str(emb_path),
                "candidate_metadata": str(meta_path),
                "baseline_qualitative_json": str(tmp_path / "qual.json"),
                "baseline_qualitative_md": str(tmp_path / "qual.md"),
            },
        }
    )

    report = run_qualitative_report(cfg, encoder=enc)
    write_qualitative_outputs(cfg, report)

    md = (tmp_path / "qual.md").read_text(encoding="utf-8")
    assert "warm nostalgic jazz poster" in md
    assert "| rank |" in md
    assert "Warm Orange" in md
    assert "#FF8800" in md

    payload = json.loads((tmp_path / "qual.json").read_text(encoding="utf-8"))
    hits = payload["prompts"]["warm nostalgic jazz poster"]
    assert hits[0]["rank"] == 1
    assert "score" in hits[0]
    assert "family" in hits[0]
    assert hits[0].get("family_display") in {None, "orange"} or hits[0]["family"] == "orange"
