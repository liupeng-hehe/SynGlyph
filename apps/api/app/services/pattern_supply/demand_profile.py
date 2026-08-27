from __future__ import annotations

import json
import uuid
from collections import Counter
from dataclasses import asdict
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config.pattern_supply import PROFILE_POLICY, TARGETS
from app.models.annotation import Annotation
from app.models.offline_collocation_index import OfflineCollocationIndex
from app.models.offline_context_index import OfflineContextIndex
from app.models.offline_pattern_index import OfflinePatternIndex
from app.models.stimulus import Stimulus
from app.models.supply_demand_profile import SupplyDemandProfile
from app.models.user_word_registry import UserWordRegistry
from app.schemas.pattern_supply import (
    CollocationGapSchema,
    ContextGapSchema,
    CoverageDomainStateSchema,
    CoverageStateSchema,
    CoverageStateWindowSchema,
    DemandProfileSchema,
    PatternGapSchema,
)
from app.services.pattern_supply.demand_math import (
    collocation_gap_priority,
    context_gap_priority,
    pattern_gap_priority,
)
from app.services.pattern_supply.pattern_extraction import extract_pattern_features
from app.services.pattern_supply.contracts import RawCandidateDTO
from app.services.pattern_supply.normalization import normalize_word
from app.services.pattern_supply.offline_index_store import active_version_row


def _build_pattern_counter(words: list[str]) -> Counter[str]:
    c: Counter[str] = Counter()
    for w in words:
        raw = RawCandidateDTO(
            word=w,
            normalized_word=normalize_word(w),
            lemma=None,
            sources=[],
            source_confidence=0.0,
            generation_signals={},
            provider_payload_refs={},
        )
        f = extract_pattern_features(raw)
        for x in f.get("bigrams", []):
            c[f"bigram:{x}"] += 1
        for x in f.get("trigrams", []):
            c[f"trigram:{x}"] += 1
        sx = f.get("suffix_2")
        px = f.get("prefix_2")
        if isinstance(sx, str) and sx:
            c[f"suffix:{sx}"] += 1
        if isinstance(px, str) and px:
            c[f"prefix:{px}"] += 1
    return c


def _top_targets(counter: Counter[str], target_count: int, fallback_prefix: str) -> dict[str, float]:
    if counter:
        return {k: float(target_count) for k, _ in counter.most_common(20)}
    return {f"{fallback_prefix}:default": float(target_count)}


def _build_gap_rows(
    *,
    targets: dict[str, float],
    covered: Counter[str],
    kind: str,
) -> list[PatternGapSchema | ContextGapSchema | CollocationGapSchema]:
    out = []
    for key, target in targets.items():
        cov = float(covered.get(key, 0))
        if kind == "pattern":
            pri = pattern_gap_priority(target=target, covered=cov)
            out.append(
                PatternGapSchema(
                    pattern_key=key,
                    target=target,
                    covered=cov,
                    gap_raw=max(0.0, target - cov),
                    gap_norm=max(0.0, target - cov) / max(1.0, target),
                    priority=pri,
                )
            )
        elif kind == "context":
            pri = context_gap_priority(target=target, covered=cov)
            out.append(
                ContextGapSchema(
                    context_key=key,
                    target=target,
                    covered=cov,
                    gap_raw=max(0.0, target - cov),
                    gap_norm=max(0.0, target - cov) / max(1.0, target),
                    priority=pri,
                )
            )
        else:
            pri = collocation_gap_priority(target=target, covered=cov)
            out.append(
                CollocationGapSchema(
                    collocation_key=key,
                    target=target,
                    covered=cov,
                    gap_raw=max(0.0, target - cov),
                    gap_norm=max(0.0, target - cov) / max(1.0, target),
                    priority=pri,
                )
            )
    out.sort(key=lambda x: x.priority, reverse=True)
    return out


