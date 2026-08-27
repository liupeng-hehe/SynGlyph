"""Hybrid Active Learning scoring orchestration (v1)."""

from __future__ import annotations

import hashlib
import random
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.config.active_learning import (
    KB_BLEND,
    NORMALIZATION,
    WEIGHTS,
    al_lambda_feedback_risk,
    al_lambda_syllable_novelty,
    al_candidate_sql_fetch_multiplier,
    al_cost_mode,
    al_diversity_top_m,
    al_enable_cost_aware_scoring,
    al_enable_diversity_rerank,
    al_kb_candidate_sql_multiplier,
    al_kb_pattern_debug_detail,
    al_lambda_cost,
    al_lambda_redundancy,
    al_scoring_pool_factor,
    al_similarity_backend,
    al_tie_break_mode,
)
from app.models import Annotation, KbWord, Stimulus, UserWordRegistry
from app.services.pattern_supply.normalization import normalize_word
from app.services.active_learning_predictions import ALPredictionRow, score_candidate_stimuli
from app.services.active_learning_stats import (
    build_labeled_unit_counts,
    coverage_gain_score,
    instability_score,
    segment_novelty_score,
)
from app.services.kb_analytics.rebuild import get_active_vocab_version_id
from app.services.kb_analytics.scoring import kb_scores_for_text
from app.services.syllable_al import historical_feedback_risk, syllable_novelty_for_batch

from letter_sequence.al.acquisition_policy import (
    HybridNormConfig,
    apply_cost_penalty,
    rerank_batch_with_diversity,
    estimate_label_cost,
    score_hybrid_candidates,
)

SCORING_STAGE_HYBRID_V1 = "hybrid_scoring_v1"
SCORING_STAGE_HYBRID_V2 = "hybrid_scoring_v2"


def _merge_raw_with_kb(base: dict[str, Any], kb: object | None) -> dict[str, Any]:
    out = dict(base)
    if isinstance(kb, dict):
        out.update(kb)
    return out


@dataclass
class ALScoredRow:
    stimulus_id: str
    text: str
    score: float
    boundary_uncertainty: float
    segment_attribute_uncertainty: float
    segment_novelty: float
    coverage_gain: float
    instability: float
    score_raw_json: dict[str, Any]
    score_norm_json: dict[str, float]


@dataclass
class ALScoringResult:
    rows: list[ALScoredRow]
    model_snapshot_id: str | None
    selected_list_id: str | None
    scoring_stage: str
    snapshot_time: datetime


def _default_history_lookup(_: str, __: int) -> tuple[list[float], list[float]]:
    return [], []


def _stable_hash_tie(stimulus_id: str) -> int:
    digest = hashlib.md5(stimulus_id.encode(), usedforsecurity=False).hexdigest()[:12]
    return int(digest, 16)


def sort_scored_rows(rows: list[ALScoredRow], tie_break_mode: str) -> None:
    """In-place sort by hybrid score descending; optional tie-break reduces import-order bias."""
    mode = (tie_break_mode or "hash").strip().lower()
    if mode == "none":
        rows.sort(key=lambda r: -r.score)
    elif mode == "random":
        rows.sort(key=lambda r: (-r.score, random.random()))
    else:
        rows.sort(key=lambda r: (-r.score, _stable_hash_tie(r.stimulus_id)))


def fetch_candidate_stimuli(
    db: Session,
    *,
    limit: int,
    selected_list_id: str | None = None,
    exclude_existing: bool = True,
    exclude_selected: bool = True,
) -> list[tuple[str, str]]:
    from sqlalchemy import func as sqlfunc

    q = (
        db.query(Stimulus.id, Stimulus.text)
        .outerjoin(Annotation, Annotation.stimulus_id == Stimulus.id)
        .filter(and_(Stimulus.language == "en", Annotation.id.is_(None)))
    )
    if selected_list_id:
        q = q.filter(Stimulus.dataset_id == selected_list_id)
    sql_mult = al_candidate_sql_fetch_multiplier()
    # Random ordering ensures the candidate pool is drawn from across the entire
    # unannotated corpus, not just the most recently imported slice.
    rows = q.order_by(sqlfunc.random()).limit(max(limit, 1) * sql_mult).all()
    values = [(sid, text or "") for sid, text in rows]
    if not exclude_existing or not selected_list_id:
        return values[: max(limit, 1)]
    status_set = ["annotated"]
    if exclude_selected:
        status_set.append("selected")
    registry_rows = (
        db.query(UserWordRegistry.normalized_word)
        .filter(
            UserWordRegistry.selected_list_id == selected_list_id,
            UserWordRegistry.status.in_(status_set),
        )
        .all()
    )
    excluded = {r[0] for r in registry_rows if r[0]}
    out = []
    for sid, text in values:
        if normalize_word(text) in excluded:
            continue
        out.append((sid, text))
        if len(out) >= max(limit, 1):
            break
    return out


