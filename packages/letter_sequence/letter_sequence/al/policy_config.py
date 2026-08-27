"""Acquisition policy config: softmax weights and JSON-serializable bundles."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any, Mapping


def softmax(logits: list[float]) -> list[float]:
    if not logits:
        return []
    m = max(logits)
    ex = [math.exp(float(x) - m) for x in logits]
    s = sum(ex)
    if s <= 0:
        n = len(logits)
        return [1.0 / n] * n
    return [e / s for e in ex]


def feature_weights_from_logits(
    logits: Mapping[str, float],
    *,
    keys: tuple[str, ...] = (
        "boundary_uncertainty",
        "segment_attribute_uncertainty",
        "segment_novelty",
        "coverage_gain",
        "instability",
    ),
) -> dict[str, float]:
    """Nonnegative weights summing to 1 (softmax over named logits)."""
    ls = [float(logits.get(k, 0.0)) for k in keys]
    sw = softmax(ls)
    return dict(zip(keys, sw, strict=True))


DEFAULT_API_WEIGHTS: dict[str, float] = {
    "boundary_uncertainty": 0.35,
    "segment_attribute_uncertainty": 0.25,
    "segment_novelty": 0.20,
    "coverage_gain": 0.10,
    "instability": 0.10,
}


@dataclass
class AcquisitionPolicyConfig:
    """Serializable policy for replay / tuning (BiLSTM-first experiments)."""

    feature_logits: dict[str, float] | None = None
    feature_weights: dict[str, float] | None = None
    lambda_cost: float = 0.25
    lambda_redundancy: float = 0.35
    enable_cost_aware_scoring: bool = False
    enable_diversity_rerank: bool = False
    cost_mode: str = "length_plus_rarity"
    diversity_top_m: int = 48
    similarity_backend: str = "char_ngram_cosine"

    def weights_for_scoring(self) -> dict[str, float]:
        if self.feature_weights:
            return dict(self.feature_weights)
        if self.feature_logits is not None:
            return feature_weights_from_logits(self.feature_logits)
        return dict(DEFAULT_API_WEIGHTS)

    def normalized_logits_weights(self) -> dict[str, float]:
        if self.feature_logits is not None:
            return feature_weights_from_logits(self.feature_logits)
        return dict(DEFAULT_API_WEIGHTS)

    def to_json_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["weights_for_scoring"] = self.weights_for_scoring()
        d["normalized_logits_weights"] = self.normalized_logits_weights()
        return d
