from __future__ import annotations

import json
import uuid

from sqlalchemy.orm import Session

from app.models.supply_candidate_snapshot import SupplyCandidateSnapshot
from app.models.supply_recommendation_snapshot import SupplyRecommendationSnapshot
from app.services.pattern_supply.contracts import EnrichedCandidateDTO, RankedCandidateDTO


def persist_candidates(
    db: Session,
    *,
    batch_id: str,
    selected_list_id: str,
    accepted: list[EnrichedCandidateDTO],
    excluded: list[EnrichedCandidateDTO],
) -> None:
    rows: list[SupplyCandidateSnapshot] = []
    for row in accepted:
        rows.append(
            SupplyCandidateSnapshot(
                id=str(uuid.uuid4()),
                batch_id=batch_id,
                selected_list_id=selected_list_id,
                word=row.word,
                normalized_word=row.normalized_word,
                sources_json=json.dumps(row.sources, ensure_ascii=False),
                candidate_payload_json=json.dumps(_candidate_payload(row), ensure_ascii=False),
                excluded=False,
                exclusion_reason=None,
            )
        )
    for row in excluded:
        rows.append(
            SupplyCandidateSnapshot(
                id=str(uuid.uuid4()),
                batch_id=batch_id,
                selected_list_id=selected_list_id,
                word=row.word,
                normalized_word=row.normalized_word,
                sources_json=json.dumps(row.sources, ensure_ascii=False),
                candidate_payload_json=json.dumps(_candidate_payload(row), ensure_ascii=False),
                excluded=True,
                exclusion_reason=row.exclusion_reason,
            )
        )
    if rows:
        db.add_all(rows)


def persist_recommendations(
    db: Session,
    *,
    batch_id: str,
    selected_list_id: str,
    rows: list[RankedCandidateDTO],
) -> None:
    inserts = [
        SupplyRecommendationSnapshot(
            id=str(uuid.uuid4()),
            batch_id=batch_id,
            selected_list_id=selected_list_id,
            word=row.word,
            normalized_word=row.normalized_word,
            rank=int(row.rank or (idx + 1)),
            supply_score=float(row.supply_score),
            score_breakdown_json=json.dumps(row.score_breakdown, ensure_ascii=False),
            why_selected_json=json.dumps(row.why_selected, ensure_ascii=False),
        )
        for idx, row in enumerate(rows)
    ]
    if inserts:
        db.add_all(inserts)


def _candidate_payload(row: EnrichedCandidateDTO) -> dict[str, object]:
    return {
        "pattern_features": row.pattern_features,
        "context_combos": [c.__dict__ for c in row.context_combos],
        "lexical_metadata": row.lexical_metadata,
        "frequency_prior": row.frequency_prior,
        "collocation_metadata": row.collocation_metadata,
        "registry_status": row.registry_status,
        "exclusion_reason": row.exclusion_reason,
    }

