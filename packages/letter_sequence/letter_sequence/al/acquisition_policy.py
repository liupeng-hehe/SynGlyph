"""
Shared hybrid acquisition: normalization, weighted score, optional cost penalty, diversity rerank.

Extension points (no-op when disabled): estimated_label_cost, embedding similarity (stub).
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass
from typing import Any, Literal, Mapping, Sequence

from letter_sequence.al.normalization import robust_minmax_normalize

HYBRID_FEATURE_KEYS: tuple[str, ...] = (
    "boundary_uncertainty",
    "segment_attribute_uncertainty",
    "segment_novelty",
    "coverage_gain",
    "instability",
)


@dataclass(frozen=True)
class HybridNormConfig:
    lower_percentile: float = 5.0
    upper_percentile: float = 95.0
    collapse_fallback: float = 0.5


def normalize_acquisition_features(
    feature_matrix: Mapping[str, Sequence[float]],
    *,
    norm: HybridNormConfig,
) -> dict[str, list[float]]:
    """Per-column robust min–max (same as online hybrid)."""
    out: dict[str, list[float]] = {}
    for k in HYBRID_FEATURE_KEYS:
        vals = [float(x) for x in feature_matrix.get(k, [])]
        out[k] = robust_minmax_normalize(
            vals,
            p_low=norm.lower_percentile,
            p_high=norm.upper_percentile,
            fallback=norm.collapse_fallback,
        )
    return out


def _weighted_sum(norm: Mapping[str, float], weights: Mapping[str, float]) -> float:
    return sum(float(weights.get(k, 0.0)) * float(norm[k]) for k in HYBRID_FEATURE_KEYS)


def score_hybrid_candidates(
    rows: list[dict[str, Any]],
    *,
    weights: Mapping[str, float],
    norm: HybridNormConfig,
) -> list[dict[str, Any]]:
    """
    Each row: stimulus_id, text, and raw hybrid features (five floats).

    Returns dicts with same keys plus score_norm_json and score (weighted linear sum).
    """
    if not rows:
        return []
    fm = {k: [float(r[k]) for r in rows] for k in HYBRID_FEATURE_KEYS}
    normed = normalize_acquisition_features(fm, norm=norm)
    out: list[dict[str, Any]] = []
    for i, r in enumerate(rows):
        nmap = {k: float(normed[k][i]) for k in HYBRID_FEATURE_KEYS}
        score = _weighted_sum(nmap, weights)
        out.append(
            {
                "stimulus_id": r["stimulus_id"],
                "text": r["text"],
                **{k: float(r[k]) for k in HYBRID_FEATURE_KEYS},
                "score_norm_json": nmap,
                "score": float(score),
            }
        )
    return out


def estimate_label_cost(
    text: str,
    *,
    mode: str,
    labeled_char_counts: Counter[str] | None = None,
    difficulty: float | None = None,
) -> float:
    """
    Deterministic cost heuristic (higher = more expensive to label).

    Modes:
    - ``length``: proportional to character count (non-space).
    - ``length_plus_rarity``: length + mean inverse frequency (1/(1+count)) for chars vs labeled pool.
    - ``length_plus_rarity_and_difficulty``: above + optional difficulty in [0,1] (0 if absent).
    """
    chars = [c for c in (text or "").lower() if c.strip()]
    L = max(1, len(chars))
    base = float(L)
    if mode == "length":
        return base
    rarity = 0.0
    if labeled_char_counts is not None and chars:
        rarity = sum(1.0 / (1.0 + float(labeled_char_counts.get(c, 0))) for c in chars) / len(chars)
    if mode == "length_plus_rarity":
        return base + rarity
    if mode == "length_plus_rarity_and_difficulty":
        d = float(difficulty) if difficulty is not None else 0.0
        return base + rarity + max(0.0, min(1.0, d))
    return base


def apply_cost_penalty(
    scored_rows: list[dict[str, Any]],
    *,
    raw_costs: list[float],
    lambda_cost: float,
    norm: HybridNormConfig,
) -> list[dict[str, Any]]:
    """In-pool normalize costs, then score' = score - lambda * cost_norm."""
    cost_norm = robust_minmax_normalize(
        [float(c) for c in raw_costs],
        p_low=norm.lower_percentile,
        p_high=norm.upper_percentile,
        fallback=norm.collapse_fallback,
    )
    out: list[dict[str, Any]] = []
    for i, row in enumerate(scored_rows):
        cn = float(cost_norm[i])
        adj = float(row["score"]) - float(lambda_cost) * cn
        r = dict(row)
        r["estimated_label_cost"] = float(raw_costs[i])
        r["normalized_label_cost"] = cn
        r["score_before_cost"] = float(row["score"])
        r["score"] = adj
        out.append(r)
    return out


