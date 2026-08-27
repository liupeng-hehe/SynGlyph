"""Normalize rule-based and checkpoint inference into LabRenderDTO (frontend contract)."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models.lab_profile import LabProfile
from app.services.lab_manifest import ANCHOR_COUNT, COVERAGE_COUNT, parse_manifest
from app.utils.color import hex_to_lab, lab_to_hex

logger = logging.getLogger(__name__)

Provenance = dict[str, Any]


def _next_render_version(profile: LabProfile) -> str:
    profile.render_seq += 1
    return f"rv_{profile.render_seq:06d}"


def _tokens_from_labs(
    text: str,
    pred_lab: list[list[float]],
    pred_prominence: list[float] | None = None,
    pred_spread: list[float] | None = None,
    pred_boundary: list[float] | None = None,
) -> list[dict[str, Any]]:
    tokens: list[dict[str, Any]] = []
    L = len(text)
    for i, ch in enumerate(text):
        if i < len(pred_lab):
            Lv, a, b = pred_lab[i]
            fill = "#" + lab_to_hex(float(Lv), float(a), float(b))
        else:
            fill = "#6b7280"
        tok: dict[str, Any] = {"text": ch, "fill": fill}
        if pred_prominence and i < len(pred_prominence):
            tok["prominence"] = float(pred_prominence[i])
        if pred_spread and i < len(pred_spread):
            tok["spread"] = float(pred_spread[i])
        if pred_boundary is not None and i < len(pred_boundary):
            tok["boundary_after"] = float(pred_boundary[i])
        tokens.append(tok)
    return tokens


def render_from_rules(profile: LabProfile, text: str) -> tuple[dict[str, Any], Provenance]:
    letter_by_char = {r.char.lower(): r for r in profile.letters}
    pred_lab: list[list[float]] = []
    for ch in text.lower():
        if ch in letter_by_char and letter_by_char[ch].annotated:
            row = letter_by_char[ch]
            try:
                pred_lab.append([float(row.lab_l), float(row.lab_a), float(row.lab_b)])
            except (TypeError, ValueError):
                try:
                    pred_lab.append(list(hex_to_lab(row.color_hex)))
                except ValueError:
                    pred_lab.append([72.0, 8.0, -28.0])
        elif ch in "abcdefghijklmnopqrstuvwxyz":
            pred_lab.append([72.0, 8.0, -28.0])
        else:
            pred_lab.append([50.0, 0.0, -5.0])
    # pad/truncate to len(text)
    while len(pred_lab) < len(text):
        pred_lab.append([50.0, 0.0, -5.0])
    pred_lab = pred_lab[: len(text)]
    prom = [0.62] * len(text)
    spr = [0.38] * len(text)
    bnd = [0.48] * max(0, len(text) - 1)
    tokens = _tokens_from_labs(text, pred_lab, prom, spr, bnd)
    rv = _next_render_version(profile)
    payload = {
        "render_version": rv,
        "text": text,
        "tokens": tokens,
    }
    prov: Provenance = {"kind": "rule_fallback", "model_version": None, "run_id": None}
    return payload, prov


def render_from_checkpoint(
    profile: LabProfile,
    text: str,
    checkpoint_path: Path,
) -> tuple[dict[str, Any], Provenance]:
    from app.services.letter_sequence_predict import predict_word

    out = predict_word(checkpoint_path, text)
    pred_lab = out.get("pred_lab") or []
    pred_prom = out.get("pred_prominence") or []
    pred_spr = out.get("pred_spread") or []
    pred_bnd = out.get("pred_boundary") or []
    tokens = _tokens_from_labs(text, pred_lab, pred_prom, pred_spr, pred_bnd)
    rv = _next_render_version(profile)
    payload = {
        "render_version": rv,
        "text": text,
        "tokens": tokens,
    }
    prov: Provenance = {
        "kind": "checkpoint",
        "model_version": checkpoint_path.name,
        "checkpoint_path": str(checkpoint_path),
    }
    return payload, prov


def _trainer_checkpoint(db: Session) -> Path | None:
    """Resolve the active english/letter_sequence champion checkpoint (same as Workbench)."""
    try:
        from app.services.letter_sequence_checkpoint_resolve import resolve_active_champion_checkpoint_path

        return resolve_active_champion_checkpoint_path(db)
    except Exception:
        logger.debug("trainer checkpoint lookup failed", exc_info=True)
    return None


def _user_palette_from_profile(profile: LabProfile) -> dict[str, list[float]]:
    """Extract annotated letter Lab values as a user palette dict."""
    return {
        row.char.lower(): [float(row.lab_l), float(row.lab_a), float(row.lab_b)]
        for row in profile.letters
        if row.annotated
    }


def render_from_rebase(
    profile: LabProfile,
    text: str,
    trainer_cp: Path,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Render using the trainer model rebased onto the user's letter palette."""
    from app.services.letter_sequence_predict import predict_word

    user_palette = _user_palette_from_profile(profile)
    out = predict_word(
        trainer_cp,
        text,
        user_palette=user_palette if user_palette else None,
    )
    pred_lab = out.get("pred_lab") or []
    pred_prom = out.get("pred_prominence") or []
    pred_spr = out.get("pred_spread") or []
    pred_bnd = out.get("pred_boundary") or []
    tokens = _tokens_from_labs(text, pred_lab, pred_prom, pred_spr, pred_bnd)
    rv = _next_render_version(profile)
    payload = {"render_version": rv, "text": text, "tokens": tokens}
    prov = {
        "kind": "trainer_rebase",
        "palette_rebased": out.get("palette_rebased", False),
        "trainer_palette_available": out.get("trainer_palette_available", False),
        "letters_in_palette": len(user_palette),
    }
    return payload, prov


