"""User n-gram pattern lexicon for BYO lab (KB segmentation + color templates)."""

from __future__ import annotations

import json
from typing import Any

from app.models.lab_profile import LabProfile
from app.services.kb_analytics.text_units import candidate_pattern_keys

try:
    from app.config.kb_analytics import kb_ngram_max
    from app.services.kb_analytics.segmenter import SegmenterConfig, segment_word
except ImportError:
    kb_ngram_max = lambda: 4  # type: ignore[misc,assignment]
    segment_word = None  # type: ignore[misc,assignment]
    SegmenterConfig = None  # type: ignore[misc,assignment]

_ALPHA = set("abcdefghijklmnopqrstuvwxyz")


def alpha_indices(word: str) -> list[int]:
    """Indices in ``word`` where character is a-z."""
    return [i for i, c in enumerate(word.lower()) if c in _ALPHA]


def filtered_alpha_letters(word: str) -> list[str]:
    return [word[i].lower() for i in alpha_indices(word)]


def word_spans_for_lexicon(word: str) -> list[dict[str, Any]]:
    """
    Non-overlapping KB spans on alpha-only stream.

    Returns dicts: start, end (exclusive, alpha index), gram, pattern_key.
    """
    letters = filtered_alpha_letters(word)
    L = len(letters)
    if L == 0:
        return []
    text_for_seg = "".join(letters)
    if segment_word is None or SegmenterConfig is None:
        return _fallback_spans(letters)
    cfg = SegmenterConfig(ngram_min=2, ngram_max=kb_ngram_max())
    segs = segment_word(text_for_seg, cfg)
    spans: list[dict[str, Any]] = []
    pos = 0
    for seg in segs:
        n = len(seg)
        pk = f"char:{seg}" if n == 1 else f"ng{n}:{seg}"
        spans.append({"start": pos, "end": pos + n, "gram": seg, "pattern_key": pk})
        pos += n
    return spans


def _fallback_spans(letters: list[str]) -> list[dict[str, Any]]:
    """Bigram-first greedy fallback when segmenter unavailable."""
    L = len(letters)
    covered = [False] * L
    spans: list[dict[str, Any]] = []
    for n in (2, 1):
        for i in range(L - n + 1):
            if any(covered[i : i + n]):
                continue
            gram = "".join(letters[i : i + n])
            pk = f"char:{gram}" if n == 1 else f"ng{n}:{gram}"
            spans.append({"start": i, "end": i + n, "gram": gram, "pattern_key": pk})
            for j in range(n):
                covered[i + j] = True
    spans.sort(key=lambda s: s["start"])
    return spans


def load_lexicon(profile: LabProfile) -> dict[str, Any]:
    raw = getattr(profile, "user_pattern_lexicon_json", None) or "{}"
    try:
        obj = json.loads(raw)
        return obj if isinstance(obj, dict) else {}
    except json.JSONDecodeError:
        return {}


def save_lexicon(profile: LabProfile, lexicon: dict[str, Any]) -> None:
    profile.user_pattern_lexicon_json = json.dumps(lexicon, ensure_ascii=False)


def _lookup_lexicon_entry(lexicon: dict[str, Any], pattern_key: str) -> dict[str, Any] | None:
    for key in candidate_pattern_keys(pattern_key):
        ent = lexicon.get(key)
        if isinstance(ent, dict) and ent.get("lab"):
            return ent
    return None


def _pattern_key_for_gram(gram: str) -> str:
    n = len(gram)
    if n <= 0:
        return ""
    if n == 1:
        return f"char:{gram}"
    return f"ng{n}:{gram}"


