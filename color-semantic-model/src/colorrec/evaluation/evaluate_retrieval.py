"""Retrieval evaluation on val/test training pair splits."""

from __future__ import annotations

import argparse
import json
import logging
import random
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from omegaconf import DictConfig

from colorrec.config import get_path, load_config, resolve_path
from colorrec.data.split_dataset import normalize_anchor
from colorrec.evaluation.metadata_holdout import ensure_metadata_holdout_files
from colorrec.inference.encoder import TextEncoder, load_encoder
from colorrec.inference.search import load_candidate_index, search
from colorrec.logging_utils import setup_logging
from colorrec.schemas import TrainingPair

logger = logging.getLogger(__name__)

SPLIT_PATH_KEYS = {
    "val": "val_pairs",
    "test": "test_pairs",
    "metadata_val": "metadata_val_pairs",
    "metadata_test": "metadata_test_pairs",
}

METRIC_MODES = ("exact", "anchor_group", "family_soft")
METRIC_SUFFIX_KEYS = ["recall@1", "recall@3", "recall@5", "recall@10", "mrr@10", "ndcg@10"]


def load_pairs_jsonl(path: Path) -> list[TrainingPair]:
    pairs: list[TrainingPair] = []
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                pairs.append(TrainingPair.model_validate_json(line))
    return pairs


def build_relevant_set(
    pair: TrainingPair,
    metadata_df: pd.DataFrame,
) -> tuple[set[str], str]:
    """Return exact relevant color_ids and relevance rule name."""
    if pair.positive_color_id:
        return {pair.positive_color_id}, "positive_color_id"

    if pair.positive_hex:
        hex_val = pair.positive_hex.upper()
        ids = set(metadata_df.loc[metadata_df["hex"].astype(str).str.upper() == hex_val, "color_id"].astype(str))
        if ids:
            return ids, "positive_hex"

    if pair.source == "nrc_word_colour":
        family = pair.metadata.get("nrc_family")
        if family:
            ids = set(metadata_df.loc[metadata_df["family"].astype(str) == str(family), "color_id"].astype(str))
            if ids:
                return ids, "nrc_family"

    positive = pair.positive.strip()
    exact = metadata_df.loc[metadata_df["descriptor"].astype(str) == positive, "color_id"].astype(str).tolist()
    if exact:
        return set(exact), "exact_descriptor"

    return set(), "skipped"


def build_anchor_group_index(pairs: list[TrainingPair]) -> dict[str, set[str]]:
    """Map normalized anchor -> all positive_color_id values in the split."""
    index: dict[str, set[str]] = defaultdict(set)
    for pair in pairs:
        if pair.positive_color_id:
            index[normalize_anchor(pair.anchor)].add(pair.positive_color_id)
    return dict(index)


def _expected_family(pair: TrainingPair, metadata_df: pd.DataFrame) -> str | None:
    fam = pair.metadata.get("color_family") or pair.metadata.get("family")
    if fam:
        return str(fam).lower()
    if pair.positive_color_id:
        rows = metadata_df.loc[metadata_df["color_id"].astype(str) == str(pair.positive_color_id), "family"]
        if len(rows):
            return str(rows.iloc[0]).lower()
    return None


def build_family_soft_relevant_set(pair: TrainingPair, metadata_df: pd.DataFrame) -> set[str]:
    """All candidate color_ids sharing the expected color family."""
    family = _expected_family(pair, metadata_df)
    if not family:
        return set()
    mask = metadata_df["family"].astype(str).str.lower() == family
    return set(metadata_df.loc[mask, "color_id"].astype(str))


def get_relevant_for_mode(
    mode: str,
    pair: TrainingPair,
    metadata_df: pd.DataFrame,
    *,
    anchor_group_index: dict[str, set[str]],
    exact_relevant: set[str],
) -> set[str]:
    if mode == "exact":
        return exact_relevant
    if mode == "anchor_group":
        grouped = anchor_group_index.get(normalize_anchor(pair.anchor), set())
        return grouped if grouped else exact_relevant
    if mode == "family_soft":
        soft = build_family_soft_relevant_set(pair, metadata_df)
        return soft if soft else exact_relevant
    raise ValueError(f"Unknown metric mode: {mode}")


