from __future__ import annotations

from collections import Counter, defaultdict

from app.config.pattern_supply import OFFLINE_POLICY


def build_pattern_index_rows(word_counter: Counter[str]) -> dict[str, list[tuple[str, int, float]]]:
    by_pattern: dict[str, Counter[str]] = defaultdict(Counter)
    for word, count in word_counter.items():
        if len(word) < OFFLINE_POLICY.min_word_len:
            continue
        by_pattern[f"prefix:{word[:2]}"][word] += count
        by_pattern[f"suffix:{word[-2:]}"][word] += count
        for bg in _char_ngrams(word, 2):
            by_pattern[f"bigram:{bg}"][word] += count
        if len(word) >= 3:
            by_pattern[f"trigram:{word[:3]}"][word] += count

    rows: dict[str, list[tuple[str, int, float]]] = {}
    for pattern_key, words in by_pattern.items():
        total = float(sum(words.values()) or 1.0)
        rows[pattern_key] = [
            (w, c, float(c) / total) for w, c in words.most_common(OFFLINE_POLICY.top_patterns_per_key)
        ]
    return rows


def _char_ngrams(text: str, n: int) -> list[str]:
    if len(text) < n:
        return []
    return [text[i : i + n] for i in range(0, len(text) - n + 1)]