def refresh_demand_profile(
    db: Session,
    *,
    selected_list_id: str,
    force: bool = False,
    ttl_seconds: int | None = None,
) -> DemandProfileSchema:
    ttl = ttl_seconds if ttl_seconds is not None else PROFILE_POLICY.profile_ttl_seconds
    latest = (
        db.query(SupplyDemandProfile)
        .filter(SupplyDemandProfile.selected_list_id == selected_list_id)
        .order_by(SupplyDemandProfile.created_at.desc())
        .first()
    )
    if latest and not force and latest.created_at and (datetime.now(timezone.utc) - latest.created_at) <= timedelta(seconds=ttl):
        return _row_to_schema(latest)

    annotated_words = [
        r[0]
        for r in (
            db.query(Stimulus.text)
            .join(Annotation, Annotation.stimulus_id == Stimulus.id)
            .filter(Stimulus.dataset_id == selected_list_id)
            .distinct()
            .all()
        )
        if r[0]
    ]
    selected_words = [
        r[0]
        for r in (
            db.query(UserWordRegistry.word)
            .filter(
                UserWordRegistry.selected_list_id == selected_list_id,
                UserWordRegistry.status == "selected",
            )
            .all()
        )
        if r[0]
    ]
    candidate_count = (
        db.query(UserWordRegistry)
        .filter(
            UserWordRegistry.selected_list_id == selected_list_id,
            UserWordRegistry.status == "candidate",
        )
        .count()
    )

    pattern_counter = _build_pattern_counter(annotated_words)
    selected_counter = _build_pattern_counter(selected_words)
    pattern_targets, context_targets, collocation_targets = _offline_targets(
        db,
        selected_list_id=selected_list_id,
    )
    if not pattern_targets:
        pattern_targets = _top_targets(pattern_counter + selected_counter, TARGETS.pattern_default, "pattern")
        context_targets = {k.replace("prefix:", "context:prefix:"): float(TARGETS.context_default) for k in list(pattern_targets.keys())[:12]}
        collocation_targets = {k.replace("bigram:", "collocation:"): float(TARGETS.collocation_default) for k in list(pattern_targets.keys())[:12]}

    pattern_gaps = _build_gap_rows(targets=pattern_targets, covered=pattern_counter, kind="pattern")
    context_cov = Counter({k.replace("prefix:", "context:prefix:"): v for k, v in pattern_counter.items()})
    colloc_cov = Counter({k.replace("bigram:", "collocation:"): v for k, v in pattern_counter.items()})
    context_gaps = _build_gap_rows(targets=context_targets, covered=context_cov, kind="context")
    collocation_gaps = _build_gap_rows(targets=collocation_targets, covered=colloc_cov, kind="collocation")

    now = datetime.now(timezone.utc)
    coverage_state = CoverageStateSchema(
        selected_list_id=selected_list_id,
        computed_at=now,
        window=CoverageStateWindowSchema(
            annotated_count=len(annotated_words),
            selected_count=len(selected_words),
            candidate_count=int(candidate_count),
        ),
        pattern=CoverageDomainStateSchema(
            targets=pattern_targets,
            covered={k: float(v) for k, v in pattern_counter.items()},
            gap_summary={
                "mean_gap_norm": float(sum(x.gap_norm for x in pattern_gaps) / max(1, len(pattern_gaps))),
                "max_gap_key": pattern_gaps[0].pattern_key if pattern_gaps else "",
            },
        ),
        context=CoverageDomainStateSchema(
            targets=context_targets,
            covered={k: float(v) for k, v in context_cov.items()},
            gap_summary={
                "mean_gap_norm": float(sum(x.gap_norm for x in context_gaps) / max(1, len(context_gaps))),
                "max_gap_key": context_gaps[0].context_key if context_gaps else "",
            },
        ),
        collocation=CoverageDomainStateSchema(
            targets=collocation_targets,
            covered={k: float(v) for k, v in colloc_cov.items()},
            gap_summary={
                "mean_gap_norm": float(sum(x.gap_norm for x in collocation_gaps) / max(1, len(collocation_gaps))),
                "max_gap_key": collocation_gaps[0].collocation_key if collocation_gaps else "",
            },
        ),
        normalization={"version": PROFILE_POLICY.profile_version, "method": "gap_norm_v1"},
    )

    row = SupplyDemandProfile(
        id=str(uuid.uuid4()),
        selected_list_id=selected_list_id,
        profile_version=PROFILE_POLICY.profile_version,
        pattern_gap_json=json.dumps([x.model_dump() for x in pattern_gaps], ensure_ascii=False),
        context_gap_json=json.dumps([x.model_dump() for x in context_gaps], ensure_ascii=False),
        collocation_gap_json=json.dumps([x.model_dump() for x in collocation_gaps], ensure_ascii=False),
        coverage_state_json=json.dumps(coverage_state.model_dump(mode="json"), ensure_ascii=False),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_to_schema(row)


def _row_to_schema(row: SupplyDemandProfile) -> DemandProfileSchema:
    return DemandProfileSchema(
        selected_list_id=row.selected_list_id,
        profile_version=row.profile_version,
        exclude_selected_default=True,
        pattern_gaps=[PatternGapSchema(**x) for x in json.loads(row.pattern_gap_json or "[]")],
        context_gaps=[ContextGapSchema(**x) for x in json.loads(row.context_gap_json or "[]")],
        collocation_gaps=[CollocationGapSchema(**x) for x in json.loads(row.collocation_gap_json or "[]")],
        coverage_state=CoverageStateSchema(**json.loads(row.coverage_state_json or "{}")),
    )


def _offline_targets(db: Session, *, selected_list_id: str) -> tuple[dict[str, float], dict[str, float], dict[str, float]]:
    del selected_list_id  # reserved for future per-list tuning
    active = active_version_row(db)
    if active is None:
        return {}, {}, {}
    pattern_targets = {
        row.pattern_key: float(max(TARGETS.pattern_default, row.pattern_count))
        for row in (
            db.query(OfflinePatternIndex)
            .filter(OfflinePatternIndex.version_id == active.id)
            .order_by(OfflinePatternIndex.pattern_count.desc())
            .limit(24)
            .all()
        )
    }
    context_targets = {
        row.context_key: float(max(TARGETS.context_default, row.context_count))
        for row in (
            db.query(OfflineContextIndex)
            .filter(OfflineContextIndex.version_id == active.id)
            .order_by(OfflineContextIndex.context_count.desc())
            .limit(24)
            .all()
        )
    }
    collocation_targets = {
        row.collocation_key: float(max(TARGETS.collocation_default, row.collocation_count))
        for row in (
            db.query(OfflineCollocationIndex)
            .filter(OfflineCollocationIndex.version_id == active.id)
            .order_by(OfflineCollocationIndex.collocation_count.desc())
            .limit(24)
            .all()
        )
    }
    return pattern_targets, context_targets, collocation_targets