def get_split_metrics(report: dict[str, Any], mode: str = "exact") -> dict[str, float]:
    """Read metrics for a mode from a split report (supports legacy flat metrics)."""
    metrics = report.get("metrics", {})
    if isinstance(metrics.get(mode), dict):
        return {k: float(v) for k, v in metrics[mode].items()}
    if mode == "exact" and metrics and "exact" not in metrics:
        return {k: float(v) for k, v in metrics.items() if isinstance(v, (int, float))}
    return {k: 0.0 for k in METRIC_SUFFIX_KEYS}


def recall_at_k(relevant: set[str], retrieved_ids: list[str], k: int) -> float:
    if not relevant:
        return 0.0
    return 1.0 if relevant.intersection(retrieved_ids[:k]) else 0.0


def mrr_at_k(relevant: set[str], retrieved_ids: list[str], k: int) -> float:
    for i, rid in enumerate(retrieved_ids[:k], start=1):
        if rid in relevant:
            return 1.0 / i
    return 0.0


def ndcg_at_k(relevant: set[str], retrieved_ids: list[str], k: int) -> float:
    dcg = 0.0
    for i, rid in enumerate(retrieved_ids[:k], start=1):
        if rid in relevant:
            dcg += 1.0 / np.log2(i + 1)
    ideal = min(len(relevant), k)
    if ideal == 0:
        return 0.0
    idcg = sum(1.0 / np.log2(i + 2) for i in range(ideal))
    return float(dcg / idcg) if idcg > 0 else 0.0


def _empty_metric_sums(ks: list[int]) -> dict[str, float]:
    sums = {f"recall@{k}": 0.0 for k in ks}
    sums["mrr@10"] = 0.0
    sums["ndcg@10"] = 0.0
    return sums


def _accumulate_metrics(
    sums: dict[str, float],
    relevant: set[str],
    retrieved_ids: list[str],
    ks: list[int],
) -> None:
    for k in ks:
        sums[f"recall@{k}"] += recall_at_k(relevant, retrieved_ids, k)
    sums["mrr@10"] += mrr_at_k(relevant, retrieved_ids, 10)
    sums["ndcg@10"] += ndcg_at_k(relevant, retrieved_ids, 10)


def _finalize_metrics(metric_sums: dict[str, dict[str, float]], evaluated: int) -> dict[str, dict[str, float]]:
    if evaluated == 0:
        return {mode: {k: 0.0 for k in sums} for mode, sums in metric_sums.items()}
    return {
        mode: {k: v / evaluated for k, v in sums.items()}
        for mode, sums in metric_sums.items()
    }


def _resolve_pairs_path(cfg: DictConfig, split: str) -> Path:
    if split.startswith("metadata_"):
        ensure_metadata_holdout_files(cfg)
    path_key = SPLIT_PATH_KEYS[split]
    return get_path(cfg, path_key)