def fetch_candidate_stimuli_from_kb(
    db: Session,
    *,
    limit: int,
    selected_list_id: str | None = None,
    exclude_existing: bool = True,
    exclude_selected: bool = True,
    kb_vocab_version_id: str | None = None,
) -> list[tuple[str, str]]:
    """
    Candidate source: active KB lexicon (or explicit kb_vocab_version_id), then mapped into Stimulus rows.

    If a KB word is missing in the target dataset/global pool, create a Stimulus row so annotation can proceed.
    """
    resolved_vid = kb_vocab_version_id or get_active_vocab_version_id(db)
    if not resolved_vid:
        return []

    from sqlalchemy import func as sqlfunc

    # Pull a wider pool before registry filtering.
    # Secondary sort: random within each rank tier so alphabetically-adjacent
    # words (same rank, different prefix) don't dominate the candidate pool.
    kb_sql_mult = al_kb_candidate_sql_multiplier()
    kb_rows = (
        db.query(KbWord.normalized_word)
        .filter(KbWord.vocab_version_id == resolved_vid)
        .order_by(KbWord.rank.asc().nullslast(), sqlfunc.random())
        .limit(max(limit, 1) * kb_sql_mult)
        .all()
    )
    words = [w[0] for w in kb_rows if w and w[0]]
    if not words:
        return []

    status_set = ["annotated"]
    if exclude_selected:
        status_set.append("selected")
    excluded: set[str] = set()
    if exclude_existing and selected_list_id:
        registry_rows = (
            db.query(UserWordRegistry.normalized_word)
            .filter(
                UserWordRegistry.selected_list_id == selected_list_id,
                UserWordRegistry.status.in_(status_set),
            )
            .all()
        )
        excluded = {r[0] for r in registry_rows if r[0]}

    # Existing stimuli under same dataset scope.
    q = db.query(Stimulus).filter(Stimulus.language == "en")
    if selected_list_id is not None:
        q = q.filter(Stimulus.dataset_id == selected_list_id)
    else:
        q = q.filter(Stimulus.dataset_id.is_(None))
    existing_rows = q.all()
    by_norm: dict[str, Stimulus] = {}
    for st in existing_rows:
        nw = normalize_word(st.text or "")
        if nw and nw not in by_norm:
            by_norm[nw] = st

    out: list[tuple[str, str]] = []
    created = False
    for nw in words:
        if exclude_existing and nw in excluded:
            continue
        st = by_norm.get(nw)
        if st is None:
            st = Stimulus(
                id=str(uuid.uuid4()),
                text=nw,
                language="en",
                source_type="kb_seed",
                dataset_id=selected_list_id,
            )
            db.add(st)
            by_norm[nw] = st
            created = True
        out.append((st.id, st.text or nw))
        if len(out) >= max(limit, 1):
            break

    if created:
        db.commit()
    return out


def _weights_dict() -> dict[str, float]:
    return {
        "boundary_uncertainty": WEIGHTS.boundary_uncertainty,
        "segment_attribute_uncertainty": WEIGHTS.segment_attribute_uncertainty,
        "segment_novelty": WEIGHTS.segment_novelty,
        "coverage_gain": WEIGHTS.coverage_gain,
        "instability": WEIGHTS.instability,
    }


def _norm_config() -> HybridNormConfig:
    return HybridNormConfig(
        lower_percentile=NORMALIZATION.lower_percentile,
        upper_percentile=NORMALIZATION.upper_percentile,
        collapse_fallback=NORMALIZATION.collapse_fallback,
    )