SimilarityBackend = Literal["char_ngram_cosine", "jaccard", "embedding"]


def lexical_similarity(text_a: str, text_b: str, backend: SimilarityBackend) -> float:
    """Returns similarity in [0, 1]; higher = more similar."""
    if backend == "embedding":
        raise NotImplementedError("embedding similarity is an extension point; not implemented in v1")
    ca = _char_units(text_a)
    cb = _char_units(text_b)
    if backend == "jaccard":
        ba = set(_ngrams(ca, 2))
        bb = set(_ngrams(cb, 2))
        if not ba and not bb:
            return 1.0 if ca == cb else 0.0
        inter = len(ba & bb)
        union = len(ba | bb)
        return float(inter / union) if union else 0.0
    # char_ngram_cosine: default 3-gram
    ca3 = _ngrams(ca, 3)
    cb3 = _ngrams(cb, 3)
    cta = Counter(ca3)
    ctb = Counter(cb3)
    if not cta and not ctb:
        return 1.0 if text_a == text_b else 0.0
    keys = set(cta) | set(ctb)
    dot = sum(float(cta.get(k, 0) * ctb.get(k, 0)) for k in keys)
    na = math.sqrt(sum(float(v * v) for v in cta.values()))
    nb = math.sqrt(sum(float(v * v) for v in ctb.values()))
    if na <= 0 or nb <= 0:
        return 0.0
    return float(dot / (na * nb))


def _char_units(text: str) -> list[str]:
    return [c for c in text.lower() if c.strip()]


def _ngrams(chars: list[str], n: int) -> list[str]:
    if len(chars) < n:
        return []
    return ["".join(chars[i : i + n]) for i in range(0, len(chars) - n + 1)]


def rerank_batch_with_diversity(
    rows: list[dict[str, Any]],
    *,
    k: int,
    top_m: int,
    lambda_redundancy: float,
    similarity_backend: SimilarityBackend,
    text_key: str = "text",
    score_key: str = "score",
) -> list[dict[str, Any]]:
    """
    Sort by score desc, keep top ``top_m`` (at least ``k`` if pool is short), greedily pick ``k``
    items maximizing adjusted_score = score - lambda * max_similarity_to_selected.
    """
    if k <= 0 or not rows:
        return []
    if similarity_backend == "embedding":
        raise NotImplementedError("embedding backend is stub-only in v1; use char_ngram_cosine or jaccard")

    sorted_rows = sorted(rows, key=lambda r: -float(r[score_key]))
    m_take = min(len(sorted_rows), max(int(top_m), int(k)))
    pool = sorted_rows[:m_take]
    if len(pool) <= k:
        return [dict(r) for r in pool[:k]]

    selected: list[dict[str, Any]] = [dict(pool[0])]
    pool_rest = [dict(r) for r in pool[1:]]
    while len(selected) < k and pool_rest:
        best_i = -1
        best_adj = -1e18
        for i, cand in enumerate(pool_rest):
            ta = str(cand[text_key])
            sims = [lexical_similarity(ta, str(s[text_key]), similarity_backend) for s in selected]
            mx = max(sims) if sims else 0.0
            adj = float(cand[score_key]) - float(lambda_redundancy) * mx
            if adj > best_adj:
                best_adj = adj
                best_i = i
        if best_i < 0:
            break
        chosen = pool_rest.pop(best_i)
        chosen["diversity_adjusted_score"] = best_adj
        selected.append(chosen)
    return selected[:k]
