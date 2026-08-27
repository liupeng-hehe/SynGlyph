"""Build Your Own — /api/lab/* (profile, annotations, preview, training)."""

from __future__ import annotations

import json
import logging
import random
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db, settings
from app.models import KbVocabVersion
from app.models.lab_profile import (
    LabCoverageWord,
    LabEvaluationCheck,
    LabLetterAnnotation,
    LabProfile,
    LabTrainingRun,
)
from app.services.kb_analytics.rebuild import get_active_vocab_version_id
from app.services.kb_top_pattern_words import top_words_by_pattern_count_data
from app.services.lab_manifest import (
    ANCHOR_COUNT,
    build_manifest,
    build_manifest_v2,
    checks_for_coverage_words,
    merge_kb_coverage_v2,
    parse_manifest,
)
from app.services.lab_client_identity import (
    client_ip_from_request,
    lab_participant_key,
    normalize_lab_display_name,
)
from app.services.lab_participant import allocate_unique_slug, clamp_lab
from app.services.lab_render import build_render_dto, readiness_label, sync_profile_phase
from app.services.lab_train_worker import read_holdout_report, read_kfold_report, start_lab_training
from app.utils.color import hex_to_lab, lab_to_hex

router = APIRouter(prefix="/api/lab", tags=["lab"])

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ProfileInitBody(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=128)
    mode: str = Field(default="local_training_first", max_length=64)
    seed: int | None = None
    track: str = Field(default="deep", max_length=16)  # "lite" | "deep"
    #: When true, unlink this device from any existing profile and create a blank one.
    force_new: bool = False


class PredictWordBody(BaseModel):
    profile_id: str
    word: str = Field(..., min_length=1, max_length=64)
    mode: Literal["default", "ngram_compose"] = "default"


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


class LetterPutBody(BaseModel):
    profile_id: str
    color: str | None = Field(default=None, max_length=16)
    lab_l: float | None = None
    lab_a: float | None = None
    lab_b: float | None = None
    #: Model-space [0,1], English SegmentInput.prominence
    prominence: float | None = Field(default=None, ge=0, le=1)
    #: Model-space [0,1], English SegmentInput.spread
    spread: float | None = Field(default=None, ge=0, le=1)
    locked: bool = False
    source: str = Field(default="manual", max_length=64)


class LetterPxSPatchBody(BaseModel):
    profile_id: str
    prominence: float = Field(ge=0, le=1)
    spread: float = Field(ge=0, le=1)


class CoveragePutBody(BaseModel):
    profile_id: str
    accepted_prediction: bool = False
    manual_adjustments: dict[str, Any] | None = None


class CheckPutBody(BaseModel):
    profile_id: str
    feedback_label: Literal["looks_right", "almost_right", "needs_fixing"]
    feedback_text: str | None = None


class PreviewBody(BaseModel):
    profile_id: str
    mode: str = Field(default="default_sentence", max_length=32)
    comparison_mode: str = Field(default="now", max_length=16)
    text: str = Field(default="When words begin to glow.", max_length=8000)
    letter_overrides: dict[str, dict[str, Any]] | None = None
    coverage_live_draft: dict[str, Any] | None = None


class TrainBody(BaseModel):
    profile_id: str
    triggered_by: str = Field(default="manual", max_length=64)


class TrainDecisionBody(BaseModel):
    profile_id: str


class CompleteBody(BaseModel):
    profile_id: str
    satisfaction: Literal["ready", "needs_work"]


def _letter_map(profile: LabProfile) -> dict[str, LabLetterAnnotation]:
    return {x.char.lower(): x for x in profile.letters}


def _stability(revisions: int) -> float:
    return max(0.0, min(1.0, 0.45 + 0.11 * min(revisions, 5)))


def _progress_payload(profile: LabProfile, m: Any) -> dict[str, Any]:
    letter_by = _letter_map(profile)
    n_letters = sum(1 for c in m.letters_order if letter_by.get(c) and letter_by[c].annotated)
    n_cov = sum(1 for x in profile.coverage_words if x.completed)
    n_chk = sum(1 for x in profile.checks if x.status != "not_started")
    cov_by = {w.word.lower(): w for w in profile.coverage_words}
    n_anchor = sum(
        1 for w in (m.coverage_anchor_words or [])
        if cov_by.get(w.lower()) and cov_by[w.lower()].completed
    )
    n_assist = sum(
        1 for w in (m.coverage_assist_words or [])
        if cov_by.get(w.lower()) and cov_by[w.lower()].completed
    )
    total_w = 26 + 30 + 10
    overall = (n_letters + n_cov + n_chk) / max(1, total_w)
    out = {
        "letters_anchored_count": n_letters,
        "coverage_completed_count": n_cov,
        "checks_completed_count": n_chk,
        "overall_progress": round(overall, 4),
        "readiness_label": readiness_label(profile),
    }
    if m.is_v2():
        out["anchor_completed_count"] = n_anchor
        out["assist_completed_count"] = n_assist
        out["anchor_total"] = len(m.coverage_anchor_words)
        out["assist_total"] = len(m.coverage_assist_words)
    return out


