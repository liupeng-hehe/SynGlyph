"""Compose word colors from user n-gram lexicon; identify gaps for model fill."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.services.lab_ngram_lexicon import (
    _lookup_lexicon_entry,
    filtered_alpha_letters,
    greedy_lexicon_spans,
    load_lexicon,
)
from app.models.lab_profile import LabProfile

# Coverage anchor words default canvas to bottom-left (P=0, S=0); use same for
# assist gaps until BiLSTM fills them with per-letter predictions.
_GAP_PROMINENCE = 0.0
_GAP_SPREAD = 0.0


@dataclass
class ComposeResult:
    pred_lab: list[list[float]] = field(default_factory=list)
    pred_prominence: list[float] = field(default_factory=list)
    pred_spread: list[float] = field(default_factory=list)
    pred_boundary: list[float] = field(default_factory=list)
    gap_indices: list[int] = field(default_factory=list)
    ngram_hits: list[str] = field(default_factory=list)
    model_gaps: list[int] = field(default_factory=list)

    def to_provenance(self) -> dict[str, Any]:
        return {
            "kind": "ngram_compose",
            "ngram_hits": self.ngram_hits,
            "model_gaps": self.model_gaps,
            "gap_indices": self.gap_indices,
        }


def _letter_palette(profile: LabProfile) -> dict[str, list[float]]:
    return {
        row.char.lower(): [float(row.lab_l), float(row.lab_a), float(row.lab_b)]
        for row in profile.letters
        if row.annotated
    }


def _apply_span_entry(
    *,
    ent: dict[str, Any],
    start: int,
    end: int,
    lab: list[list[float] | None],
    prom: list[float | None],
    spr: list[float | None],
    filled: list[bool],
    default_prom: float,
    default_spread: float,
) -> None:
    ent_labs = ent.get("lab") or []
    ent_prom = ent.get("prom") or ent.get("prominence")
    ent_spr = ent.get("spread") or ent.get("spr")
    span_len = end - start
    if not isinstance(ent_labs, list) or len(ent_labs) < span_len:
        return
    for j, ai in enumerate(range(start, end)):
        if j < len(ent_labs):
            lab[ai] = [float(x) for x in ent_labs[j][:3]]
        if isinstance(ent_prom, list) and j < len(ent_prom):
            prom[ai] = float(ent_prom[j])
        elif ent_prom is not None and not isinstance(ent_prom, list):
            prom[ai] = float(ent_prom)
        if isinstance(ent_spr, list) and j < len(ent_spr):
            spr[ai] = float(ent_spr[j])
        elif ent_spr is not None and not isinstance(ent_spr, list):
            spr[ai] = float(ent_spr)
        filled[ai] = True


def compose_word_from_lexicon(
    profile: LabProfile,
    word: str,
    *,
    lexicon_overlay: dict[str, Any] | None = None,
    default_prom: float = _GAP_PROMINENCE,
    default_spread: float = _GAP_SPREAD,
    default_boundary: float = 0.48,
) -> ComposeResult:
    letters = filtered_alpha_letters(word)
    L = len(letters)
    if L == 0:
        return ComposeResult()

    lexicon = load_lexicon(profile)
    if lexicon_overlay:
        lexicon = {**lexicon, **lexicon_overlay}
    palette = _letter_palette(profile)
    lab: list[list[float] | None] = [None] * L
    prom: list[float | None] = [None] * L
    spr: list[float | None] = [None] * L
    filled = [False] * L
    ngram_hits: list[str] = []

    for span in greedy_lexicon_spans(letters, lexicon):
        pk = str(span["pattern_key"])
        ent = span.get("entry") or _lookup_lexicon_entry(lexicon, pk)
        if not ent:
            continue
        start = int(span["start"])
        end = int(span["end"])
        _apply_span_entry(
            ent=ent,
            start=start,
            end=end,
            lab=lab,
            prom=prom,
            spr=spr,
            filled=filled,
            default_prom=default_prom,
            default_spread=default_spread,
        )
        ngram_hits.append(pk)

    model_gaps = [i for i in range(L) if not filled[i]]
    boundary = [default_boundary] * max(0, L - 1)
    for span in greedy_lexicon_spans(letters, lexicon):
        ent = span.get("entry") or _lookup_lexicon_entry(lexicon, str(span["pattern_key"]))
        if not ent:
            continue
        ent_b = ent.get("boundary") or []
        start = int(span["start"])
        end = int(span["end"])
        for k in range(start, end - 1):
            j = k - start
            if j < len(ent_b):
                try:
                    boundary[k] = max(0.0, min(1.0, float(ent_b[j])))
                except (TypeError, ValueError):
                    pass

    out_lab: list[list[float]] = []
    out_prom: list[float] = []
    out_spr: list[float] = []
    for i in range(L):
        if filled[i] and lab[i] is not None:
            out_lab.append(lab[i])  # type: ignore[arg-type]
            out_prom.append(float(prom[i] if prom[i] is not None else default_prom))
            out_spr.append(float(spr[i] if spr[i] is not None else default_spread))
        else:
            out_lab.append(palette.get(letters[i], [72.0, 8.0, -28.0]))
            out_prom.append(default_prom)
            out_spr.append(default_spread)

    return ComposeResult(
        pred_lab=out_lab,
        pred_prominence=out_prom,
        pred_spread=out_spr,
        pred_boundary=boundary,
        gap_indices=model_gaps,
        ngram_hits=ngram_hits,
        model_gaps=model_gaps,
    )


def merge_compose_with_model(
    compose: ComposeResult,
    model_out: dict[str, Any],
) -> ComposeResult:
    """Fill remaining gap indices from BiLSTM prediction."""
    letters_len = len(compose.pred_lab)
    if letters_len == 0:
        return compose
    m_lab = model_out.get("pred_lab") or []
    m_prom = model_out.get("pred_prominence") or []
    m_spr = model_out.get("pred_spread") or []
    m_bnd = model_out.get("pred_boundary") or []

    lab = [list(x) for x in compose.pred_lab]
    prom = list(compose.pred_prominence)
    spr = list(compose.pred_spread)
    bnd = list(compose.pred_boundary)

    for i in compose.model_gaps:
        if i < len(m_lab):
            lab[i] = [float(x) for x in m_lab[i][:3]]
        if i < len(m_prom):
            prom[i] = float(m_prom[i])
        if i < len(m_spr):
            spr[i] = float(m_spr[i])

    for i in range(max(0, letters_len - 1)):
        if i in compose.model_gaps or (i + 1) in compose.model_gaps:
            if i < len(m_bnd):
                bnd[i] = float(m_bnd[i])

    return ComposeResult(
        pred_lab=lab,
        pred_prominence=prom,
        pred_spread=spr,
        pred_boundary=bnd,
        gap_indices=compose.gap_indices,
        ngram_hits=compose.ngram_hits,
        model_gaps=compose.model_gaps,
    )
