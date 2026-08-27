from __future__ import annotations

from collections import Counter

from app.config.pattern_supply import OFFLINE_POLICY


def build_collocation_index_rows(collocations: dict[str, Counter[str]]) -> dict[str, list[tuple[str, int, float]]]:
    rows: dict[str, list[tuple[str, int, float]]] = {}
    for collocation_key, words in collocations.items():
        total = float(sum(words.values()) or 1.0)
        rows[collocation_key] = [
            (w, c, float(c) / total) for w, c in words.most_common(OFFLINE_POLICY.top_patterns_per_key)
        ]
    return rows