def _coverage_word_list_for_phase(profile: LabProfile, m: Any) -> list[str]:
    if profile.phase == "coverage_anchor" and m.coverage_anchor_words:
        return m.coverage_anchor_words
    if profile.phase == "coverage_assist" and m.coverage_assist_words:
        return m.coverage_assist_words
    if profile.phase in ("coverage", "coverage_anchor", "coverage_assist"):
        return m.coverage_words
    return m.coverage_words


def _next_task(profile: LabProfile, m: Any) -> dict[str, Any]:
    letter_by = _letter_map(profile)
    if profile.phase == "letters":
        for c in m.letters_order:
            row = letter_by.get(c)
            if row is None or not row.annotated:
                return {"type": "letter", "id": c.upper()}
        return {"type": "letter", "id": None}
    if profile.phase in ("coverage", "coverage_anchor", "coverage_assist"):
        cov_by = {w.word.lower(): w for w in profile.coverage_words}
        for w in _coverage_word_list_for_phase(profile, m):
            row = cov_by.get(w.lower())
            if row is None or not row.completed:
                tier = m.coverage_tier_for_word(w)
                return {"type": "coverage_word", "id": w, "coverage_tier": tier}
        return {"type": "coverage_word", "id": None}
    if profile.phase == "checks":
        chk_by_key = {x.check_key: x for x in profile.checks}
        for spec in m.checks:
            ck = spec["id"]
            row = chk_by_key.get(ck)
            if row is None or row.status == "not_started":
                return {"type": "evaluation_check", "id": ck, "word": spec["word"]}
        return {"type": "evaluation_check", "id": None}
    if profile.phase == "free_text":
        return {"type": "free_text", "id": None}
    if profile.phase == "create":
        return {"type": "create", "id": None}
    return {"type": "unknown", "id": None}


def _coverage_kb_label(db: Session, vocab_version_id: str | None) -> str | None:
    if not vocab_version_id:
        return None
    row = db.query(KbVocabVersion).filter(KbVocabVersion.id == vocab_version_id).first()
    return row.label if row else None


def _profile_init_success_response(
    db: Session,
    profile: LabProfile,
    *,
    resumed: bool,
) -> dict[str, Any]:
    """Shared JSON for POST /profile/init (new or resumed)."""
    dname = (profile.display_name or "").strip()
    pid = profile.id
    preview = build_render_dto(db, profile, "When words begin to glow.")
    db.commit()
    m = parse_manifest(profile)
    cov_kb_id = profile.coverage_kb_vocab_version_id
    return {
        "profile_id": pid,
        "display_name": dname,
        "slug": profile.slug,
        "resumed": resumed,
        "coverage_kb_vocab_version_id": cov_kb_id,
        "coverage_kb_label": _coverage_kb_label(db, cov_kb_id),
        "participant": {
            "id": pid,
            "displayName": dname,
            "slug": profile.slug,
            "createdAt": profile.created_at.isoformat() if profile.created_at else None,
        },
        "phase": profile.phase,
        "track": getattr(profile, "track", "deep"),
        "readiness_label": readiness_label(profile),
        "manifest_version": profile.manifest_version,
        "seed": profile.seed,
        "progress": _progress_payload(profile, m),
        "preview": {
            "render_version": preview["render_version"],
            "text": preview["text"],
            "tokens": preview["tokens"],
            "provenance": preview.get("provenance"),
        },
        "next_task": _next_task(profile, m),
    }


