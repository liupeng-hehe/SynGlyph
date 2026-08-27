"""Build sequence samples from raw annotation export (V1: single-letter spans, [a-zA-Z] only)."""

from __future__ import annotations

import re
from typing import Any

SCHEMA_VERSION = 2
SCHEMA_VERSION_3 = 3

_SINGLE_LETTER = re.compile(r"^[a-zA-Z]$")


def is_single_letter_char(ch: str) -> bool:
    return bool(_SINGLE_LETTER.match(ch))


def parse_raw_input_parts(raw_input: str) -> list[str] | None:
    if not raw_input or "|" not in raw_input and raw_input.strip() == "":
        return None
    parts = raw_input.split("|")
    return parts


def validate_v1_single_letter_segmentation(
    raw_input: str | None,
    spans: list[dict[str, Any]] | None,
    boundary_influence: list[float] | None,
) -> tuple[bool, str]:
    """Return (ok, reason)."""
    if not raw_input:
        return False, "missing raw_input"
    parts = parse_raw_input_parts(raw_input)
    if parts is None:
        return False, "empty raw_input"
    for p in parts:
        if len(p) != 1:
            return False, f"multi-char segment: {p!r}"
        if not is_single_letter_char(p):
            return False, f"non-letter segment: {p!r}"
    if not spans or len(spans) != len(parts):
        return False, "span count mismatch"
    ordered = sorted(spans, key=lambda s: s.get("span_order", 0))
    for i, sp in enumerate(ordered):
        st = sp.get("span_text", "")
        if len(st) != 1 or st != parts[i]:
            return False, f"span_text mismatch at {i}"
        if not is_single_letter_char(st):
            return False, "span not single letter"
        lab = sp.get("color_lab")
        if not isinstance(lab, (list, tuple)) or len(lab) != 3:
            return False, "bad color_lab"
        for x in ("prominence", "spread"):
            if x not in sp:
                return False, f"missing {x}"
    L = len(parts)
    if L > 1:
        if boundary_influence is None:
            return False, "missing boundary_influence"
        if len(boundary_influence) != L - 1:
            return False, f"boundary len {len(boundary_influence)} != {L - 1}"
    else:
        if boundary_influence is not None and len(boundary_influence) > 0:
            return False, "single letter should have empty boundary"
    return True, ""


def annotation_record_to_sample(
    annotation_id: str,
    stimulus_id: str,
    word_text: str,
    record: dict[str, Any],
) -> dict[str, Any] | None:
    """
    record: { raw_input, spans, boundary_influence } from API raw-export style.
    """
    raw_input = record.get("raw_input")
    spans = record.get("spans") or []
    boundary = record.get("boundary_influence")
    ok, _ = validate_v1_single_letter_segmentation(raw_input, spans, boundary)
    if not ok:
        return None
    parts = parse_raw_input_parts(raw_input)  # type: ignore
    assert parts is not None
    ordered = sorted(spans, key=lambda s: s.get("span_order", 0))
    letters = [p.lower() for p in parts]
    target_lab = [[float(x) for x in sp["color_lab"]] for sp in ordered]
    target_prominence = [float(sp["prominence"]) for sp in ordered]
    target_spread = [float(sp["spread"]) for sp in ordered]
    L = len(letters)
    if L == 1:
        target_boundary: list[float] = []
    else:
        target_boundary = [float(x) for x in boundary]  # type: ignore
    return {
        "schema_version": SCHEMA_VERSION,
        "annotation_id": annotation_id,
        "stimulus_id": stimulus_id,
        "word_text": word_text,
        "letters": letters,
        "raw_input": raw_input,
        "target_lab": target_lab,
        "target_prominence": target_prominence,
        "target_spread": target_spread,
        "target_boundary": target_boundary,
    }


def _aux_word_lab_dominant(
    target_lab: list[list[float]], target_prominence: list[float]
) -> tuple[int | None, list[float] | None]:
    if not target_prominence:
        return None, None
    dom = int(max(range(len(target_prominence)), key=lambda i: target_prominence[i]))
    s = float(sum(target_prominence)) or 1.0
    wlab = [0.0, 0.0, 0.0]
    for t in range(len(target_lab)):
        p = target_prominence[t] / s
        for c in range(3):
            wlab[c] += p * float(target_lab[t][c])
    return dom, wlab


def annotation_record_to_sample_v3(
    annotation_id: str,
    stimulus_id: str,
    word_text: str,
    record: dict[str, Any],
) -> dict[str, Any] | None:
    """
    Like v2, plus precomputed phonology (for training with syllable-aware features).
    """
    from letter_sequence.phonology import enrich_word

    base = annotation_record_to_sample(annotation_id, stimulus_id, word_text, record)
    if base is None:
        return None
    out = dict(base)
    out["schema_version"] = SCHEMA_VERSION_3
    wtxt = (word_text or out.get("word_text") or "").strip() or "".join(out["letters"])
    pr = enrich_word(wtxt)
    out["preprocessing_version"] = pr.preprocessing_version
    out["extra_features"] = pr.feature_matrix.tolist()
    out["phon_mask"] = pr.phon_mask.tolist()
    out["syllable_count"] = pr.syllable_count
    out["stress_pattern"] = pr.stress_pattern
    out["pronunciation_source"] = pr.pronunciation_source
    out["parse_confidence"] = pr.pronunciation_confidence
    dom, wlab = _aux_word_lab_dominant(
        [list(map(float, x)) for x in out["target_lab"]],
        [float(x) for x in out["target_prominence"]],
    )
    if dom is not None and wlab is not None:
        out["target_dominant_letter_idx"] = dom
        out["target_word_lab"] = wlab
    return out