def evaluate_split(
    cfg: DictConfig,
    split: str,
    *,
    encoder: TextEncoder | None = None,
    embeddings_path: Path | None = None,
    metadata_path: Path | None = None,
    model_path: str | None = None,
    model_name: str | None = None,
) -> dict[str, Any]:
    split = split.lower()
    if split not in SPLIT_PATH_KEYS:
        raise ValueError(f"split must be one of {sorted(SPLIT_PATH_KEYS)}")

    pairs_path = _resolve_pairs_path(cfg, split)
    pairs = load_pairs_jsonl(pairs_path)

    emb_path = embeddings_path or get_path(cfg, "candidate_embeddings")
    meta_path = metadata_path or get_path(cfg, "candidate_metadata")
    embeddings, metadata = load_candidate_index(emb_path, meta_path)

    enc = encoder or load_encoder(cfg, model_path=model_path)
    ks = [int(k) for k in cfg.evaluation.get("ks", [1, 3, 5, 10])]
    max_k = max(ks + [10])
    normalize = bool(cfg.inference.get("normalize_embeddings", True))

    anchor_group_index = build_anchor_group_index(pairs)
    metric_sums = {mode: _empty_metric_sums(ks) for mode in METRIC_MODES}

    evaluated = 0
    skipped = 0
    skip_reasons: Counter[str] = Counter()
    source_counts: Counter[str] = Counter()
    family_counts: Counter[str] = Counter()
    examples: list[dict[str, Any]] = []

    for pair in pairs:
        source_counts[pair.source] += 1
        if pair.metadata.get("family"):
            family_counts[str(pair.metadata["family"])] += 1
        elif pair.metadata.get("color_family"):
            family_counts[str(pair.metadata["color_family"])] += 1

        exact_relevant, rule = build_relevant_set(pair, metadata)
        if not exact_relevant:
            skipped += 1
            skip_reasons[rule] += 1
            continue

        query_emb = enc.encode([pair.anchor], normalize_embeddings=normalize, show_progress_bar=False)[0]
        hits = search(query_emb, embeddings, metadata, top_k=max_k)
        retrieved_ids = [str(h["color_id"]) for h in hits]

        for mode in METRIC_MODES:
            relevant = get_relevant_for_mode(
                mode,
                pair,
                metadata,
                anchor_group_index=anchor_group_index,
                exact_relevant=exact_relevant,
            )
            _accumulate_metrics(metric_sums[mode], relevant, retrieved_ids, ks)

        evaluated += 1

        first_relevant_rank = next((h["rank"] for h in hits if str(h["color_id"]) in exact_relevant), None)
        score = 0.0 if first_relevant_rank is None else 1.0 / first_relevant_rank
        examples.append(
            {
                "anchor": pair.anchor,
                "source": pair.source,
                "relevance_rule": rule,
                "expected_color_id": pair.positive_color_id,
                "expected_hex": pair.positive_hex,
                "expected_family": pair.metadata.get("family")
                or pair.metadata.get("nrc_family")
                or pair.metadata.get("color_family"),
                "first_relevant_rank": first_relevant_rank,
                "score": score,
                "top5": hits[:5],
            }
        )

    metrics_by_mode = _finalize_metrics(metric_sums, evaluated)

    worst = sorted(examples, key=lambda x: (x["first_relevant_rank"] is None, -(x["first_relevant_rank"] or 0)))[:30]
    rng = random.Random(int(cfg.project.get("seed", 42)))
    random_examples = examples[:]
    rng.shuffle(random_examples)
    random_examples = random_examples[:30]

    anchor_counts = Counter(p.anchor for p in pairs)
    resolved_model = model_name or model_path or str(cfg.model.name)

    report = {
        "split": split,
        "model": resolved_model,
        "total_queries": len(pairs),
        "evaluated_queries": evaluated,
        "skipped_queries": skipped,
        "skipped_by_reason": dict(skip_reasons),
        "metrics": metrics_by_mode,
        "query_counts_by_source": dict(source_counts),
        "query_counts_by_family": dict(family_counts),
        "unique_anchors": len({p.anchor for p in pairs}),
        "unique_positive_color_id": len({p.positive_color_id for p in pairs if p.positive_color_id}),
        "top_20_anchors": anchor_counts.most_common(20),
        "worst_examples": worst,
        "random_examples": random_examples,
    }
    return report


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Retrieval Report — {report['split']}",
        "",
        f"- Model: `{report['model']}`",
        f"- Total queries: **{report['total_queries']}**",
        f"- Evaluated queries: **{report['evaluated_queries']}**",
        f"- Skipped queries: **{report['skipped_queries']}**",
        "",
    ]

    metrics = report.get("metrics", {})
    if isinstance(metrics.get("exact"), dict):
        for mode in METRIC_MODES:
            mode_metrics = metrics.get(mode, {})
            if not mode_metrics:
                continue
            lines.extend([f"## Metrics — {mode}", ""])
            for name, value in mode_metrics.items():
                lines.append(f"- {name}: **{float(value):.4f}**")
            lines.append("")
    else:
        lines.extend(["## Metrics", ""])
        for name, value in metrics.items():
            lines.append(f"- {name}: **{float(value):.4f}**")
        lines.append("")

    lines.extend(["## Query counts by source", ""])
    for src, cnt in sorted(report.get("query_counts_by_source", {}).items()):
        lines.append(f"- {src}: {cnt}")

    if report.get("query_counts_by_family"):
        lines.extend(["", "## Query counts by family", ""])
        for fam, cnt in sorted(report.get("query_counts_by_family", {}).items()):
            lines.append(f"- {fam}: {cnt}")

    if report.get("skipped_by_reason"):
        lines.extend(["", "## Skipped by reason", ""])
        for reason, cnt in sorted(report["skipped_by_reason"].items()):
            lines.append(f"- {reason}: {cnt}")

    lines.extend(["", "## Top 20 anchors", ""])
    for anchor, cnt in report.get("top_20_anchors", []):
        lines.append(f"- {anchor}: {cnt}")

    lines.extend(["", "## Notes", ""])
    if report["split"].startswith("metadata_"):
        lines.extend(
            [
                "Metadata holdout is a diagnostic split derived from color_pedia_metadata train pairs.",
                "- **exact**: single positive_color_id match",
                "- **anchor_group**: same normalized anchor, any associated color_id",
                "- **family_soft**: same color family as expected candidate",
            ]
        )
    else:
        lines.append(
            "Val/test splits are small and skewed due to grouped split (union-find) to preserve leakage=0."
        )
    return "\n".join(lines) + "\n"


