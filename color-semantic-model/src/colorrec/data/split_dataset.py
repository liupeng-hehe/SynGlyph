"""Grouped train/val/test split for training pairs."""

from __future__ import annotations

import hashlib
import logging
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Literal

from omegaconf import DictConfig, OmegaConf

from colorrec.schemas import TrainingPair

logger = logging.getLogger(__name__)

SplitName = Literal["train", "val", "test"]


@dataclass
class LeakageReport:
    anchor_cross_split_violations: int = 0
    color_id_cross_split_violations: int = 0
    examples_anchor: list[dict[str, str]] = field(default_factory=list)
    examples_color_id: list[dict[str, str]] = field(default_factory=list)
    passed: bool = True


@dataclass
class SplitReport:
    total: int = 0
    by_split: dict[str, int] = field(default_factory=dict)
    by_source_split: dict[str, dict[str, int]] = field(default_factory=dict)
    leakage: LeakageReport = field(default_factory=LeakageReport)
    note: str = ""


def normalize_anchor(text: str) -> str:
    return " ".join(str(text).strip().lower().split())


def _anchor_key(anchor: str) -> str:
    digest = hashlib.sha1(normalize_anchor(anchor).encode("utf-8")).hexdigest()
    return f"anchor:{digest}"


def _canonical_groups(pairs: list[TrainingPair]) -> dict[int, str]:
    """Union-find merge groups sharing anchor text or positive_color_id."""
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    pair_keys: list[list[str]] = []
    for pair in pairs:
        keys = [_anchor_key(pair.anchor)]
        if pair.positive_color_id:
            keys.append(f"color:{pair.positive_color_id}")
        for key in keys:
            parent.setdefault(key, key)
        if len(keys) > 1:
            for key in keys[1:]:
                union(keys[0], key)
        pair_keys.append(keys)

    canonical: dict[int, str] = {}
    for idx, keys in enumerate(pair_keys):
        canonical[idx] = find(keys[0])
    return canonical


def split_group_key(pair: TrainingPair) -> str:
    """Return display/debug group key (anchor-based)."""
    if pair.positive_color_id and pair.source.endswith("_self"):
        return f"color:{pair.positive_color_id}"
    return _anchor_key(pair.anchor)


def _split_bucket(group_key: str, seed: int, train_ratio: float, val_ratio: float) -> SplitName:
    h = int(hashlib.sha1(f"{seed}:{group_key}".encode("utf-8")).hexdigest(), 16) % 10_000
    train_cut = int(train_ratio * 10_000)
    val_cut = int((train_ratio + val_ratio) * 10_000)
    if h < train_cut:
        return "train"
    if h < val_cut:
        return "val"
    return "test"


def assign_splits(
    pairs: list[TrainingPair],
    split_cfg: DictConfig | dict,
) -> tuple[list[TrainingPair], SplitReport]:
    """Assign grouped splits in-place on copies of pairs."""
    if isinstance(split_cfg, DictConfig):
        cfg = OmegaConf.to_container(split_cfg, resolve=True)
    else:
        cfg = split_cfg

    seed = int(cfg.get("seed", 42))
    train_ratio = float(cfg.get("train", 0.8))
    val_ratio = float(cfg.get("val", 0.1))
    test_ratio = float(cfg.get("test", 0.1))
    total_ratio = train_ratio + val_ratio + test_ratio
    if total_ratio <= 0:
        train_ratio, val_ratio, test_ratio = 0.8, 0.1, 0.1
    else:
        train_ratio /= total_ratio
        val_ratio /= total_ratio
        test_ratio /= total_ratio

    canonical = _canonical_groups(pairs)
    groups: dict[str, list[int]] = defaultdict(list)
    for idx in range(len(pairs)):
        groups[canonical[idx]].append(idx)

    assigned: list[TrainingPair] = [pairs[i].model_copy() for i in range(len(pairs))]
    split_counts: Counter[str] = Counter()
    source_split: dict[str, Counter[str]] = defaultdict(Counter)

    for group_key, indices in groups.items():
        split_name = _split_bucket(group_key, seed, train_ratio, val_ratio)
        split_counts[split_name] += len(indices)
        for idx in indices:
            pair = assigned[idx]
            assigned[idx] = pair.model_copy(update={"split": split_name})
            source_split[pair.source][split_name] += 1

    # Ensure train non-empty for tiny datasets
    note = ""
    if split_counts.get("train", 0) == 0 and assigned:
        note = "Train split was empty; moved largest group to train."
        logger.warning(note)
        largest_group = max(groups.items(), key=lambda kv: len(kv[1]))[0]
        for idx in groups[largest_group]:
            pair = assigned[idx]
            assigned[idx] = pair.model_copy(update={"split": "train"})
        split_counts = Counter(p.split for p in assigned if p.split)
        source_split = defaultdict(Counter)
        for pair in assigned:
            if pair.split:
                source_split[pair.source][pair.split] += 1

    report = SplitReport(
        total=len(assigned),
        by_split=dict(split_counts),
        by_source_split={src: dict(cnt) for src, cnt in source_split.items()},
        note=note,
    )

    if bool(cfg.get("leakage_check", True)):
        report.leakage = check_leakage(assigned)

    return assigned, report


def check_leakage(pairs: list[TrainingPair]) -> LeakageReport:
    """Check for anchor or color-id leakage across splits."""
    anchor_splits: dict[str, set[str]] = defaultdict(set)
    color_splits: dict[str, set[str]] = defaultdict(set)

    for pair in pairs:
        if not pair.split:
            continue
        anchor_splits[normalize_anchor(pair.anchor)].add(pair.split)
        if pair.source.endswith("_self") and pair.positive_color_id:
            color_splits[pair.positive_color_id].add(pair.split)

    report = LeakageReport()
    for anchor, splits in anchor_splits.items():
        if len(splits) > 1:
            report.anchor_cross_split_violations += 1
            if len(report.examples_anchor) < 5:
                report.examples_anchor.append({"anchor": anchor, "splits": ",".join(sorted(splits))})

    for color_id, splits in color_splits.items():
        if len(splits) > 1:
            report.color_id_cross_split_violations += 1
            if len(report.examples_color_id) < 5:
                report.examples_color_id.append({"positive_color_id": color_id, "splits": ",".join(sorted(splits))})

    report.passed = (
        report.anchor_cross_split_violations == 0 and report.color_id_cross_split_violations == 0
    )
    if not report.passed:
        logger.warning(
            "Leakage check failed: anchor_violations=%d color_id_violations=%d",
            report.anchor_cross_split_violations,
            report.color_id_cross_split_violations,
        )
    return report


def partition_by_split(pairs: list[TrainingPair]) -> tuple[list[TrainingPair], list[TrainingPair], list[TrainingPair]]:
    train = [p for p in pairs if p.split == "train"]
    val = [p for p in pairs if p.split == "val"]
    test = [p for p in pairs if p.split == "test"]
    return train, val, test