def compute_hybrid_al_scores(
    db: Session,
    *,
    limit: int,
    snapshot_id: str | None = None,
    checkpoint_path_override: str | None = None,
    selected_list_id: str | None = None,
    exclude_existing: bool = True,
    exclude_selected: bool = True,
    history_window: int = 8,
    history_lookup: Callable[[str, int], tuple[list[float], list[float]]] | None = None,
    kb_vocab_version_id: str | None = None,
    candidate_source: str = "stimulus",
    tie_break_mode: str | None = None,
    include_kb_pattern_debug: bool = False,
) -> ALScoringResult:
    pool_factor = al_scoring_pool_factor()
    pool_target = max(1, int(limit)) * pool_factor
    if candidate_source == "kb":
        candidates = fetch_candidate_stimuli_from_kb(
            db,
            limit=pool_target,
            selected_list_id=selected_list_id,
            exclude_existing=exclude_existing,
            exclude_selected=exclude_selected,
            kb_vocab_version_id=kb_vocab_version_id,
        )
    else:
        candidates = fetch_candidate_stimuli(
            db,
            limit=pool_target,
            selected_list_id=selected_list_id,
            exclude_existing=exclude_existing,
            exclude_selected=exclude_selected,
        )
    predictions, resolved_snapshot_id = score_candidate_stimuli(
        db,
        candidates=candidates,
        snapshot_id=snapshot_id,
        checkpoint_path_override=checkpoint_path_override,
    )
    pred_by_id: dict[str, ALPredictionRow] = {p.stimulus_id: p for p in predictions}
    counts = build_labeled_unit_counts(db)
    get_history = history_lookup or _default_history_lookup

    resolved_kb_vid = kb_vocab_version_id or get_active_vocab_version_id(db)
    use_kb = bool(resolved_kb_vid and KB_BLEND.use_kb_when_active)
    pattern_debug = bool(include_kb_pattern_debug or al_kb_pattern_debug_detail())

    lam_syl = al_lambda_syllable_novelty()
    lam_fb = al_lambda_feedback_risk()
    fb_risk = historical_feedback_risk(db)
    seen_pat: set[str] = set()
    syl_scores = syllable_novelty_for_batch(db, [t for _s, t in candidates], seen_pat)

    raw_rows: list[dict[str, float | str | dict[str, float]]] = []
    for idx, (sid, text) in enumerate(candidates):
        pred = pred_by_id.get(sid)
        boundary_unc = float(pred.boundary_uncertainty) if pred else 0.0
        attr_unc = float(pred.segment_attribute_uncertainty) if pred else 0.0
        novelty = float(segment_novelty_score(text, counts))
        syl_n = float(syl_scores[idx]) if idx < len(syl_scores) else 0.0
        novelty = min(1.0, novelty + lam_syl * syl_n)
        novelty = max(0.0, novelty - lam_fb * min(1.0, fb_risk))
        coverage = float(coverage_gain_score(text, counts))
        kb_explain: dict[str, Any] = {}
        if use_kb and resolved_kb_vid:
            ks = kb_scores_for_text(
                db,
                text,
                vocab_version_id=resolved_kb_vid,
                include_pattern_deficit_detail=pattern_debug,
            )
            kb_explain = {str(k): v for k, v in ks.items()}
            kpg = ks.get("kb_pattern_gap")
            ksg = ks.get("kb_segment_gap")
            if isinstance(kpg, (int, float)):
                coverage = float((1.0 - KB_BLEND.coverage_kb) * coverage + KB_BLEND.coverage_kb * float(kpg))
            if isinstance(ksg, (int, float)):
                novelty = float((1.0 - KB_BLEND.segment_kb) * novelty + KB_BLEND.segment_kb * float(ksg))
        b_hist, a_hist = get_history(sid, history_window)
        instability = float(instability_score(b_hist, a_hist)) if b_hist and a_hist else 0.0
        raw_rows.append(
            {
                "stimulus_id": sid,
                "text": text,
                "boundary_uncertainty": boundary_unc,
                "segment_attribute_uncertainty": attr_unc,
                "segment_novelty": novelty,
                "coverage_gain": coverage,
                "instability": instability,
                "syllable_novelty": syl_n,
                "feedback_risk_scale": fb_risk,
                "kb_explain_json": kb_explain if use_kb else {},
            }
        )

    scorer_input = [
        {
            "stimulus_id": str(r["stimulus_id"]),
            "text": str(r["text"]),
            "boundary_uncertainty": float(r["boundary_uncertainty"]),
            "segment_attribute_uncertainty": float(r["segment_attribute_uncertainty"]),
            "segment_novelty": float(r["segment_novelty"]),
            "coverage_gain": float(r["coverage_gain"]),
            "instability": float(r["instability"]),
        }
        for r in raw_rows
    ]
    scored = score_hybrid_candidates(scorer_input, weights=_weights_dict(), norm=_norm_config())

    enable_cost = al_enable_cost_aware_scoring()
    if enable_cost:
        mode = al_cost_mode()
        char_c: Counter[str] = counts["char"]
        raw_costs = [
            estimate_label_cost(
                str(r["text"]),
                mode=mode,
                labeled_char_counts=char_c,
                difficulty=None,
            )
            for r in raw_rows
        ]
        scored = apply_cost_penalty(
            scored,
            raw_costs=raw_costs,
            lambda_cost=al_lambda_cost(),
            norm=_norm_config(),
        )

    enable_div = al_enable_diversity_rerank()
    if enable_div:
        backend = al_similarity_backend()
        if backend == "embedding":
            raise ValueError("SYNGLYPH_AL_SIMILARITY_BACKEND=embedding is not supported in v1")
        final_scored = rerank_batch_with_diversity(
            scored,
            k=max(1, int(limit)),
            top_m=al_diversity_top_m(),
            lambda_redundancy=al_lambda_redundancy(),
            similarity_backend=backend,  # type: ignore[arg-type]
        )
    else:
        final_scored = scored

    raw_by_id = {str(r["stimulus_id"]): r for r in raw_rows}
    out_rows: list[ALScoredRow] = []
    for s in final_scored:
        raw = raw_by_id[str(s["stimulus_id"])]
        norm = {k: float(s["score_norm_json"][k]) for k in s["score_norm_json"]}
        score_raw = _merge_raw_with_kb(
            {
                "boundary_uncertainty": float(raw["boundary_uncertainty"]),
                "segment_attribute_uncertainty": float(raw["segment_attribute_uncertainty"]),
                "segment_novelty": float(raw["segment_novelty"]),
                "coverage_gain": float(raw["coverage_gain"]),
                "instability": float(raw["instability"]),
            },
            raw.get("kb_explain_json"),
        )
        if enable_cost:
            for key in ("estimated_label_cost", "normalized_label_cost", "score_before_cost"):
                if key in s:
                    score_raw[key] = s[key]
        if "diversity_adjusted_score" in s:
            score_raw["diversity_adjusted_score"] = s["diversity_adjusted_score"]
        out_rows.append(
            ALScoredRow(
                stimulus_id=str(s["stimulus_id"]),
                text=str(s["text"]),
                score=float(s["score"]),
                boundary_uncertainty=float(raw["boundary_uncertainty"]),
                segment_attribute_uncertainty=float(raw["segment_attribute_uncertainty"]),
                segment_novelty=float(raw["segment_novelty"]),
                coverage_gain=float(raw["coverage_gain"]),
                instability=float(raw["instability"]),
                score_raw_json=score_raw,
                score_norm_json=norm,
            )
        )

    if not enable_div:
        resolved_tie = tie_break_mode if tie_break_mode in ("none", "hash", "random") else al_tie_break_mode()
        sort_scored_rows(out_rows, resolved_tie)

    stage = SCORING_STAGE_HYBRID_V2 if use_kb else SCORING_STAGE_HYBRID_V1
    return ALScoringResult(
        rows=out_rows[: max(1, int(limit))],
        model_snapshot_id=resolved_snapshot_id,
        selected_list_id=selected_list_id,
        scoring_stage=stage,
        snapshot_time=datetime.now(timezone.utc),
    )