def write_reports(
    cfg: DictConfig,
    report: dict[str, Any],
    *,
    json_path_key: str = "baseline_retrieval_json",
    md_path_key: str = "baseline_retrieval_md",
    suffix: str | None = None,
) -> None:
    json_path = get_path(cfg, json_path_key)
    md_path = get_path(cfg, md_path_key)
    json_path.parent.mkdir(parents=True, exist_ok=True)

    if suffix:
        combined: dict[str, Any] = {}
        if json_path.exists():
            combined = json.loads(json_path.read_text(encoding="utf-8"))
        combined[suffix] = report
        json_path.write_text(json.dumps(combined, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
        md_path.write_text(render_markdown(report), encoding="utf-8")
    else:
        json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
        md_path.write_text(render_markdown(report), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate retrieval on val/test/metadata splits.")
    parser.add_argument("--config", type=str, default="configs/local_debug.yaml")
    parser.add_argument(
        "--split",
        type=str,
        required=True,
        choices=sorted(SPLIT_PATH_KEYS),
    )
    parser.add_argument("--model_path", type=str, default=None)
    parser.add_argument("--embeddings", type=str, default=None, help="Override candidate embeddings .npy")
    parser.add_argument("--output_json", type=str, default=None, help="Override output JSON path")
    return parser.parse_args()


def main() -> None:
    setup_logging()
    args = parse_args()
    cfg = load_config(resolve_path(args.config))
    report = evaluate_split(
        cfg,
        args.split,
        model_path=args.model_path,
        embeddings_path=resolve_path(args.embeddings) if args.embeddings else None,
    )
    if args.output_json:
        out = resolve_path(args.output_json)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
    else:
        write_reports(cfg, report)

    exact = get_split_metrics(report, "exact")
    logger.info(
        "%s split: evaluated=%d skipped=%d exact recall@1=%.4f anchor_group recall@10=%.4f",
        args.split,
        report["evaluated_queries"],
        report["skipped_queries"],
        exact.get("recall@1", 0.0),
        get_split_metrics(report, "anchor_group").get("recall@10", 0.0),
    )


if __name__ == "__main__":
    main()