def _serialize_profile_state(profile: LabProfile, db: Session) -> dict[str, Any]:
    db.refresh(profile)
    m = parse_manifest(profile)
    letter_by = _letter_map(profile)
    letters_out = {
        c: {
            "annotated": bool(letter_by[c].annotated) if c in letter_by else False,
            "color": letter_by[c].color_hex if c in letter_by else "#4a5dff",
            "locked": bool(letter_by[c].locked) if c in letter_by else False,
            "revision_count": letter_by[c].revision_count if c in letter_by else 0,
            "stability": letter_by[c].stability if c in letter_by else 0.0,
            "updated_at": letter_by[c].updated_at.isoformat() if c in letter_by and letter_by[c].updated_at else None,
            "lab_l": letter_by[c].lab_l if c in letter_by else 72.0,
            "lab_a": letter_by[c].lab_a if c in letter_by else 8.0,
            "lab_b": letter_by[c].lab_b if c in letter_by else -28.0,
            "prominence": float(letter_by[c].prominence) if c in letter_by else 0.62,
            "spread": float(letter_by[c].spread) if c in letter_by else 0.38,
        }
        for c in [chr(ord("a") + i) for i in range(26)]
    }
    cov_by = {w.word.lower(): w for w in profile.coverage_words}
    coverage_out = []
    for w in m.coverage_words:
        row = cov_by.get(w.lower())
        if row:
            manual: dict[str, Any] | None = None
            if row.manual_adjustments_json:
                try:
                    raw_m = json.loads(row.manual_adjustments_json)
                    manual = raw_m if isinstance(raw_m, dict) else None
                except json.JSONDecodeError:
                    manual = None
            coverage_out.append(
                {
                    "word": row.word,
                    "completed": bool(row.completed),
                    "accepted_prediction": bool(row.accepted_prediction),
                    "coverage_tier": getattr(row, "coverage_tier", None) or m.coverage_tier_for_word(row.word),
                    "covered_patterns": json.loads(row.covered_patterns_json or "[]"),
                    "revision_count": row.revision_count,
                    "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                    "manual_adjustments": manual,
                }
            )
    chk_by = {x.check_key: x for x in profile.checks}
    checks_out = []
    for spec in m.checks:
        row = chk_by.get(spec["id"])
        if row:
            checks_out.append(
                {
                    "id": row.check_key,
                    "word": row.word,
                    "status": row.status,
                    "feedback_text": row.feedback_text,
                    "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                }
            )
    hist_raw = profile.palette_history_json or "[]"
    try:
        palette_history = json.loads(hist_raw)
    except json.JSONDecodeError:
        palette_history = []
    cov_kb_id = profile.coverage_kb_vocab_version_id
    return {
        "profile_id": profile.id,
        "display_name": getattr(profile, "display_name", None) or "",
        "slug": getattr(profile, "slug", None) or "",
        "last_active_at": profile.last_active_at.isoformat() if profile.last_active_at else None,
        "palette_history": palette_history if isinstance(palette_history, list) else [],
        "coverage_kb_vocab_version_id": cov_kb_id,
        "coverage_kb_label": _coverage_kb_label(db, cov_kb_id),
        "phase": profile.phase,
        "training_status": profile.training_status,
        "interruption_state": profile.interruption_state,
        "satisfaction_state": profile.satisfaction_state,
        "manifest_version": profile.manifest_version,
        "seed": profile.seed,
        "letters_order": m.letters_order,
        "coverage_words": m.coverage_words,
        "coverage_anchor_words": m.coverage_anchor_words,
        "coverage_assist_words": m.coverage_assist_words,
        "checks": m.checks,
        "letters": letters_out,
        "coverage": coverage_out,
        "evaluation_checks": checks_out,
        "active_checkpoint_uri": profile.active_checkpoint_uri,
        "render_seq": profile.render_seq,
        "progress": _progress_payload(profile, m),
        "next_task": _next_task(profile, m),
    }


def _legacy_profile_score(profile: LabProfile) -> tuple[int, float]:
    letters_done = sum(1 for x in profile.letters if x.annotated)
    cov_done = sum(1 for x in profile.coverage_words if x.completed)
    ts = profile.last_active_at or profile.created_at
    epoch = ts.timestamp() if ts else 0.0
    return letters_done * 1000 + cov_done * 10, epoch


def _pick_legacy_candidate(candidates: list[LabProfile]) -> LabProfile | None:
    if not candidates:
        return None
    return max(candidates, key=lambda p: _legacy_profile_score(p))


def _unlink_participant_key(db: Session, pk: str) -> None:
    for row in db.query(LabProfile).filter(LabProfile.lab_participant_key == pk).all():
        row.lab_participant_key = None
    db.flush()


@router.get("/health")
def lab_health():
    return {"ok": True}


@router.post("/profile/init")
def profile_init(
    body: ProfileInitBody,
    request: Request,
    db: Session = Depends(get_db),
):
    dname = body.display_name.strip()
    ip = client_ip_from_request(request)
    pk = lab_participant_key(dname, ip)

    if body.force_new:
        _unlink_participant_key(db, pk)
    else:
        existing = db.query(LabProfile).filter(LabProfile.lab_participant_key == pk).first()
        if existing:
            existing.last_active_at = _now()
            sync_profile_phase(db, existing)
            db.commit()
            db.refresh(existing)
            return _profile_init_success_response(db, existing, resumed=True)

        norm = normalize_lab_display_name(dname)
        legacy_candidates = (
            db.query(LabProfile)
            .filter(
                LabProfile.lab_participant_key.is_(None),
                func.lower(func.trim(LabProfile.display_name)) == norm,
            )
            .order_by(func.coalesce(LabProfile.last_active_at, LabProfile.created_at).desc())
            .all()
        )
        adopted = _pick_legacy_candidate(legacy_candidates)
        if adopted is not None:
            adopted.lab_participant_key = pk
            adopted.last_active_at = _now()
            sync_profile_phase(db, adopted)
            db.commit()
            db.refresh(adopted)
            return _profile_init_success_response(db, adopted, resumed=True)

    track = body.track if body.track in ("lite", "deep") else "deep"
    use_v2 = track == "deep"
    if use_v2:
        mf = build_manifest_v2(seed=body.seed)
    else:
        mf = build_manifest(seed=body.seed, manifest_version=1)
    anchor_list: list[str] = list(mf.coverage_anchor_words)
    assist_list: list[str] = list(mf.coverage_assist_words)
    coverage_list: list[str] = list(mf.coverage_words)
    checks_spec: list[dict[str, str]] = list(mf.checks)
    coverage_kb_vid: str | None = None
    vid = get_active_vocab_version_id(db)
    if vid and use_v2:
        try:
            data = top_words_by_pattern_count_data(db, vid, limit=30, min_freq=20, max_word_len=15)
            kb_words = [str(it["word"]) for it in (data.get("items") or []) if it.get("word")]
            if kb_words:
                anchor_list, assist_list, coverage_list = merge_kb_coverage_v2(
                    kb_words[:ANCHOR_COUNT],
                    kb_words[ANCHOR_COUNT:30],
                    seed=mf.seed,
                    static_fallback=mf,
                )
                checks_spec = []
                coverage_kb_vid = vid
        except Exception:
            logger.exception("lab profile_init: KB top-by-pattern words failed; using static manifest coverage")
    elif vid and not use_v2:
        try:
            data = top_words_by_pattern_count_data(db, vid, limit=30, min_freq=20, max_word_len=15)
            kb_words = [str(it["word"]) for it in (data.get("items") or []) if it.get("word")]
            if kb_words:
                seen: set[str] = set()
                merged: list[str] = []
                for w in kb_words:
                    wl = w.lower()
                    if wl not in seen:
                        seen.add(wl)
                        merged.append(w)
                for w in mf.coverage_words:
                    if len(merged) >= 30:
                        break
                    if w.lower() not in seen:
                        seen.add(w.lower())
                        merged.append(w)
                coverage_list = merged[:30]
                checks_spec = checks_for_coverage_words(coverage_list, random.Random(mf.seed))
                coverage_kb_vid = vid
        except Exception:
            logger.exception("lab profile_init: KB top-by-pattern words failed; using static manifest coverage")

    pid = str(uuid.uuid4())
    slug = allocate_unique_slug(db, dname)
    profile = LabProfile(
        id=pid,
        user_key=slug,
        display_name=dname,
        slug=slug,
        mode=body.mode,
        track=track,
        phase="letters",
        training_status="idle",
        interruption_state="none",
        satisfaction_state="not_started",
        manifest_version=2 if use_v2 else mf.manifest_version,
        seed=mf.seed,
        letters_order_json=mf.letters_order_json(),
        coverage_words_json=json.dumps(coverage_list),
        coverage_anchor_words_json=json.dumps(anchor_list),
        coverage_assist_words_json=json.dumps(assist_list),
        checks_json=json.dumps(checks_spec),
        user_pattern_lexicon_json="{}",
        coverage_kb_vocab_version_id=coverage_kb_vid,
        lab_participant_key=pk,
        palette_history_json=json.dumps([]),
        last_active_at=_now(),
    )
    db.add(profile)
    for i in range(26):
        ch = chr(ord("a") + i)
        db.add(
            LabLetterAnnotation(
                id=str(uuid.uuid4()),
                profile_id=pid,
                char=ch,
                color_hex="#4a5dff",
                locked=0,
                annotated=0,
            )
        )
    anchor_l = {w.lower() for w in anchor_list}
    assist_l = {w.lower() for w in assist_list}
    for w in coverage_list:
        wl = w.lower()
        tier = "legacy"
        if wl in anchor_l:
            tier = "anchor"
        elif wl in assist_l:
            tier = "assist"
        db.add(
            LabCoverageWord(
                id=str(uuid.uuid4()),
                profile_id=pid,
                word=w,
                coverage_tier=tier,
                completed=0,
                accepted_prediction=0,
                covered_patterns_json=json.dumps([]),
            )
        )
    for spec in checks_spec:
        db.add(
            LabEvaluationCheck(
                id=str(uuid.uuid4()),
                profile_id=pid,
                check_key=spec["id"],
                word=spec["word"],
                status="not_started",
            )
        )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raced = db.query(LabProfile).filter(LabProfile.lab_participant_key == pk).first()
        if raced:
            raced.last_active_at = _now()
            sync_profile_phase(db, raced)
            db.commit()
            db.refresh(raced)
            return _profile_init_success_response(db, raced, resumed=True)
        raise
    db.refresh(profile)
    return _profile_init_success_response(db, profile, resumed=False)


@router.get("/profile/state")
def profile_state(profile_id: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    profile = db.query(LabProfile).filter(LabProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="profile not found")
    profile.last_active_at = _now()
    sync_profile_phase(db, profile)
    db.commit()
    return {"profile": _serialize_profile_state(profile, db), "next_task": _next_task(profile, parse_manifest(profile))}


@router.get("/letters/{char}")
def get_letter(
    char: str,
    profile_id: str = Query(...),
    db: Session = Depends(get_db),
):
    profile = db.query(LabProfile).filter(LabProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="profile not found")
    c = char.lower()[:1]
    row = next((x for x in profile.letters if x.char.lower() == c), None)
    if not row:
        raise HTTPException(status_code=404, detail="letter not found")
    return {
        "char": c.upper(),
        "state": {
            "annotated": bool(row.annotated),
            "color": row.color_hex,
            "lab_l": row.lab_l,
            "lab_a": row.lab_a,
            "lab_b": row.lab_b,
            "prominence": float(row.prominence),
            "spread": float(row.spread),
            "locked": bool(row.locked),
            "revision_count": row.revision_count,
            "stability": row.stability,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        },
        "preview_impact": {"affected_words_count": 0},
    }


@router.put("/letters/{char}")
def put_letter(char: str, body: LetterPutBody, db: Session = Depends(get_db)):
    profile = db.query(LabProfile).filter(LabProfile.id == body.profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="profile not found")
    c = char.lower()[:1]
    row = next((x for x in profile.letters if x.char.lower() == c), None)
    if not row:
        raise HTTPException(status_code=404, detail="letter not found")
    has_lab = body.lab_l is not None and body.lab_a is not None and body.lab_b is not None
    if has_lab:
        L, a, b = clamp_lab(body.lab_l, body.lab_a, body.lab_b)
        row.lab_l, row.lab_a, row.lab_b = L, a, b
        row.color_hex = "#" + lab_to_hex(L, a, b)
    elif body.color:
        hx = body.color if body.color.startswith("#") else f"#{body.color}"
        row.color_hex = hx
        try:
            L, a, b = hex_to_lab(hx)
            row.lab_l, row.lab_a, row.lab_b = float(L), float(a), float(b)
        except ValueError:
            raise HTTPException(status_code=400, detail="invalid color hex") from None
    else:
        raise HTTPException(status_code=400, detail="provide color or lab_l/lab_a/lab_b")
    if body.prominence is not None:
        row.prominence = _clamp01(body.prominence)
    if body.spread is not None:
        row.spread = _clamp01(body.spread)
    row.locked = 1 if body.locked else 0
    row.annotated = 1
    row.revision_count += 1
    row.stability = _stability(row.revision_count)
    row.updated_at = _now()
    hist: list[Any] = []
    try:
        hist = json.loads(profile.palette_history_json or "[]")
        if not isinstance(hist, list):
            hist = []
    except json.JSONDecodeError:
        hist = []
    hist.append(
        {
            "letter": c.upper(),
            "hex": row.color_hex,
            "lab_l": row.lab_l,
            "lab_a": row.lab_a,
            "lab_b": row.lab_b,
            "saved_at": _now().isoformat(),
            "source": body.source,
        }
    )
    profile.palette_history_json = json.dumps(hist[-32:])
    profile.last_active_at = _now()
    sync_profile_phase(db, profile)
    m = parse_manifest(profile)
    db.commit()
    db.refresh(profile)
    prev = build_render_dto(db, profile, "When words begin to glow.")
    db.commit()
    return {
        "ok": True,
        "updated_letter": {
            "char": c.upper(),
            "annotated": True,
            "locked": bool(row.locked),
            "revision_count": row.revision_count,
            "stability": row.stability,
            "lab_l": row.lab_l,
            "lab_a": row.lab_a,
            "lab_b": row.lab_b,
            "color": row.color_hex,
            "prominence": float(row.prominence),
            "spread": float(row.spread),
        },
        "progress": _progress_payload(profile, m),
        "preview": {"render_version": prev["render_version"]},
        "toast": f"{c.upper()} anchored.",
        "render_payload": prev,
    }


@router.patch("/letters/{char}")
def patch_letter_px_s(char: str, body: LetterPxSPatchBody, db: Session = Depends(get_db)):
    """Update P×S only (English annotate model space); does not mark letter anchored."""
    profile = db.query(LabProfile).filter(LabProfile.id == body.profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="profile not found")
    c = char.lower()[:1]
    row = next((x for x in profile.letters if x.char.lower() == c), None)
    if not row:
        raise HTTPException(status_code=404, detail="letter not found")
    row.prominence = _clamp01(body.prominence)
    row.spread = _clamp01(body.spread)
    row.updated_at = _now()
    profile.last_active_at = _now()
    db.commit()
    db.refresh(row)
    return {
        "ok": True,
        "updated_letter": {
            "char": c.upper(),
            "annotated": bool(row.annotated),
            "prominence": float(row.prominence),
            "spread": float(row.spread),
            "revision_count": row.revision_count,
        },
    }


@router.get("/coverage/{word}")
def get_coverage(word: str, profile_id: str = Query(...), db: Session = Depends(get_db)):
    profile = db.query(LabProfile).filter(LabProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="profile not found")
    row = next((x for x in profile.coverage_words if x.word.lower() == word.lower()), None)
    if not row:
        raise HTTPException(status_code=404, detail="coverage word not found")
    prev = build_render_dto(db, profile, row.word)
    return {
        "word": row.word,
        "predicted_render": {"render_version": prev["render_version"]},
        "covered_patterns": json.loads(row.covered_patterns_json or "[]"),
        "render_payload": prev,
        "state": {
            "completed": bool(row.completed),
            "accepted_prediction": bool(row.accepted_prediction),
            "revision_count": row.revision_count,
        },
    }


@router.put("/coverage/{word}")
def put_coverage(word: str, body: CoveragePutBody, db: Session = Depends(get_db)):
    profile = db.query(LabProfile).filter(LabProfile.id == body.profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="profile not found")
    row = next((x for x in profile.coverage_words if x.word.lower() == word.lower()), None)
    if not row:
        raise HTTPException(status_code=404, detail="coverage word not found")
    row.completed = 1
    row.accepted_prediction = 1 if body.accepted_prediction else 0
    row.revision_count += 1
    row.updated_at = _now()
    if body.manual_adjustments is not None:
        row.manual_adjustments_json = json.dumps(body.manual_adjustments)
    from app.services.lab_ngram_lexicon import update_lexicon_from_coverage_save

    pats = update_lexicon_from_coverage_save(
        profile,
        word=row.word,
        manual_adjustments=body.manual_adjustments,
        accepted_prediction=bool(body.accepted_prediction),
    )
    row.covered_patterns_json = json.dumps(pats)
    sync_profile_phase(db, profile)
    m = parse_manifest(profile)
    db.commit()
    db.refresh(profile)
    prev = build_render_dto(db, profile, row.word)
    db.commit()
    return {
        "ok": True,
        "updated_coverage_word": {
            "word": row.word,
            "completed": True,
            "accepted_prediction": bool(row.accepted_prediction),
            "revision_count": row.revision_count,
        },
        "coverage_delta": {
            "new_patterns_added": json.loads(row.covered_patterns_json or "[]"),
            "coverage_completed_count": sum(1 for x in profile.coverage_words if x.completed),
        },
        "progress": _progress_payload(profile, m),
        "preview": {"render_version": prev["render_version"]},
        "toast": f"“{row.word}” expanded your profile.",
        "render_payload": prev,
    }


@router.get("/checks/{check_key}")
def get_check(check_key: str, profile_id: str = Query(...), db: Session = Depends(get_db)):
    profile = db.query(LabProfile).filter(LabProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="profile not found")
    row = next((x for x in profile.checks if x.check_key == check_key), None)
    if not row:
        raise HTTPException(status_code=404, detail="check not found")
    prev = build_render_dto(db, profile, row.word)
    return {
        "id": row.check_key,
        "word": row.word,
        "predicted_render": {"render_version": prev["render_version"]},
        "render_payload": prev,
        "state": {"status": row.status},
    }


@router.put("/checks/{check_key}")
def put_check(check_key: str, body: CheckPutBody, db: Session = Depends(get_db)):
    profile = db.query(LabProfile).filter(LabProfile.id == body.profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="profile not found")
    row = next((x for x in profile.checks if x.check_key == check_key), None)
    if not row:
        raise HTTPException(status_code=404, detail="check not found")
    status_map = {
        "looks_right": "accepted",
        "almost_right": "almost_right",
        "needs_fixing": "needs_fixing",
    }
    row.status = status_map[body.feedback_label]
    row.feedback_text = body.feedback_text
    row.updated_at = _now()
    decision_type = "none"
    reason = None
    nxt = None
    if body.feedback_label == "looks_right":
        profile.interruption_state = "none"
    elif body.feedback_label == "almost_right":
        decision_type = "patch"
        reason = "localized adjustment may help"
        nxt = "review nearby anchors"
        profile.interruption_state = "patch_review"
    elif body.feedback_label == "needs_fixing":
        decision_type = "retrain_candidate"
        reason = "structural mismatch"
        nxt = "consider refreshing your profile"
        profile.interruption_state = "retrain_candidate"
    else:
        profile.interruption_state = "none"
    sync_profile_phase(db, profile)
    m = parse_manifest(profile)
    db.commit()
    db.refresh(profile)
    prev = build_render_dto(db, profile, row.word)
    db.commit()
    return {
        "ok": True,
        "updated_check": {"id": row.check_key, "status": row.status},
        "decision": {
            "decision_type": decision_type,
            "reason": reason,
            "recommended_next_step": nxt,
        },
        "progress": _progress_payload(profile, m),
        "preview": {"render_version": prev["render_version"]},
        "render_payload": prev,
    }


@router.post("/preview")
def post_preview(body: PreviewBody, db: Session = Depends(get_db)):
    profile = db.query(LabProfile).filter(LabProfile.id == body.profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="profile not found")
    text = body.text.strip() or "When words begin to glow."
    if body.letter_overrides or body.coverage_live_draft:
        from app.services.lab_render_live import build_render_dto_live

        payload = build_render_dto_live(
            db,
            profile,
            text,
            letter_overrides=body.letter_overrides,
            coverage_live_draft=body.coverage_live_draft,
        )
    else:
        payload = build_render_dto(db, profile, text)
    db.commit()
    return payload


@router.post("/predict_word")
def post_predict_word(body: PredictWordBody, db: Session = Depends(get_db)):
    """Return per-letter Lab predictions for a word.

    ``mode=ngram_compose`` (assist phase): lexicon assembly + BiLSTM gap fill.
    """
    profile = db.query(LabProfile).filter(LabProfile.id == body.profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="profile not found")

    word = (body.word or "").strip()
    if not word:
        raise HTTPException(status_code=422, detail="word is empty")

    user_palette = {
        row.char.lower(): [float(row.lab_l), float(row.lab_a), float(row.lab_b)]
        for row in profile.letters
        if row.annotated
    }

    from app.services.lab_render import _trainer_checkpoint
    from app.services.lab_validation_al import micro_train_checkpoint_path

    def _resolve_predict_checkpoint() -> tuple[Any, str | None]:
        champion = _trainer_checkpoint(db)
        if champion is not None:
            return champion, "champion"
        micro = micro_train_checkpoint_path(profile.id)
        if micro.is_file():
            return micro, "micro"
        return None, None

    trainer_cp, checkpoint_kind = _resolve_predict_checkpoint()
    provenance: dict[str, Any] = {}
    pred_lab: list[list[float]] = []
    pred_prom: list[float] = []
    pred_spr: list[float] = []
    pred_bnd: list[float] = []

    if body.mode == "ngram_compose":
        from app.services.lab_ngram_compose import compose_word_from_lexicon, merge_compose_with_model

        compose = compose_word_from_lexicon(profile, word)
        provenance = compose.to_provenance()
        if checkpoint_kind:
            provenance["checkpoint"] = checkpoint_kind
        if trainer_cp and compose.model_gaps:
            try:
                from app.services.letter_sequence_predict import predict_word as _predict_word

                model_out = _predict_word(trainer_cp, word, user_palette=user_palette or None)
                merged = merge_compose_with_model(compose, model_out)
                pred_lab = merged.pred_lab
                pred_prom = merged.pred_prominence
                pred_spr = merged.pred_spread
                pred_bnd = merged.pred_boundary
                provenance["kind"] = "ngram_then_model"
                provenance["trainer_rebase"] = checkpoint_kind == "champion"
                provenance["model_filled_gaps"] = len(compose.model_gaps)
            except Exception:
                logger.warning("ngram compose model gap fill failed", exc_info=True)
                pred_lab = compose.pred_lab
                pred_prom = compose.pred_prominence
                pred_spr = compose.pred_spread
                pred_bnd = compose.pred_boundary
                provenance["model_error"] = True
        else:
            pred_lab = compose.pred_lab
            pred_prom = compose.pred_prominence
            pred_spr = compose.pred_spread
            pred_bnd = compose.pred_boundary
            if compose.model_gaps and not trainer_cp:
                provenance["model_unavailable"] = True
    elif trainer_cp:
        try:
            from app.services.letter_sequence_predict import predict_word as _predict_word

            out = _predict_word(trainer_cp, word, user_palette=user_palette or None)
            pred_lab = out.get("pred_lab") or []
            pred_prom = out.get("pred_prominence") or []
            pred_spr = out.get("pred_spread") or []
            pred_bnd = out.get("pred_boundary") or []
            provenance = {
                "kind": "trainer_rebase",
                "palette_rebased": out.get("palette_rebased", False),
                "trainer_palette_available": out.get("trainer_palette_available", False),
            }
        except Exception:
            logger.warning("predict_word checkpoint inference failed, using rules", exc_info=True)
            trainer_cp = None

    if body.mode != "ngram_compose" and not trainer_cp:
        # Rule-based flat colors — same logic as render_from_rules
        letter_by_char = {r.char.lower(): r for r in profile.letters}
        letters_alpha = [c for c in word.lower() if c.isalpha()]
        pred_lab = []
        for ch in letters_alpha:
            if ch in letter_by_char and letter_by_char[ch].annotated:
                row = letter_by_char[ch]
                pred_lab.append([float(row.lab_l), float(row.lab_a), float(row.lab_b)])
            else:
                pred_lab.append([72.0, 8.0, -28.0])
        pred_prom = [0.62] * len(letters_alpha)
        pred_spr = [0.38] * len(letters_alpha)
        pred_bnd = [0.48] * max(0, len(letters_alpha) - 1)
        provenance = {"kind": "rule_fallback"}

    # Build simplified per-letter response (frontend-friendly)
    letters_alpha = [c for c in word.lower() if c.isalpha()]
    letters_out = []
    for i, ch in enumerate(letters_alpha):
        lab = pred_lab[i] if i < len(pred_lab) else [50.0, 0.0, -5.0]
        letters_out.append(
            {
                "index": i,
                "char": ch,
                "hex": "#" + lab_to_hex(float(lab[0]), float(lab[1]), float(lab[2])),
                "lab": [round(float(lab[0]), 3), round(float(lab[1]), 3), round(float(lab[2]), 3)],
                "prominence": round(float(pred_prom[i]) if i < len(pred_prom) else 0.62, 4),
                "spread": round(float(pred_spr[i]) if i < len(pred_spr) else 0.38, 4),
            }
        )

    boundary_out = [
        {"left": i, "right": i + 1, "boundary_after": round(float(pred_bnd[i]) if i < len(pred_bnd) else 0.48, 4)}
        for i in range(max(0, len(letters_alpha) - 1))
    ]

    return {
        "word": word,
        "letters": letters_out,
        "boundary": boundary_out,
        "provenance": provenance,
    }


@router.post("/train")
def post_train(body: TrainBody, db: Session = Depends(get_db)):
    if not settings.lab_training_enabled:
        raise HTTPException(
            status_code=503,
            detail=(
                "BYO lab training is disabled on this deployment (LAB_TRAINING_ENABLED=0). "
                "Use a single long-lived API host with disk or a dedicated worker + shared artifact store."
            ),
        )
    profile = db.query(LabProfile).filter(LabProfile.id == body.profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="profile not found")
    if profile.training_status in ("running", "queued"):
        raise HTTPException(status_code=409, detail="training already in progress")
    run_id = start_lab_training(body.profile_id, triggered_by=body.triggered_by)
    return {"ok": True, "run_id": run_id, "status": "queued"}


@router.get("/train/{run_id}")
def get_train(run_id: str, db: Session = Depends(get_db)):
    row = db.query(LabTrainingRun).filter(LabTrainingRun.id == run_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="run not found")
    kfold = read_kfold_report(run_id)
    holdout = read_holdout_report(run_id)
    cv_status = kfold.get("status", "missing")
    cv_summary = kfold.get("summary") or {}
    return {
        "run_id": row.id,
        "profile_id": row.profile_id,
        "status": row.status,
        "train_sample_count": row.train_sample_count,
        "checkpoint_uri": row.checkpoint_uri,
        "error_message": row.error_message,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "finished_at": row.finished_at.isoformat() if row.finished_at else None,
        "cv_status": cv_status,
        "cv_summary": cv_summary,
        "cv_folds": kfold.get("folds") or [],
        "holdout_metrics": holdout,
    }


@router.post("/train/decision")
def train_decision(body: TrainDecisionBody, db: Session = Depends(get_db)):
    profile = db.query(LabProfile).filter(LabProfile.id == body.profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="profile not found")
    m = parse_manifest(profile)
    chk_order = [spec["id"] for spec in m.checks]
    chk_by_key = {x.check_key: x for x in profile.checks}
    ordered = [chk_by_key[k] for k in chk_order if k in chk_by_key]
    started = [x for x in ordered if x.status != "not_started"]
    last = started[-5:]
    n_fix = sum(1 for x in last if x.status == "needs_fixing")
    n_ok = sum(1 for x in last if x.status == "accepted")
    should_retrain = n_fix >= 3
    n_cov = sum(1 for x in profile.coverage_words if x.completed)
    decision_type = "none"
    reason = None
    rec = None
    if should_retrain:
        decision_type = "retrain_candidate"
        reason = "several recent checks need fixing"
        rec = "run_local_retrain"
        profile.interruption_state = "retrain_candidate"
    elif n_cov < 20 and profile.phase in ("coverage", "coverage_anchor", "coverage_assist", "checks", "free_text"):
        decision_type = "need_more_coverage"
        reason = "broader word coverage often helps the field settle"
        rec = "continue_coverage_words"
        profile.interruption_state = "need_more_coverage"
    elif n_ok >= 4 and len(last) >= 4:
        profile.interruption_state = "none"
    elif len(last) >= 1:
        decision_type = "patch"
        reason = "fine-tune a few anchors"
        rec = "continue_checks"
        profile.interruption_state = "patch_review"
    db.commit()
    return {
        "should_retrain": should_retrain,
        "decision_type": decision_type,
        "reason": reason,
        "recommended_next_step": rec,
        "debug_metrics": {
            "recent_window": len(last),
            "needs_fixing_in_window": n_fix,
            "accepted_in_window": n_ok,
            "coverage_completed_count": n_cov,
        },
    }


@router.post("/complete")
def post_complete(body: CompleteBody, db: Session = Depends(get_db)):
    profile = db.query(LabProfile).filter(LabProfile.id == body.profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="profile not found")
    if body.satisfaction == "ready":
        profile.satisfaction_state = "ready"
        profile.phase = "create"
    else:
        profile.satisfaction_state = "needs_work"
    db.commit()
    return {
        "ok": True,
        "readiness_label": readiness_label(profile),
        "create_enabled": body.satisfaction == "ready",
    }
