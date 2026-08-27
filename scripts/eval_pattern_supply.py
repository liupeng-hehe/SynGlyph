"""Offline evaluation: random vs uncertainty-only vs pattern-supply-offline."""

from __future__ import annotations

import json
import os
import random
import uuid
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

os.environ.setdefault("PYTHONPATH", str(Path(__file__).resolve().parents[1] / "apps" / "api"))

from app.models.annotation import Annotation  # noqa: E402
from app.models.stimulus import Stimulus  # noqa: E402
from app.services.active_learning_scoring import compute_hybrid_al_scores  # noqa: E402
from app.services.pattern_supply.offline_index_store import active_version_row  # noqa: E402
from app.services.pattern_supply.orchestrator import run_pattern_supply  # noqa: E402
from app.services.pattern_supply.pattern_extraction import extract_pattern_features  # noqa: E402
from app.services.pattern_supply.contracts import RawCandidateDTO  # noqa: E402


@dataclass
class EvalConfig:
    selected_list_id: str
    budgets: tuple[int, ...] = (100, 300, 500)
    top_k: int = 20
    seeds: int = 5


def _pattern_units(words: list[str]) -> set[str]:
    out: set[str] = set()
    for w in words:
        row = RawCandidateDTO(
            word=w,
            normalized_word=w.lower(),
            lemma=None,
            sources=[],
            source_confidence=0.0,
            generation_signals={},
            provider_payload_refs={},
        )
        f = extract_pattern_features(row)
        for bi in f.get("bigrams", []):
            out.add(f"bigram:{bi}")
        sx = f.get("suffix_2")
        if isinstance(sx, str):
            out.add(f"suffix:{sx}")
    return out


def _annotation_cost(word: str) -> float:
    return max(1.0, len(word) / 4.0)


def _sample_pool(db: Session, selected_list_id: str) -> list[str]:
    return [
        r[0]
        for r in db.query(Stimulus.text)
        .filter(Stimulus.dataset_id == selected_list_id, Stimulus.language == "en")
        .all()
    ]


def _already_annotated(db: Session, selected_list_id: str) -> set[str]:
    rows = (
        db.query(Stimulus.text)
        .join(Annotation, Annotation.stimulus_id == Stimulus.id)
        .filter(Stimulus.dataset_id == selected_list_id)
        .all()
    )
    return {r[0] for r in rows if r[0]}


def evaluate_strategy(db: Session, cfg: EvalConfig, strategy: str, seed: int) -> dict[str, float]:
    rng = random.Random(seed)
    pool = _sample_pool(db, cfg.selected_list_id)
    annotated = _already_annotated(db, cfg.selected_list_id)
    target_units = _pattern_units(pool)
    covered_before = _pattern_units(list(annotated))
    picked: list[str] = []

    budget = max(cfg.budgets)
    while len(picked) < budget:
        if strategy == "random":
            candidates = [w for w in pool if w not in annotated and w not in picked]
            if not candidates:
                break
            rng.shuffle(candidates)
            batch = candidates[: cfg.top_k]
        elif strategy == "uncertainty_only":
            rows = compute_hybrid_al_scores(
                db,
                limit=cfg.top_k,
                selected_list_id=cfg.selected_list_id,
                exclude_existing=True,
                exclude_selected=False,
            ).rows
            batch = [r.text for r in rows if r.text not in picked]
            if not batch:
                break
        elif strategy == "pattern_supply_offline_index":
            out = run_pattern_supply(
                db,
                selected_list_id=cfg.selected_list_id,
                top_k=cfg.top_k,
                seed_terms=["color", "emotion", "language"],
                exclude_existing=True,
                exclude_selected=True,
            )
            batch = [r.word for r in out.rows if r.word not in picked]
            if not batch:
                break
        else:
            raise ValueError(f"unknown strategy: {strategy}")
        picked.extend(batch[: max(0, budget - len(picked))])

    covered_after = _pattern_units(list(annotated) + picked)
    delta = len(covered_after - covered_before)
    target = max(1, len(target_units))
    gain = delta / target
    total_cost = sum(_annotation_cost(w) for w in picked) or 1.0
    return {
        "coverage_gain": float(gain),
        "annotation_cost_efficiency": float(delta / total_cost),
        "picked": float(len(picked)),
    }


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    db_url = os.environ.get("DATABASE_URL", f"sqlite:///{repo / 'apps' / 'api' / 'synglyph.db'}")
    selected_list_id = os.environ.get("SELECTED_LIST_ID", "")
    if not selected_list_id:
        raise SystemExit("SELECTED_LIST_ID is required")

    engine = create_engine(db_url, connect_args={"check_same_thread": False} if db_url.startswith("sqlite") else {})
    session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    cfg = EvalConfig(selected_list_id=selected_list_id)
    metrics: dict[str, list[dict[str, float]]] = {
        "random": [],
        "uncertainty_only": [],
        "pattern_supply_offline_index": [],
    }
    offline_index_version = None
    with session() as db:
        active = active_version_row(db)
        offline_index_version = active.version if active else None
        for i in range(cfg.seeds):
            for s in metrics:
                metrics[s].append(evaluate_strategy(db, cfg, s, i))

    summary = {}
    for k, rows in metrics.items():
        summary[k] = {
            "coverage_gain_mean": sum(r["coverage_gain"] for r in rows) / max(1, len(rows)),
            "annotation_cost_efficiency_mean": sum(r["annotation_cost_efficiency"] for r in rows) / max(1, len(rows)),
        }

    out_dir = repo / "artifacts" / "evals" / "pattern_supply" / str(uuid.uuid4())
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "metrics.json").write_text(
        json.dumps(
            {
                "config": cfg.__dict__,
                "offline_index_version": offline_index_version,
                "metrics": metrics,
                "summary": summary,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    summary_path = repo / "artifacts" / "evals" / "pattern_supply" / "summary.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"saved: {out_dir / 'metrics.json'}")


if __name__ == "__main__":
    main()

