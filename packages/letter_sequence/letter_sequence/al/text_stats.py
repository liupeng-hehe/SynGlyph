"""Labeled-text novelty, coverage, and instability helpers (shared with API hybrid AL)."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Iterable


def _char_units(text: str) -> list[str]:
    return [c for c in text.lower() if c.strip()]


def _ngrams(chars: list[str], n: int) -> list[str]:
    if len(chars) < n:
        return []
    return ["".join(chars[i : i + n]) for i in range(0, len(chars) - n + 1)]


def _variance(values: Iterable[float]) -> float:
    xs = [float(v) for v in values]
    if len(xs) < 2:
        return 0.0
    mean = sum(xs) / len(xs)
    return sum((x - mean) ** 2 for x in xs) / len(xs)


@dataclass(frozen=True)
class CoverageTargets:
    """Defaults aligned with apps/api ALTargets for hybrid coverage_gain."""

    char_target_count: int = 20
    bigram_target_count: int = 12
    trigram_target_count: int = 8


DEFAULT_COVERAGE_TARGETS = CoverageTargets()


def build_unit_counts_from_texts(texts: Iterable[str]) -> dict[str, Counter[str]]:
    char_counts: Counter[str] = Counter()
    bigram_counts: Counter[str] = Counter()
    trigram_counts: Counter[str] = Counter()
    for text in texts:
        if not text:
            continue
        chars = _char_units(text)
        char_counts.update(chars)
        bigram_counts.update(_ngrams(chars, 2))
        trigram_counts.update(_ngrams(chars, 3))
    return {"char": char_counts, "bigram": bigram_counts, "trigram": trigram_counts}


def segment_novelty_score(text: str, counts: dict[str, Counter[str]]) -> float:
    chars = _char_units(text or "")
    if not chars:
        return 0.0
    bgs = _ngrams(chars, 2)
    tgs = _ngrams(chars, 3)

    def _rarity(items: list[str], c: Counter[str]) -> float:
        if not items:
            return 0.0
        return sum(1.0 / (1.0 + float(c.get(u, 0))) for u in items) / len(items)

    c_r = _rarity(chars, counts["char"])
    b_r = _rarity(bgs, counts["bigram"])
    t_r = _rarity(tgs, counts["trigram"])
    return 0.5 * c_r + 0.3 * b_r + 0.2 * t_r


def coverage_gain_score(
    text: str,
    counts: dict[str, Counter[str]],
    *,
    targets: CoverageTargets | None = None,
) -> float:
    t = targets or DEFAULT_COVERAGE_TARGETS
    chars = _char_units(text or "")
    if not chars:
        return 0.0
    bgs = _ngrams(chars, 2)
    tgs = _ngrams(chars, 3)

    def _deficit(units: list[str], c: Counter[str], target: int) -> float:
        if not units:
            return 0.0
        seen = set(units)
        return (
            sum(max(0.0, float(target - c.get(u, 0))) / float(max(1, target)) for u in seen)
        ) / len(seen)

    c_d = _deficit(chars, counts["char"], t.char_target_count)
    b_d = _deficit(bgs, counts["bigram"], t.bigram_target_count)
    t_d = _deficit(tgs, counts["trigram"], t.trigram_target_count)
    return 0.5 * c_d + 0.3 * b_d + 0.2 * t_d


def instability_score(
    boundary_unc_history: list[float],
    attribute_unc_history: list[float],
) -> float:
    return _variance(boundary_unc_history) + 0.5 * _variance(attribute_unc_history)


def instability_score_replay_cold(
    boundary_unc_history: list[float],
    attribute_unc_history: list[float],
) -> float:
    """Replay: zero until both histories have length >= 2 (variance defined)."""
    if len(boundary_unc_history) < 2 or len(attribute_unc_history) < 2:
        return 0.0
    return instability_score(boundary_unc_history, attribute_unc_history)
