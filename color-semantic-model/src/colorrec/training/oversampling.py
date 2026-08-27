"""Weight-based oversampling for MNRL training pairs."""

from __future__ import annotations

from collections import Counter
from typing import Any

from omegaconf import DictConfig

from colorrec.schemas import TrainingPair


def weight_to_copies(weight: float, *, max_oversample_copies: int = 4) -> int:
    """Map pair weight to duplicate count for oversampling."""
    if weight <= 1.0:
        copies = 1
    elif weight <= 2.0:
        copies = 2
    elif weight <= 3.0:
        copies = 3
    else:
        copies = 4
    return min(max(1, int(max_oversample_copies)), copies)


def apply_weighted_oversampling(
    pairs: list[TrainingPair],
    *,
    enabled: bool = True,
    max_oversample_copies: int = 4,
) -> tuple[list[TrainingPair], dict[str, Any]]:
    """Duplicate training pairs according to weight tiers."""
    before_by_source = dict(Counter(p.source for p in pairs))
    if not enabled or not pairs:
        report = build_oversampling_report(
            pairs,
            pairs,
            enabled=enabled,
            max_oversample_copies=max_oversample_copies,
        )
        return list(pairs), report

    oversampled: list[TrainingPair] = []
    for pair in pairs:
        copies = weight_to_copies(pair.weight, max_oversample_copies=max_oversample_copies)
        oversampled.extend([pair] * copies)

    report = build_oversampling_report(
        pairs,
        oversampled,
        enabled=enabled,
        max_oversample_copies=max_oversample_copies,
    )
    return oversampled, report


def build_oversampling_report(
    raw_pairs: list[TrainingPair],
    effective_pairs: list[TrainingPair],
    *,
    enabled: bool,
    max_oversample_copies: int,
) -> dict[str, Any]:
    before_by_source = dict(Counter(p.source for p in raw_pairs))
    after_by_source = dict(Counter(p.source for p in effective_pairs))
    effective_total = len(effective_pairs)
    user_curated_effective = after_by_source.get("user_curated", 0)
    return {
        "weighted_oversampling_enabled": enabled,
        "max_oversample_copies": max_oversample_copies,
        "raw_train_pairs": len(raw_pairs),
        "effective_train_examples": effective_total,
        "pairs_by_source_before": before_by_source,
        "pairs_by_source_after": after_by_source,
        "user_curated_effective_share": (
            user_curated_effective / effective_total if effective_total else 0.0
        ),
    }


def oversampling_settings(cfg: DictConfig) -> tuple[bool, int]:
    enabled = bool(cfg.train.get("use_weighted_oversampling", True))
    max_copies = int(cfg.train.get("max_oversample_copies", 4))
    return enabled, max_copies