def greedy_lexicon_spans(letters: list[str], lexicon: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Longest-match scan over the alpha stream using the user's pattern lexicon.

    Unlike KB morpheme segmentation (``word_spans_for_lexicon``), this finds any
    annotated n-gram substring the user has already saved — e.g. ``ng2:er`` inside
    ``anniversary``.
    """
    L = len(letters)
    if L == 0 or not lexicon:
        return []
    try:
        from app.config.kb_analytics import kb_ngram_max

        max_n = kb_ngram_max()
    except ImportError:
        max_n = 4
    max_n = max(1, min(5, int(max_n)))

    covered = [False] * L
    spans: list[dict[str, Any]] = []
    for n in range(max_n, 0, -1):
        for i in range(L - n + 1):
            if any(covered[i : i + n]):
                continue
            gram = "".join(letters[i : i + n])
            pk = _pattern_key_for_gram(gram)
            ent = _lookup_lexicon_entry(lexicon, pk)
            if not ent:
                continue
            spans.append({"start": i, "end": i + n, "gram": gram, "pattern_key": pk, "entry": ent})
            for j in range(n):
                covered[i + j] = True
    spans.sort(key=lambda s: int(s["start"]))
    return spans


def pattern_keys_for_word(word: str) -> list[str]:
    return [s["pattern_key"] for s in word_spans_for_lexicon(word)]


def _extract_span_values(
    manual: dict[str, Any] | None,
    *,
    word: str,
    span: dict[str, Any],
    letter_palette: dict[str, list[float]],
    default_prom: float = 0.62,
    default_spread: float = 0.38,
) -> dict[str, Any] | None:
    """Build lexicon entry fields from manual_adjustments for one span."""
    start = int(span["start"])
    end = int(span["end"])
    letters = filtered_alpha_letters(word)
    if end > len(letters):
        return None

    entries_by_index: dict[int, dict[str, Any]] = {}
    if manual:
        for ent in manual.get("letters") or []:
            if isinstance(ent, dict) and isinstance(ent.get("index"), int):
                entries_by_index[int(ent["index"])] = ent

    labs: list[list[float]] = []
    prom: list[float] = []
    spr: list[float] = []
    for ai in range(start, end):
        ch = letters[ai]
        ent = entries_by_index.get(ai)
        if ent and ent.get("lab"):
            try:
                labs.append([float(x) for x in ent["lab"][:3]])
            except (TypeError, ValueError):
                labs.append(letter_palette.get(ch, [72.0, 8.0, -28.0]))
        elif ent and ent.get("color"):
            from app.utils.color import hex_to_lab

            hx = str(ent["color"])
            if not hx.startswith("#"):
                hx = f"#{hx}"
            try:
                labs.append(list(hex_to_lab(hx)))
            except ValueError:
                labs.append(letter_palette.get(ch, [72.0, 8.0, -28.0]))
        elif ch in letter_palette:
            labs.append(list(letter_palette[ch]))
        else:
            return None
        try:
            prom.append(float(ent.get("prominence")) if ent and ent.get("prominence") is not None else default_prom)
        except (TypeError, ValueError):
            prom.append(default_prom)
        try:
            spr.append(float(ent.get("spread")) if ent and ent.get("spread") is not None else default_spread)
        except (TypeError, ValueError):
            spr.append(default_spread)

    boundary: list[float] = []
    bi_raw = (manual or {}).get("boundary_influence")
    if isinstance(bi_raw, list):
        alpha_to_word_idx = alpha_indices(word)
        for k in range(start, end - 1):
            ai = k
            if ai < len(alpha_to_word_idx) - 1:
                wi = alpha_to_word_idx[ai]
                if wi < len(bi_raw):
                    try:
                        boundary.append(max(0.0, min(1.0, float(bi_raw[wi]))))
                        continue
                    except (TypeError, ValueError):
                        pass
            boundary.append(0.48)
    else:
        boundary = [0.48] * max(0, end - start - 1)

    return {
        "lab": labs,
        "prom": prom,
        "spread": spr,
        "boundary": boundary,
        "revision_count": 1,
        "source_words": [word.lower()],
    }


def merge_coverage_into_lexicon(
    lexicon: dict[str, Any],
    profile: LabProfile,
    *,
    word: str,
    manual_adjustments: dict[str, Any] | None,
    accepted_prediction: bool,
) -> dict[str, Any]:
    """Return lexicon copy with span templates from one coverage word merged in."""
    letter_palette = {
        row.char.lower(): [float(row.lab_l), float(row.lab_a), float(row.lab_b)]
        for row in profile.letters
        if row.annotated
    }
    merged = dict(lexicon)
    for span in word_spans_for_lexicon(word):
        pk = str(span["pattern_key"])
        if accepted_prediction:
            existing = _lookup_lexicon_entry(merged, pk)
            if existing and int(existing.get("revision_count") or 0) > 0:
                continue
        entry = _extract_span_values(
            manual_adjustments,
            word=word,
            span=span,
            letter_palette=letter_palette,
        )
        if not entry:
            continue
        for alias in candidate_pattern_keys(pk):
            prev = merged.get(alias)
            if isinstance(prev, dict):
                sw = list(prev.get("source_words") or [])
                if word.lower() not in sw:
                    sw.append(word.lower())
                entry["source_words"] = sw[:8]
                entry["revision_count"] = int(prev.get("revision_count") or 0) + (
                    0 if accepted_prediction else 1
                )
            elif not accepted_prediction:
                entry["revision_count"] = 1
            elif accepted_prediction:
                entry["revision_count"] = 0
            merged[alias] = entry
    return merged


def update_lexicon_from_coverage_save(
    profile: LabProfile,
    *,
    word: str,
    manual_adjustments: dict[str, Any] | None,
    accepted_prediction: bool,
) -> list[str]:
    """
    Merge span templates into profile lexicon.

    Returns KB pattern keys touched on this word.
    """
    lexicon = load_lexicon(profile)
    touched = [str(s["pattern_key"]) for s in word_spans_for_lexicon(word)]
    merged = merge_coverage_into_lexicon(
        lexicon,
        profile,
        word=word,
        manual_adjustments=manual_adjustments,
        accepted_prediction=accepted_prediction,
    )
    save_lexicon(profile, merged)
    return touched[:12]
