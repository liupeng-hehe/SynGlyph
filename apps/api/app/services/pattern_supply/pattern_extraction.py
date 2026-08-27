from __future__ import annotations

from app.services.pattern_supply.contracts import RawCandidateDTO

_VOWELS = set("aeiou")


def extract_pattern_features(candidate: RawCandidateDTO) -> dict[str, float | str | list[str]]:
    w = candidate.normalized_word
    chars = [c for c in w if c.isalpha()]
    if not chars:
        return {}
    lower = "".join(chars)
    n = len(lower)
    bigrams = [lower[i : i + 2] for i in range(max(0, n - 1))]
    trigrams = [lower[i : i + 3] for i in range(max(0, n - 2))]
    doubles = sorted({lower[i : i + 2] for i in range(max(0, n - 1)) if lower[i] == lower[i + 1]})
    shape = "".join("V" if c in _VOWELS else "C" for c in lower)
    return {
        "length": float(n),
        "prefix_1": lower[:1],
        "prefix_2": lower[:2],
        "suffix_1": lower[-1:],
        "suffix_2": lower[-2:],
        "span_start": lower[:1],
        "span_end": lower[-1:],
        "bigrams": bigrams,
        "trigrams": trigrams,
        "double_letters": doubles,
        "position": "single" if n == 1 else "word",
        "vc_shape": shape,
        "family_key": f"{lower[:2]}_{lower[-2:]}_{n}",
    }

