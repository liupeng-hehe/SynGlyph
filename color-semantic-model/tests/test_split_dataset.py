"""Tests for grouped train/val/test splitting."""

from __future__ import annotations

from omegaconf import OmegaConf

from colorrec.data.split_dataset import assign_splits, check_leakage, split_group_key
from colorrec.schemas import TrainingPair


def _pair(
    *,
    pair_id: str,
    anchor: str,
    source: str,
    color_id: str | None = None,
) -> TrainingPair:
    return TrainingPair(
        pair_id=pair_id,
        anchor=anchor,
        positive="red family, warm, vivid",
        positive_color_id=color_id,
        positive_hex="#FF0000" if color_id else None,
        source=source,
        weight=1.0,
    )


def test_same_anchor_not_across_splits() -> None:
    pairs = [
        _pair(pair_id="a:1", anchor="calm professional", source="color_pedia_metadata"),
        _pair(pair_id="a:2", anchor="calm professional", source="color_pedia_metadata"),
        _pair(pair_id="b:1", anchor="warm nostalgic", source="color_pedia_metadata"),
    ]
    cfg = OmegaConf.create({"seed": 42, "train": 0.8, "val": 0.1, "test": 0.1, "leakage_check": True})
    assigned, report = assign_splits(pairs, cfg)
    anchor_splits: dict[str, set[str]] = {}
    for pair in assigned:
        anchor_splits.setdefault(pair.anchor, set()).add(pair.split or "")
    for splits in anchor_splits.values():
        assert len(splits) == 1
    assert report.leakage.passed


def test_candidate_self_same_color_id_not_across_splits() -> None:
    pairs = [
        _pair(pair_id="xkcd:1", anchor="crimson", source="xkcd_self", color_id="xkcd:crimson"),
        _pair(pair_id="cp:1", anchor="crimson red", source="color_pedia_self", color_id="cp:crimson"),
    ]
    cfg = OmegaConf.create({"seed": 7, "train": 0.8, "val": 0.1, "test": 0.1})
    assigned, _ = assign_splits(pairs, cfg)
    color_splits: dict[str, set[str]] = {}
    for pair in assigned:
        if pair.positive_color_id:
            color_splits.setdefault(pair.positive_color_id, set()).add(pair.split or "")
    for splits in color_splits.values():
        assert len(splits) == 1


def test_split_ratios_roughly_correct() -> None:
    pairs = [
        _pair(pair_id=f"m:{i}", anchor=f"anchor phrase number {i}", source="color_pedia_metadata")
        for i in range(100)
    ]
    cfg = OmegaConf.create({"seed": 42, "train": 0.8, "val": 0.1, "test": 0.1, "leakage_check": False})
    assigned, report = assign_splits(pairs, cfg)
    assert report.by_split["train"] >= 60
    assert report.by_split.get("val", 0) >= 5
    assert report.by_split.get("test", 0) >= 5


def test_seed_stable() -> None:
    pairs = [
        _pair(pair_id=f"m:{i}", anchor=f"phrase {i}", source="color_pedia_metadata")
        for i in range(20)
    ]
    cfg = OmegaConf.create({"seed": 99, "train": 0.8, "val": 0.1, "test": 0.1, "leakage_check": False})
    a1, _ = assign_splits(pairs, cfg)
    a2, _ = assign_splits(pairs, cfg)
    assert [p.split for p in a1] == [p.split for p in a2]


def test_tiny_dataset_does_not_crash() -> None:
    pairs = [_pair(pair_id="only:1", anchor="single anchor", source="user_curated")]
    cfg = OmegaConf.create({"seed": 42, "train": 0.8, "val": 0.1, "test": 0.1})
    assigned, report = assign_splits(pairs, cfg)
    assert len(assigned) == 1
    assert assigned[0].split == "train" or report.note


def test_leakage_check_reports_violations() -> None:
    pairs = [
        TrainingPair(
            pair_id="x:1",
            anchor="shared anchor",
            positive="blue family",
            source="color_pedia_metadata",
            weight=1.0,
            split="train",
        ),
        TrainingPair(
            pair_id="x:2",
            anchor="shared anchor",
            positive="blue family cool",
            source="color_pedia_metadata",
            weight=1.0,
            split="val",
        ),
    ]
    report = check_leakage(pairs)
    assert not report.passed
    assert report.anchor_cross_split_violations >= 1


def test_split_group_key_self_uses_color_id() -> None:
    pair = _pair(pair_id="s:1", anchor="crimson", source="xkcd_self", color_id="xkcd:crimson")
    assert split_group_key(pair).startswith("color:")
