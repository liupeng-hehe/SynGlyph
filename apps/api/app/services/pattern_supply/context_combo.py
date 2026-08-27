from __future__ import annotations

from app.services.pattern_supply.contracts import ContextCombo


def build_context_combos(
    *,
    left_context: list[str] | None = None,
    right_context: list[str] | None = None,
    topic_hints: list[str] | None = None,
    domain_hints: list[str] | None = None,
    collocation_units: list[str] | None = None,
    position_signature: str | None = None,
) -> list[ContextCombo]:
    return [
        ContextCombo(
            left_context_tokens=list(left_context or []),
            right_context_tokens=list(right_context or []),
            topic_hints=list(topic_hints or []),
            domain_hints=list(domain_hints or []),
            collocation_units=list(collocation_units or []),
            position_signature=position_signature,
        )
    ]

