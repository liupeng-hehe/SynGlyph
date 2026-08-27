from __future__ import annotations

from collections import Counter

from app.config.pattern_supply import OFFLINE_POLICY


def build_context_index_rows(context_pairs: dict[str, Counter[str]]) -> dict[str, list[tuple[str, int, float]]]:
    rows: dict[str, list[tuple[str, int, float]]] = {}
    for context_key, words in context_pairs.items():
        total = float(sum(words.values()) or 1.0)
        rows[context_key] = [
            (w, c, float(c) / total) for w, c in words.most_common(OFFLINE_POLICY.top_patterns_per_key)
        ]
    return rows

