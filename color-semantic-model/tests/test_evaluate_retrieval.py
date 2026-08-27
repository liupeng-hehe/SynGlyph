"""Tests for retrieval evaluation metrics."""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest
from omegaconf import OmegaConf

from colorrec.evaluation.evaluate_retrieval import (
    build_relevant_set,
    evaluate_split,
    get_split_metrics,
    mrr_at_k,
    ndcg_at_k,
    recall_at_k,
    render_markdown,
    write_reports,
)
from colorrec.inference.encoder import FakeEncoder
from colorrec.schemas import TrainingPair


def test_metric_functions() -> None:
    relevant = {"c1"}
    retrieved = ["c2", "c1", "c3"]
    assert recall_at_k(relevant, retrieved, 1) == 0.0
    assert recall_at_k(relevant, retrieved, 3) == 1.0
    assert mrr_at_k(relevant, retrieved, 10) == 0.5
    assert ndcg_at_k(relevant, retrieved, 10) > 0.0


def test_build_relevant_set_rules() -> None:
    metadata = pd.DataFrame(
        [
            {"color_id": "a", "hex": "#FF0000", "family": "red", "descriptor": "exact text"},
            {"color_id": "b", "hex": "#FF0000", "family": "red", "descriptor": "other"},
        ]
    )
    p1 = TrainingPair(
        pair_id="x:1",
        anchor="q",
        positive="p",
        positive_color_id="a",
        source="xkcd_self",
        weight=1.0,
    )
    ids, rule = build_relevant_set(p1, metadata)
    assert ids == {"a"} and rule == "positive_color_id"

    p2 = TrainingPair(
        pair_id="x:2",
        anchor="q",
        positive="p",
        positive_hex="#FF0000",
        source="user_curated",
        weight=1.0,
    )
    ids, rule = build_relevant_set(p2, metadata)
    assert ids == {"a", "b"} and rule == "positive_hex"

    p3 = TrainingPair(
        pair_id="x:3",
        anchor="q",
        positive="exact text",
        source="color_pedia_metadata",
        weight=1.0,
    )
    ids, rule = build_relevant_set(p3, metadata)
    assert ids == {"a"} and rule == "exact_descriptor"

    p4 = TrainingPair(pair_id="x:4", anchor="q", positive="missing", source="color_pedia_metadata", weight=1.0)
    ids, rule = build_relevant_set(p4, metadata)
    assert ids == set() and rule == "skipped"


def test_evaluate_split_with_fake_encoder(tmp_path) -> None:
    metadata = pd.DataFrame(
        [
            {
                "color_id": "c1",
                "name": "Red",
                "hex": "#FF0000",
                "r": 255,
                "g": 0,
                "b": 0,
                "h": 0.0,
                "s": 1.0,
                "l": 0.5,
                "family": "red",
                "source": "xkcd",
                "descriptor": "anchor one red",
            },
            {
                "color_id": "c2",
                "name": "Blue",
                "hex": "#0000FF",
                "r": 0,
                "g": 0,
                "b": 255,
                "h": 240.0,
                "s": 1.0,
                "l": 0.5,
                "family": "blue",
                "source": "xkcd",
                "descriptor": "anchor two blue",
            },
        ]
    )
    enc = FakeEncoder(dim=16)
    embeddings = enc.encode(metadata["descriptor"].tolist())

    emb_path = tmp_path / "emb.npy"
    meta_path = tmp_path / "meta.parquet"
    val_path = tmp_path / "val.jsonl"
    np.save(emb_path, embeddings)
    metadata.to_parquet(meta_path, index=False)

    pairs = [
        TrainingPair(
            pair_id="p1",
            anchor="anchor one red",
            positive="anchor one red",
            positive_color_id="c1",
            source="xkcd_self",
            weight=1.0,
            split="val",
        ),
        TrainingPair(
            pair_id="p2",
            anchor="anchor two blue",
            positive="anchor two blue",
            positive_color_id="c2",
            source="xkcd_self",
            weight=1.0,
            split="val",
        ),
        TrainingPair(
            pair_id="p3",
            anchor="missing",
            positive="nope",
            source="color_pedia_metadata",
            weight=1.0,
            split="val",
        ),
    ]
    with val_path.open("w", encoding="utf-8") as fh:
        for p in pairs:
            fh.write(p.model_dump_json() + "\n")

    cfg = OmegaConf.create(
        {
            "project": {"seed": 42},
            "model": {"name": "fake"},
            "inference": {"normalize_embeddings": True},
            "evaluation": {"ks": [1, 3, 5, 10]},
            "paths": {
                "candidate_embeddings": str(emb_path),
                "candidate_metadata": str(meta_path),
                "val_pairs": str(val_path),
                "baseline_retrieval_json": str(tmp_path / "report.json"),
                "baseline_retrieval_md": str(tmp_path / "report.md"),
            },
        }
    )

    report = evaluate_split(cfg, "val", encoder=enc)
    assert report["total_queries"] == 3
    assert report["evaluated_queries"] == 2
    assert report["skipped_queries"] == 1
    exact = get_split_metrics(report, "exact")
    assert exact["recall@1"] == 1.0
    assert exact["mrr@10"] == 1.0
    assert "anchor_group" in report["metrics"]
    assert "family_soft" in report["metrics"]

    write_reports(cfg, report)
    assert (tmp_path / "report.json").exists()
    assert "Skipped queries" in (tmp_path / "report.md").read_text(encoding="utf-8")
