from __future__ import annotations

from app.config.pattern_supply import WEIGHTS


def compute_supply_score(
    *,
    demand_match_score: float,
    pattern_coverage_gain: float,
    context_coverage_gain: float,
    collocation_coverage_gain: float,
    frequency_utility: float,
    redundancy_penalty: float,
    annotation_cost: float,
) -> tuple[float, dict[str, float]]:
    breakdown = {
        "demand_match_score": float(demand_match_score),
        "pattern_coverage_gain": float(pattern_coverage_gain),
        "context_coverage_gain": float(context_coverage_gain),
        "collocation_coverage_gain": float(collocation_coverage_gain),
        "frequency_utility": float(frequency_utility),
        "redundancy_penalty": float(redundancy_penalty),
        "annotation_cost": float(annotation_cost),
    }
    score = (
        WEIGHTS.demand_match_score * breakdown["demand_match_score"]
        + WEIGHTS.pattern_coverage_gain * breakdown["pattern_coverage_gain"]
        + WEIGHTS.context_coverage_gain * breakdown["context_coverage_gain"]
        + WEIGHTS.collocation_coverage_gain * breakdown["collocation_coverage_gain"]
        + WEIGHTS.frequency_utility * breakdown["frequency_utility"]
        - WEIGHTS.redundancy_penalty * breakdown["redundancy_penalty"]
        - WEIGHTS.annotation_cost * breakdown["annotation_cost"]
    )
    return float(score), breakdown

