"""Tests for training pair builder."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest
from omegaconf import OmegaConf

from colorrec.data.build_training_pairs import (
    build_all_pairs,
    build_candidate_self_pairs,
    build_color_pedia_metadata_pairs,
    build_training_pairs,
    dedupe_pairs,
    load_candidate_bank,
    make_pair_id,
    make_training_positive_descriptor,
    truncate_descriptor,
)
from colorrec.schemas import CandidateColor, TrainingPair


def _make_color(
    name: str,
    hex_val: str,
    *,
    source: str = "xkcd",
    family: str = "blue",
    metadata: dict | None = None,
) -> CandidateColor:
    from colorrec.colorspace import hex_to_rgb, rgb_to_hsl

    r, g, b = hex_to_rgb(hex_val)
    h, s, l = rgb_to_hsl(r, g, b)
    return CandidateColor(
        color_id=f"{source}:{name}",
        source=source,
        name=name,
        hex=hex_val,
        r=r,
        g=g,
        b=b,
        h=h,
        s=s,
        l=l,
        family=family,
        descriptor=f"{name}, {family} family, calm, clean",
        metadata=metadata or {},
    )


def test_truncate_descriptor_by_comma_phrases() -> None:
    desc = "alpha, beta, gamma, delta"
    truncated = truncate_descriptor(desc, 12)
    assert truncated == "alpha, beta"
    assert "," in truncated


def test_make_training_positive_descriptor_includes_core_fields() -> None:
    color = _make_color("ocean blue", "#0044AA", family="blue")
    positive = make_training_positive_descriptor(color, max_chars=220, max_metadata_terms=8)
    lower = positive.lower()
    assert "ocean blue" in lower
    assert "blue family" in lower
    assert len(positive) <= 220


def test_suspicious_tokens_cleaned() -> None:
    color = _make_color(
        "bad meta",
        "#0044AA",
        family="blue",
        metadata={"keywords": ["html", "trustworthy"]},
    )
    positive = make_training_positive_descriptor(
        color,
        suspicious_tokens=["html"],
    )
    assert "html" not in positive.lower()
    assert "trustworthy" in positive.lower()


def test_build_candidate_self_pairs_one_per_color() -> None:
    colors = [
        _make_color("cloud blue", "#ACC2D9", source="xkcd", family="blue"),
        _make_color("warm orange", "#FF8800", source="color_pedia", family="orange"),
    ]
    cfg = OmegaConf.create(
        {
            "data": {
                "training_pairs": {
                    "weights": {"xkcd_self": 0.6, "color_pedia_self": 0.7},
                    "max_positive_chars": 220,
                    "max_metadata_terms": 8,
                    "suspicious_tokens_to_clean": [],
                }
            }
        }
    )
    pairs = build_candidate_self_pairs(colors, cfg)
    assert len(pairs) == 2
    sources = {p.source for p in pairs}
    assert sources == {"xkcd_self", "color_pedia_self"}


def test_color_pedia_metadata_pairs_filter_generic() -> None:
    color = _make_color(
        "luxury gold",
        "#D4AF37",
        source="color_pedia",
        family="yellow",
        metadata={
            "mood": "modern, beautiful",
            "keywords": "calm professional, luxury elegant",
        },
    )
    cfg = OmegaConf.create(
        {
            "data": {
                "training_pairs": {
                    "weights": {"color_pedia_metadata": 1.0},
                    "max_metadata_pairs_per_color": 6,
                    "max_positive_chars": 220,
                    "max_metadata_terms": 8,
                    "min_anchor_chars": 2,
                    "max_anchor_chars": 128,
                    "metadata_anchor_fields": ["mood", "keywords"],
                    "generic_anchor_terms": ["modern", "beautiful", "design"],
                    "suspicious_tokens_to_clean": [],
                }
            }
        }
    )
    pairs = build_color_pedia_metadata_pairs([color], cfg)
    anchors = {p.anchor for p in pairs}
    assert "modern" not in anchors
    assert "beautiful" not in anchors
    assert "calm professional" in anchors or "luxury elegant" in anchors


def test_max_metadata_pairs_per_color(tmp_path: Path) -> None:
    color = _make_color(
        "rich purple",
        "#800080",
        source="color_pedia",
        family="purple",
        metadata={"keywords": "alpha beta, gamma delta, epsilon zeta, eta theta, iota kappa"},
    )
    cfg = OmegaConf.create(
        {
            "data": {
                "training_pairs": {
                    "weights": {"color_pedia_metadata": 1.0},
                    "max_metadata_pairs_per_color": 2,
                    "max_positive_chars": 220,
                    "max_metadata_terms": 8,
                    "min_anchor_chars": 2,
                    "max_anchor_chars": 128,
                    "metadata_anchor_fields": ["keywords"],
                    "generic_anchor_terms": [],
                    "suspicious_tokens_to_clean": [],
                }
            }
        }
    )
    pairs = build_color_pedia_metadata_pairs([color], cfg)
    assert len(pairs) <= 2


def test_pair_id_stable() -> None:
    pid1 = make_pair_id("xkcd_self", "Cloud Blue", "xkcd:cloud blue", "cloud blue, blue family")
    pid2 = make_pair_id("xkcd_self", "  cloud   blue ", "xkcd:cloud blue", "cloud blue, blue family")
    assert pid1 == pid2


def test_dedupe_pairs_keeps_higher_weight() -> None:
    low = TrainingPair(
        pair_id="same:id",
        anchor="anchor",
        positive="positive",
        source="user_curated",
        weight=1.0,
    )
    high = TrainingPair(
        pair_id="same:id",
        anchor="anchor",
        positive="positive",
        source="user_curated",
        weight=2.5,
    )
    deduped, removed = dedupe_pairs([low, high])
    assert removed == 1
    assert len(deduped) == 1
    assert deduped[0].weight == 2.5


def test_build_training_pairs_end_to_end(tmp_path: Path) -> None:
    bank_dir = tmp_path / "artifacts" / "candidate_bank"
    bank_dir.mkdir(parents=True)
    colors = [
        _make_color("cloud blue", "#ACC2D9", source="xkcd", family="blue"),
        _make_color(
            "romantic rose",
            "#FF007F",
            source="color_pedia",
            family="pink",
            metadata={"mood": "romantic gentle, modern design", "keywords": "soft premium"},
        ),
    ]
    records = [c.to_json_dict() for c in colors]
    parquet_path = bank_dir / "candidate_colors.parquet"
    pd.DataFrame(records).to_parquet(parquet_path, index=False)

    user_csv = tmp_path / "user_pairs.csv"
    user_csv.write_text(
        "anchor_text,positive_color_name,positive_hex,positive_descriptor,color_family,weight\n"
        "quiet luxury,warm ivory,#F6EFE2,soft ivory,white,2.5\n",
        encoding="utf-8",
    )

    out_dir = tmp_path / "artifacts" / "train_pairs"
    cfg = OmegaConf.create(
        {
            "project": {"seed": 42},
            "paths": {
                "candidate_bank_parquet": str(parquet_path),
                "raw_user_curated": str(user_csv),
                "train_pairs": str(out_dir / "train_pairs.jsonl"),
                "val_pairs": str(out_dir / "val_pairs.jsonl"),
                "test_pairs": str(out_dir / "test_pairs.jsonl"),
                "train_pair_stats": str(out_dir / "stats.md"),
            },
            "data": {
                "training_pairs": {
                    "enabled_sources": {
                        "candidate_self": True,
                        "color_pedia_metadata": True,
                        "user_curated": True,
                        "nrc_word_colour": False,
                    },
                    "split": {"seed": 42, "train": 0.8, "val": 0.1, "test": 0.1, "leakage_check": True},
                    "weights": {
                        "xkcd_self": 0.6,
                        "color_pedia_self": 0.7,
                        "color_pedia_metadata": 1.0,
                        "user_curated": 2.5,
                    },
                    "max_metadata_pairs_per_color": 4,
                    "max_positive_chars": 220,
                    "max_metadata_terms": 8,
                    "min_anchor_chars": 2,
                    "max_anchor_chars": 128,
                    "metadata_anchor_fields": ["mood", "keywords"],
                    "generic_anchor_terms": ["modern", "design"],
                    "suspicious_tokens_to_clean": ["html"],
                }
            },
        }
    )

    pairs, report, split_report = build_training_pairs(cfg)
    assert len(pairs) >= 3
    assert (out_dir / "train_pairs.jsonl").exists()
    assert (out_dir / "stats.md").exists()

    with (out_dir / "train_pairs.jsonl").open(encoding="utf-8") as fh:
        line = fh.readline()
        parsed = json.loads(line)
        assert "anchor" in parsed
        assert parsed.get("split") == "train"

    stats = (out_dir / "stats.md").read_text(encoding="utf-8")
    assert "Total pairs" in stats
    assert "Leakage check" in stats
    assert "user_curated" in stats
    assert split_report.leakage.passed


def test_full_train_v2_paths_do_not_overlap_v1() -> None:
    from colorrec.config import load_config, resolve_path

    v1 = load_config(resolve_path("configs/full_train_local.yaml"))
    v2 = load_config(resolve_path("configs/full_train_v2.yaml"))

    v1_paths = {
        str(v1.train.final_model_dir),
        str(v1.paths.fine_tuned_candidate_embeddings),
        str(v1.paths.fine_tuned_retrieval_json),
        str(v1.paths.compare_report_md),
    }
    v2_paths = {
        str(v2.train.final_model_dir),
        str(v2.paths.fine_tuned_candidate_embeddings),
        str(v2.paths.fine_tuned_retrieval_json),
        str(v2.paths.compare_report_md),
    }
    assert v1_paths.isdisjoint(v2_paths)
    assert "v2" in str(v2.train.final_model_dir)
    assert float(v2.data.training_pairs.weights.user_curated) == 3.5


def test_load_candidate_bank_from_parquet(tmp_path: Path) -> None:
    color = _make_color("test blue", "#0044AA", metadata={"keywords": "calm"})
    path = tmp_path / "bank.parquet"
    pd.DataFrame([color.to_json_dict()]).to_parquet(path, index=False)
    loaded = load_candidate_bank(path)
    assert len(loaded) == 1
    assert loaded[0].name == "test blue"
