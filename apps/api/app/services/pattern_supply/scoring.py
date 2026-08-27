from __future__ import annotations

from collections import Counter

from app.schemas.pattern_supply import DemandProfileSchema
from app.services.pattern_supply.contracts import EnrichedCandidateDTO, RankedCandidateDTO
from app.services.pattern_supply.scoring_formula import compute_supply_score


def rank_candidates(
    candidates: list[EnrichedCandidateDTO],
    *,
    demand_profile: DemandProfileSchema,
) -> list[RankedCandidateDTO]:
    if not candidates:
        return []
    pattern_priority = _priority_map(demand_profile.pattern_gaps, "pattern_key")
    context_priority = _priority_map(demand_profile.context_gaps, "context_key")
    colloc_priority = _priority_map(demand_profile.collocation_gaps, "collocation_key")
    family_counter = Counter(
        str(c.pattern_features.get("family_key") or "")
        for c in candidates
        if c.pattern_features.get("family_key")
    )

    out: list[RankedCandidateDTO] = []
    for row in candidates:
        d_score = _demand_match(row, pattern_priority, context_priority, colloc_priority)
        pattern_gain = _pattern_gain(row, pattern_priority)
        context_gain = _context_gain(row, context_priority)
        colloc_gain = _collocation_gain(row, colloc_priority)
        freq_utility = _frequency_utility(row.frequency_prior, row.lexical_metadata)
        redundancy_penalty = _redundancy_penalty(row, family_counter)
        annotation_cost = _annotation_cost(row)
        supply_score, breakdown = compute_supply_score(
            demand_match_score=d_score,
            pattern_coverage_gain=pattern_gain,
            context_coverage_gain=context_gain,
            collocation_coverage_gain=colloc_gain,
            frequency_utility=freq_utility,
            redundancy_penalty=redundancy_penalty,
            annotation_cost=annotation_cost,
        )
        why = _why_selected(breakdown, row)
        out.append(
            RankedCandidateDTO(
                word=row.word,
                normalized_word=row.normalized_word,
                lemma=row.lemma,
                sources=row.sources,
                source_confidence=row.source_confidence,
                generation_signals=row.generation_signals,
                provider_payload_refs=row.provider_payload_refs,
                pattern_features=row.pattern_features,
                context_combos=row.context_combos,
                lexical_metadata=row.lexical_metadata,
                frequency_prior=row.frequency_prior,
                collocation_metadata=row.collocation_metadata,
                registry_status=row.registry_status,
                exclusion_reason=row.exclusion_reason,
                score_breakdown=breakdown,
                supply_score=float(supply_score),
                rank=None,
                why_selected=why,
                selected_for_output=True,
            )
        )
    out.sort(key=lambda x: x.supply_score, reverse=True)
    ranked: list[RankedCandidateDTO] = []
    for idx, row in enumerate(out, start=1):
        ranked.append(
            RankedCandidateDTO(
                **{**row.__dict__, "rank": idx},  # dataclass-like reconstruction
            )
        )
    return ranked


def _priority_map(rows, key: str) -> dict[str, float]:
    out = {}
    for row in rows:
        k = getattr(row, key, None)
        if k:
            out[str(k)] = float(row.priority)
    return out


def _pattern_gain(row: EnrichedCandidateDTO, pattern_priority: dict[str, float]) -> float:
    bigrams = row.pattern_features.get("bigrams", [])
    if not isinstance(bigrams, list):
        return 0.0
    return float(sum(pattern_priority.get(f"bigram:{x}", 0.0) for x in bigrams)) / max(1, len(bigrams))


def _context_gain(row: EnrichedCandidateDTO, context_priority: dict[str, float]) -> float:
    combos = row.context_combos or []
    if not combos:
        return 0.0
    hits = 0.0
    total = 0
    for combo in combos:
        for token in combo.topic_hints + combo.domain_hints:
            total += 1
            hits += context_priority.get(f"context:prefix:{token[:2]}", 0.0)
    return hits / max(1, total)


def _collocation_gain(row: EnrichedCandidateDTO, colloc_priority: dict[str, float]) -> float:
    units = row.collocation_metadata.get("units", [])
    if not isinstance(units, list):
        return 0.0
    return float(sum(colloc_priority.get(f"collocation:{u}", 0.0) for u in units)) / max(1, len(units))


def _demand_match(
    row: EnrichedCandidateDTO,
    pattern_priority: dict[str, float],
    context_priority: dict[str, float],
    colloc_priority: dict[str, float],
) -> float:
    return (
        _pattern_gain(row, pattern_priority)
        + _context_gain(row, context_priority)
        + _collocation_gain(row, colloc_priority)
    ) / 3.0


def _frequency_utility(freq: float | None, lexical_metadata: dict[str, str | float | list[str] | None]) -> float:
    if freq is None:
        offline_prior = lexical_metadata.get("offline_global_score")
        if isinstance(offline_prior, (int, float)):
            return max(0.0, min(1.0, float(offline_prior)))
        return 0.0
    # zipf range roughly [1, 7], normalize to [0,1]
    return max(0.0, min(1.0, (float(freq) - 1.0) / 6.0))


def _redundancy_penalty(row: EnrichedCandidateDTO, family_counter: Counter[str]) -> float:
    key = str(row.pattern_features.get("family_key") or "")
    if not key:
        return 0.0
    n = family_counter.get(key, 1)
    return min(1.0, (n - 1) / 10.0)


def _annotation_cost(row: EnrichedCandidateDTO) -> float:
    length = float(row.pattern_features.get("length") or len(row.normalized_word))
    return min(1.0, max(0.0, (length - 3.0) / 10.0))


def _why_selected(breakdown: dict[str, float], row: EnrichedCandidateDTO) -> list[dict[str, float | str | None]]:
    positives = [
        ("demand_match", breakdown["demand_match_score"]),
        ("pattern_gain", breakdown["pattern_coverage_gain"]),
        ("context_gain", breakdown["context_coverage_gain"]),
        ("collocation_gain", breakdown["collocation_coverage_gain"]),
        ("frequency_utility", breakdown["frequency_utility"]),
    ]
    positives.sort(key=lambda x: x[1], reverse=True)
    reasons = [{"reason": k, "value": float(v)} for k, v in positives[:3] if v > 0]
    if not reasons:
        reasons = [{"reason": "fallback_selection", "value": None}]
    if row.sources:
        reasons.append({"reason": f"sources:{','.join(sorted(set(row.sources)))}", "value": None})
    return reasons

