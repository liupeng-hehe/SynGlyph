"""Pattern Supply runtime knobs and defaults."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ProviderPolicy:
    timeout_ms: int
    retries: int
    backoff_ms: tuple[int, int]
    cache_ttl_seconds: int


@dataclass(frozen=True)
class ScoringWeights:
    demand_match_score: float = 0.28
    pattern_coverage_gain: float = 0.20
    context_coverage_gain: float = 0.16
    collocation_coverage_gain: float = 0.14
    frequency_utility: float = 0.10
    redundancy_penalty: float = 0.07
    annotation_cost: float = 0.05


@dataclass(frozen=True)
class DemandProfileTargets:
    pattern_default: int = 12
    context_default: int = 8
    collocation_default: int = 6


@dataclass(frozen=True)
class DemandProfilePolicy:
    profile_ttl_seconds: int = 600
    profile_version: str = "pattern_supply_v1"


@dataclass(frozen=True)
class OfflineIndexPolicy:
    corpus_scope: str = "general_web"
    corpus_path: str = str(Path("artifacts/corpus/general_web.txt"))
    rebuild_batch_size: int = 5000
    max_vocab_size: int = 200_000
    top_patterns_per_key: int = 80
    active_version: str | None = None
    min_word_len: int = 3


DATAMUSE_POLICY = ProviderPolicy(
    timeout_ms=1200,
    retries=2,
    backoff_ms=(200, 500),
    cache_ttl_seconds=30 * 60,
)

LEXICAL_POLICY = ProviderPolicy(
    timeout_ms=1500,
    retries=2,
    backoff_ms=(200, 500),
    cache_ttl_seconds=24 * 60 * 60,
)

COLLOCATION_POLICY = ProviderPolicy(
    timeout_ms=1800,
    retries=2,
    backoff_ms=(200, 500),
    cache_ttl_seconds=12 * 60 * 60,
)

WEIGHTS = ScoringWeights()
TARGETS = DemandProfileTargets()
PROFILE_POLICY = DemandProfilePolicy()
OFFLINE_POLICY = OfflineIndexPolicy()

