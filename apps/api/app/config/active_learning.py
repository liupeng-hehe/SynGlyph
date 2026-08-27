"""Configuration knobs for hybrid Active Learning scoring v1."""

from __future__ import annotations

import os
from dataclasses import dataclass


def al_candidate_sql_fetch_multiplier() -> int:
    """
    Multiplier for how many DB rows to scan when building the AL candidate pool
    (SQL ``LIMIT = pool_target * mult`` inside ``fetch_candidate_stimuli`` / KB fetch).
    Higher values reduce alphabetical / import-order bias before scoring.
    Env: ``SYNGLYPH_AL_CANDIDATE_SQL_MULT`` (clamped to ``[2, 30]``, default ``12``).
    """
    raw = os.environ.get("SYNGLYPH_AL_CANDIDATE_SQL_MULT", "12")
    try:
        v = int(raw)
    except ValueError:
        v = 12
    return max(2, min(30, v))


def al_scoring_pool_factor() -> int:
    """
    ``pool_target = refresh_limit * factor`` candidates to score before taking top-K.
    Env: ``SYNGLYPH_AL_SCORING_POOL_MULT`` (clamped to ``[2, 20]``, default ``6``).
    """
    raw = os.environ.get("SYNGLYPH_AL_SCORING_POOL_MULT", "6")
    try:
        v = int(raw)
    except ValueError:
        v = 6
    return max(2, min(20, v))


def al_kb_candidate_sql_multiplier() -> int:
    """
    KB lexicon source: extra multiplier for words pulled before registry filter.
    Env: ``SYNGLYPH_AL_KB_SQL_MULT`` (clamped to ``[6, 60]``, default ``18``).
    """
    raw = os.environ.get("SYNGLYPH_AL_KB_SQL_MULT", "18")
    try:
        v = int(raw)
    except ValueError:
        v = 18
    return max(6, min(60, v))


def al_tie_break_mode() -> str:
    """
    How to order rows with equal hybrid score: ``none`` | ``hash`` | ``random``.
    ``hash`` breaks ties deterministically by ``stimulus_id`` (reduces stable-sort bias).
    Env: ``SYNGLYPH_AL_TIE_BREAK`` (default ``hash``).
    """
    raw = (os.environ.get("SYNGLYPH_AL_TIE_BREAK", "hash") or "hash").strip().lower()
    if raw in ("none", "off", "false", "0"):
        return "none"
    if raw in ("random", "shuffle"):
        return "random"
    return "hash"


def _env_truthy(key: str, default: str = "0") -> bool:
    raw = (os.environ.get(key, default) or default).strip().lower()
    return raw in ("1", "true", "yes", "on")


def al_enable_cost_aware_scoring() -> bool:
    """Env: ``SYNGLYPH_AL_ENABLE_COST_AWARE`` (default off)."""
    return _env_truthy("SYNGLYPH_AL_ENABLE_COST_AWARE", "0")


def al_lambda_cost() -> float:
    raw = os.environ.get("SYNGLYPH_AL_LAMBDA_COST", "0.25")
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 0.25


def al_cost_mode() -> str:
    raw = (os.environ.get("SYNGLYPH_AL_COST_MODE", "length_plus_rarity") or "length_plus_rarity").strip().lower()
    if raw in ("length", "length_plus_rarity", "length_plus_rarity_and_difficulty"):
        return raw
    return "length_plus_rarity"


def al_enable_diversity_rerank() -> bool:
    """Env: ``SYNGLYPH_AL_ENABLE_DIVERSITY_RERANK`` (default off)."""
    return _env_truthy("SYNGLYPH_AL_ENABLE_DIVERSITY_RERANK", "0")


def al_kb_pattern_debug_detail() -> bool:
    """When true, AL ``kb_explain_json`` includes ``kb_pattern_deficit_detail`` per candidate."""
    return _env_truthy("SYNGLYPH_AL_KB_PATTERN_DEBUG", "0")


def al_diversity_top_m() -> int:
    raw = os.environ.get("SYNGLYPH_AL_DIVERSITY_TOP_M", "48")
    try:
        return max(2, int(raw))
    except ValueError:
        return 48


def al_lambda_syllable_novelty() -> float:
    """Blend syllable / stress–pattern rarity into segment novelty. Env: ``SYNGLYPH_AL_LAMBDA_SYLLABLE``."""
    raw = os.environ.get("SYNGLYPH_AL_LAMBDA_SYLLABLE", "0.12")
    try:
        return max(0.0, min(0.5, float(raw)))
    except ValueError:
        return 0.12


def al_lambda_feedback_risk() -> float:
    """Down-weight if historical correction cost is high. Env: ``SYNGLYPH_AL_LAMBDA_FB_RISK``."""
    raw = os.environ.get("SYNGLYPH_AL_LAMBDA_FB_RISK", "0.08")
    try:
        return max(0.0, min(0.3, float(raw)))
    except ValueError:
        return 0.08


def al_lambda_redundancy() -> float:
    raw = os.environ.get("SYNGLYPH_AL_LAMBDA_REDUNDANCY", "0.35")
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 0.35


def al_similarity_backend() -> str:
    raw = (os.environ.get("SYNGLYPH_AL_SIMILARITY_BACKEND", "char_ngram_cosine") or "char_ngram_cosine").strip().lower()
    if raw in ("char_ngram_cosine", "jaccard", "embedding"):
        return raw
    return "char_ngram_cosine"


@dataclass(frozen=True)
class ALWeights:
    boundary_uncertainty: float = 0.35
    segment_attribute_uncertainty: float = 0.25
    segment_novelty: float = 0.20
    coverage_gain: float = 0.10
    instability: float = 0.10


@dataclass(frozen=True)
class ALNormalization:
    lower_percentile: float = 5.0
    upper_percentile: float = 95.0
    collapse_fallback: float = 0.5


@dataclass(frozen=True)
class ALTargets:
    char_target_count: int = 20
    bigram_target_count: int = 12
    trigram_target_count: int = 8
    ngram_4_target_count: int = 6
    ngram_5_target_count: int = 4


@dataclass(frozen=True)
class ALHistory:
    instability_window: int = 8
    prediction_history_keep: int = 5000
    queue_snapshot_keep: int = 20000


@dataclass(frozen=True)
class KBBlend:
    """When an active KB vocab exists, blend KB gap scores into legacy coverage/novelty."""

    use_kb_when_active: bool = True
    coverage_kb: float = 0.45
    segment_kb: float = 0.35


WEIGHTS = ALWeights()
NORMALIZATION = ALNormalization()
TARGETS = ALTargets()


def pattern_target_for_unit_type(unit_type: str) -> int:
    """Labeled-coverage targets for KB / analytics gap rows (supports legacy bigram/trigram names)."""
    if unit_type == "char":
        return TARGETS.char_target_count
    if unit_type in ("bigram", "ngram_2"):
        return TARGETS.bigram_target_count
    if unit_type in ("trigram", "ngram_3"):
        return TARGETS.trigram_target_count
    if unit_type == "ngram_4":
        return TARGETS.ngram_4_target_count
    if unit_type == "ngram_5":
        return TARGETS.ngram_5_target_count
    return 4


HISTORY = ALHistory()
KB_BLEND = KBBlend()