def build_render_dto(
    db: Session,
    profile: LabProfile,
    text: str,
) -> dict[str, Any]:
    """Priority: user checkpoint → trainer rebase → rule fallback."""
    raw = (text or "").strip() or "When words begin to glow."

    # 1. User's own fine-tuned checkpoint (deep track, post-training)
    cp = profile.active_checkpoint_uri
    if cp:
        p = Path(cp)
        if p.is_file():
            try:
                payload, prov = render_from_checkpoint(profile, raw, p)
                payload["provenance"] = prov
                db.flush()
                return payload
            except Exception:
                logger.warning("render_from_checkpoint failed, trying trainer rebase", exc_info=True)

    # 2. Trainer model rebased onto user's palette (available as soon as letters are anchored)
    trainer_cp = _trainer_checkpoint(db)
    if trainer_cp:
        try:
            payload, prov = render_from_rebase(profile, raw, trainer_cp)
            payload["provenance"] = prov
            db.flush()
            return payload
        except Exception:
            logger.warning("render_from_rebase failed, falling back to rules", exc_info=True)

    # 3. Rule-based flat letter colors
    payload, prov = render_from_rules(profile, raw)
    payload["provenance"] = prov
    db.flush()
    return payload


def readiness_label(profile: LabProfile) -> str:
    if profile.phase == "create" or profile.satisfaction_state == "ready":
        return "profile_formed"
    if profile.phase == "free_text":
        return "ready_to_test"
    if profile.phase == "checks":
        return "stabilizing"
    if profile.phase in ("coverage", "coverage_anchor", "coverage_assist"):
        return "expanding"
    return "anchoring"


def _anchor_assist_done(profile: LabProfile, m: Any) -> tuple[int, int, bool, bool]:
    cov_by = {w.word.lower(): w for w in profile.coverage_words}
    if m.is_v2():
        anchor_words = m.coverage_anchor_words
        assist_words = m.coverage_assist_words
    else:
        anchor_words = m.coverage_words[:ANCHOR_COUNT]
        assist_words = m.coverage_words[ANCHOR_COUNT:COVERAGE_COUNT]
    n_anchor = sum(1 for w in anchor_words if cov_by.get(w.lower()) and cov_by[w.lower()].completed)
    n_assist = sum(1 for w in assist_words if cov_by.get(w.lower()) and cov_by[w.lower()].completed)
    anchor_done = len(anchor_words) == 0 or n_anchor >= len(anchor_words)
    assist_done = len(assist_words) == 0 or n_assist >= len(assist_words)
    return n_anchor, n_assist, anchor_done, assist_done


def sync_profile_phase(db: Session, profile: LabProfile) -> None:
    """Advance phase from manifest progress (monotonic)."""
    from app.services.lab_validation_al import recommend_validation_checks

    m = parse_manifest(profile)
    letter_by = {x.char.lower(): x for x in profile.letters}
    cov_by = {w.word.lower(): w for w in profile.coverage_words}
    all_letters_done = all(letter_by.get(c, None) and letter_by[c].annotated for c in m.letters_order)
    n_cov = sum(1 for x in profile.coverage_words if x.completed)
    n_chk_done = sum(1 for x in profile.checks if x.status != "not_started")
    n_anchor, n_assist, anchor_done, assist_done = _anchor_assist_done(profile, m)

    if profile.phase in ("letters", "init"):
        if all_letters_done:
            if getattr(profile, "track", "deep") == "lite":
                profile.phase = "free_text"
            elif m.is_v2():
                profile.phase = "coverage_anchor"
            else:
                profile.phase = "coverage"

    if profile.phase == "coverage_anchor":
        if anchor_done and m.coverage_assist_words:
            profile.phase = "coverage_assist"
        elif anchor_done and not m.coverage_assist_words:
            profile.phase = "checks"

    if profile.phase == "coverage_assist":
        if assist_done or (m.is_v2() and n_cov >= len(m.coverage_words)):
            if m.is_v2() and not m.checks:
                recommend_validation_checks(db, profile)
                m = parse_manifest(profile)
            profile.phase = "checks"

    if profile.phase == "coverage":
        pos_anchor = m.coverage_words[:ANCHOR_COUNT]
        n_pos_anchor = sum(
            1 for w in pos_anchor if cov_by.get(w.lower()) and cov_by[w.lower()].completed
        )
        if (
            not m.is_v2()
            and n_pos_anchor >= min(ANCHOR_COUNT, len(pos_anchor))
            and n_cov < len(m.coverage_words)
        ):
            profile.phase = "coverage_assist"
        elif n_cov >= len(m.coverage_words):
            if m.is_v2() and not m.checks:
                recommend_validation_checks(db, profile)
            profile.phase = "checks"

    if profile.phase == "checks":
        if m.checks and n_chk_done >= len(m.checks):
            profile.phase = "free_text"
        elif not m.checks and n_chk_done >= 10:
            profile.phase = "free_text"
    db.flush()
