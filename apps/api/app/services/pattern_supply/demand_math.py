from __future__ import annotations


def gap_raw(target: float, covered: float) -> float:
    return max(0.0, float(target) - float(covered))


def gap_norm(target: float, covered: float) -> float:
    raw = gap_raw(target, covered)
    return raw / max(1.0, float(target))


def pattern_gap_priority(
    *,
    target: float,
    covered: float,
    scarcity_weight: float = 1.0,
    recency_decay: float = 1.0,
) -> float:
    return gap_norm(target, covered) * float(scarcity_weight) * float(recency_decay)


def context_gap_priority(
    *,
    target: float,
    covered: float,
    context_entropy_weight: float = 1.0,
) -> float:
    return gap_norm(target, covered) * float(context_entropy_weight)


def collocation_gap_priority(
    *,
    target: float,
    covered: float,
    pmi_weight: float = 1.0,
    domain_weight: float = 1.0,
) -> float:
    return gap_norm(target, covered) * float(pmi_weight) * float(domain_weight)

