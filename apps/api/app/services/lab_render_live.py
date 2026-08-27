"""Live preview rendering: letter overrides + unsaved coverage draft."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models.lab_profile import LabProfile
from app.services.lab_ngram_compose import compose_word_from_lexicon, merge_compose_with_model
from app.services.lab_ngram_lexicon import (
    filtered_alpha_letters,
    load_lexicon,
    merge_coverage_into_lexicon,
)
from app.services.lab_render import (
    _next_render_version,
    _tokens_from_labs,
    _trainer_checkpoint,
    _user_palette_from_profile,
    build_render_dto,
    render_from_rules,
)
from app.services.lab_validation_al import micro_train_checkpoint_path
from app.utils.color import hex_to_lab

logger = logging.getLogger(__name__)


def _resolve_predict_checkpoint(db: Session, profile: LabProfile) -> tuple[Path | None, str | None]:
    champion = _trainer_checkpoint(db)
    if champion is not None:
        return champion, "champion"
    micro = micro_train_checkpoint_path(profile.id)
    if micro.is_file():
        return micro, "micro"
    return None, None


def _apply_letter_overrides(
    palette: dict[str, list[float]],
    letter_overrides: dict[str, Any] | None,
) -> dict[str, list[float]]:
    if not letter_overrides:
        return palette
    out = dict(palette)
    for ch, ov in letter_overrides.items():
        low = str(ch).lower()[:1]
        if not low.isalpha() or not isinstance(ov, dict):
            continue
        if ov.get("lab_l") is not None and ov.get("lab_a") is not None and ov.get("lab_b") is not None:
            out[low] = [float(ov["lab_l"]), float(ov["lab_a"]), float(ov["lab_b"])]
        elif ov.get("color"):
            try:
                hx = str(ov["color"])
                if not hx.startswith("#"):
                    hx = f"#{hx}"
                out[low] = list(hex_to_lab(hx))
            except (TypeError, ValueError):
                pass
    return out


def _letter_pxs_from_profile(
    profile: LabProfile,
    letter_overrides: dict[str, Any] | None,
) -> dict[str, tuple[float, float]]:
    px: dict[str, tuple[float, float]] = {}
    for row in profile.letters:
        if not row.annotated:
            continue
        low = row.char.lower()
        ov = (letter_overrides or {}).get(low) if letter_overrides else None
        if isinstance(ov, dict):
            prom = ov.get("prominence")
            spr = ov.get("spread")
            px[low] = (
                float(prom if prom is not None else row.prominence),
                float(spr if spr is not None else row.spread),
            )
        else:
            px[low] = (float(row.prominence), float(row.spread))
    return px


def _manual_to_word_prediction(
    word: str,
    manual: dict[str, Any] | None,
) -> tuple[list[list[float]], list[float], list[float], list[float]]:
    letters = filtered_alpha_letters(word)
    L = len(letters)
    if L == 0:
        return [], [], [], []
    by_index: dict[int, dict[str, Any]] = {}
    if manual:
        for ent in manual.get("letters") or []:
            if isinstance(ent, dict) and isinstance(ent.get("index"), int):
                by_index[int(ent["index"])] = ent
    alpha_to_word_idx: list[int] = []
    for i, c in enumerate(word):
        if c.lower().isalpha():
            alpha_to_word_idx.append(i)

    labs: list[list[float]] = []
    prom: list[float] = []
    spr: list[float] = []
    for ai in range(L):
        wi = alpha_to_word_idx[ai] if ai < len(alpha_to_word_idx) else ai
        ent = by_index.get(wi)
        if ent and ent.get("color"):
            hx = str(ent["color"])
            if not hx.startswith("#"):
                hx = f"#{hx}"
            try:
                labs.append(list(hex_to_lab(hx)))
            except ValueError:
                labs.append([72.0, 8.0, -28.0])
        else:
            labs.append([72.0, 8.0, -28.0])
        try:
            prom.append(float(ent.get("prominence")) if ent and ent.get("prominence") is not None else 0.0)
        except (TypeError, ValueError):
            prom.append(0.0)
        try:
            spr.append(float(ent.get("spread")) if ent and ent.get("spread") is not None else 0.0)
        except (TypeError, ValueError):
            spr.append(0.0)

    bi_raw = (manual or {}).get("boundary_influence")
    boundary = [0.48] * max(0, L - 1)
    if isinstance(bi_raw, list):
        for k in range(L - 1):
            if k < len(alpha_to_word_idx) - 1:
                wi = alpha_to_word_idx[k]
                if wi < len(bi_raw):
                    try:
                        boundary[k] = max(0.0, min(1.0, float(bi_raw[wi])))
                    except (TypeError, ValueError):
                        pass
    return labs, prom, spr, boundary


def _predict_word_live(
    db: Session,
    profile: LabProfile,
    word: str,
    *,
    lexicon_overlay: dict[str, Any] | None,
    user_palette: dict[str, list[float]],
    draft_word: str | None,
    draft_manual: dict[str, Any] | None,
) -> tuple[list[list[float]], list[float], list[float], list[float]]:
    wl = word.lower()
    if draft_word and wl == draft_word.lower() and draft_manual:
        return _manual_to_word_prediction(word, draft_manual)

    compose = compose_word_from_lexicon(profile, word, lexicon_overlay=lexicon_overlay)
    trainer_cp, _kind = _resolve_predict_checkpoint(db, profile)
    if trainer_cp and compose.model_gaps:
        try:
            from app.services.letter_sequence_predict import predict_word as _predict_word

            model_out = _predict_word(trainer_cp, word, user_palette=user_palette or None)
            merged = merge_compose_with_model(compose, model_out)
            return merged.pred_lab, merged.pred_prominence, merged.pred_spread, merged.pred_boundary
        except Exception:
            logger.warning("live preview model gap fill failed", exc_info=True)
    return compose.pred_lab, compose.pred_prominence, compose.pred_spread, compose.pred_boundary


def build_render_dto_live(
    db: Session,
    profile: LabProfile,
    text: str,
    *,
    letter_overrides: dict[str, Any] | None = None,
    coverage_live_draft: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Render passage with unsaved letter tweaks and/or an in-progress coverage word draft."""
    if not letter_overrides and not coverage_live_draft:
        return build_render_dto(db, profile, text)

    raw = (text or "").strip() or "When words begin to glow."
    draft_word: str | None = None
    draft_manual: dict[str, Any] | None = None
    lexicon_overlay: dict[str, Any] | None = None

    if coverage_live_draft:
        draft_word = str(coverage_live_draft.get("word") or "").strip() or None
        draft_manual = coverage_live_draft.get("manual_adjustments")
        if draft_word and isinstance(draft_manual, dict):
            lexicon_overlay = merge_coverage_into_lexicon(
                load_lexicon(profile),
                profile,
                word=draft_word,
                manual_adjustments=draft_manual,
                accepted_prediction=False,
            )

    user_palette = _apply_letter_overrides(_user_palette_from_profile(profile), letter_overrides)
    letter_pxs = _letter_pxs_from_profile(profile, letter_overrides)

    tokens: list[dict[str, Any]] = []
    pos = 0
    while pos < len(raw):
        if raw[pos].isspace():
            tokens.append({"text": raw[pos], "fill": "#6b7280", "prominence": 0.0, "spread": 0.0})
            pos += 1
            continue
        end = pos
        while end < len(raw) and not raw[end].isspace():
            end += 1
        word = raw[pos:end]
        pred_lab, pred_prom, pred_spr, pred_bnd = _predict_word_live(
            db,
            profile,
            word,
            lexicon_overlay=lexicon_overlay,
            user_palette=user_palette,
            draft_word=draft_word,
            draft_manual=draft_manual,
        )
        if not pred_lab:
            for ch in word:
                if ch.lower() in user_palette:
                    lab = user_palette[ch.lower()]
                    px = letter_pxs.get(ch.lower(), (0.62, 0.38))
                    tokens.extend(_tokens_from_labs(ch, [lab], [px[0]], [px[1]], [0.48]))
                else:
                    tokens.append({"text": ch, "fill": "#6b7280", "prominence": 0.0, "spread": 0.0})
        else:
            tokens.extend(_tokens_from_labs(word, pred_lab, pred_prom, pred_spr, pred_bnd))
        pos = end

    if not tokens:
        payload, prov = render_from_rules(profile, raw)
        payload["provenance"] = {**prov, "kind": "live_fallback"}
        return payload

    rv = _next_render_version(profile)
    db.flush()
    return {
        "render_version": rv,
        "text": raw,
        "tokens": tokens,
        "provenance": {
            "kind": "live",
            "draft_word": draft_word,
            "letter_overrides": sorted((letter_overrides or {}).keys()),
        },
    }
