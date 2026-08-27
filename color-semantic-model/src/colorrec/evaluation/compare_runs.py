"""Compare baseline vs fine-tuned retrieval reports."""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from typing import Any

from omegaconf import DictConfig

from colorrec.config import get_path, load_config, resolve_path
from colorrec.evaluation.evaluate_retrieval import METRIC_MODES, get_split_metrics
from colorrec.evaluation.metadata_holdout import metadata_holdout_available
from colorrec.logging_utils import setup_logging

logger = logging.getLogger(__name__)

METRIC_KEYS = [
    "recall@1",
    "recall@3",
    "recall@5",
    "recall@10",
    "mrr@10",
    "ndcg@10",
]

SPLIT_LABELS = {
    "val": "val",
    "test": "test",
    "metadata_val": "metadata_val",
    "metadata_test": "metadata_test",
}


def _load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def metric_delta(baseline: float, finetuned: float) -> float:
    return finetuned - baseline


def build_metrics_table(
    baseline: dict[str, Any],
    finetuned: dict[str, Any],
    splits: list[str],
    *,
    mode: str = "exact",
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for split in splits:
        b = baseline.get(split, {})
        f = finetuned.get(split, {})
        if not b or not f:
            continue
        row: dict[str, Any] = {
            "split": SPLIT_LABELS.get(split, split),
            "mode": mode,
        }
        b_metrics = get_split_metrics(b, mode)
        f_metrics = get_split_metrics(f, mode)
        for key in METRIC_KEYS:
            b_val = float(b_metrics.get(key, 0.0))
            f_val = float(f_metrics.get(key, 0.0))
            row[f"baseline_{key}"] = b_val
            row[f"finetuned_{key}"] = f_val
            row[f"delta_{key}"] = metric_delta(b_val, f_val)
        row["baseline_skipped"] = int(b.get("skipped_queries", 0))
        row["finetuned_skipped"] = int(f.get("skipped_queries", 0))
        rows.append(row)
    return rows


def build_all_metrics_tables(
    baseline: dict[str, Any],
    finetuned: dict[str, Any],
    splits: list[str],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for mode in METRIC_MODES:
        rows.extend(build_metrics_table(baseline, finetuned, splits, mode=mode))
    return rows


def find_metrics_row(
    rows: list[dict[str, Any]],
    split: str,
    mode: str,
) -> dict[str, Any] | None:
    label = SPLIT_LABELS.get(split, split)
    for row in rows:
        if row.get("split") == label and row.get("mode") == mode:
            return row
    return None


def lookup_metric_delta(
    rows: list[dict[str, Any]],
    split: str,
    mode: str,
    metric_key: str = "recall@5",
) -> float | None:
    row = find_metrics_row(rows, split, mode)
    if row is None:
        return None
    key = f"delta_{metric_key}"
    if key not in row:
        return None
    return float(row[key])


def metric_delta_from_reports(
    baseline: dict[str, Any],
    finetuned: dict[str, Any],
    split: str,
    mode: str,
    metric_key: str = "recall@5",
) -> float | None:
    """Compute a single metric delta directly from retrieval JSON reports."""
    b_report = baseline.get(split)
    f_report = finetuned.get(split)
    if not b_report or not f_report:
        return None
    b_val = get_split_metrics(b_report, mode).get(metric_key)
    f_val = get_split_metrics(f_report, mode).get(metric_key)
    if b_val is None or f_val is None:
        return None
    return metric_delta(float(b_val), float(f_val))


def _top3(hits: list[dict[str, Any]]) -> list[str]:
    out: list[str] = []
    for hit in hits[:3]:
        out.append(f"{hit.get('name')} {hit.get('hex')} ({hit.get('family')})")
    return out


def build_qualitative_comparison(
    baseline_qual: dict[str, Any],
    finetuned_qual: dict[str, Any],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    base_prompts = baseline_qual.get("prompts", {})
    fine_prompts = finetuned_qual.get("prompts", {})
    for prompt in base_prompts:
        rows.append(
            {
                "prompt": prompt,
                "baseline_top3": _top3(base_prompts.get(prompt, [])),
                "finetuned_top3": _top3(fine_prompts.get(prompt, [])),
            }
        )
    return rows


def collect_warnings(
    cfg: DictConfig,
    baseline: dict[str, Any],
    finetuned: dict[str, Any],
    rows: list[dict[str, Any]],
) -> list[str]:
    warnings: list[str] = []
    if not metadata_holdout_available(cfg):
        warnings.append("Metadata holdout is missing; metadata_val/metadata_test not compared.")
    elif "metadata_val" not in finetuned and "metadata_test" not in finetuned:
        warnings.append("Fine-tuned report missing metadata holdout splits.")

    for split_key, report in finetuned.items():
        if split_key in {"qualitative", "model"}:
            continue
        if isinstance(report, dict) and int(report.get("skipped_queries", 0)) > 0:
            warnings.append(
                f"Fine-tuned {split_key} has {report['skipped_queries']} skipped queries."
            )

    exact_rows = [r for r in rows if r.get("mode") == "exact"]
    for row in exact_rows:
        delta_r1 = row.get("delta_recall@1", 0.0)
        if delta_r1 <= -0.15:
            warnings.append(
                f"Strong regression on {row['split']} (exact): delta recall@1 = {delta_r1:.3f}"
            )
    return warnings


def render_compare_markdown(
    rows: list[dict[str, Any]],
    qualitative_rows: list[dict[str, Any]],
    warnings: list[str],
) -> str:
    lines = ["# Fine-Tuned vs Baseline Retrieval", ""]
    if warnings:
        lines.extend(["## Warnings", ""])
        for w in warnings:
            lines.append(f"- {w}")
        lines.append("")

    for mode in METRIC_MODES:
        mode_rows = [r for r in rows if r.get("mode") == mode]
        if not mode_rows:
            continue
        lines.extend(
            [
                f"## Metrics delta — {mode}",
                "",
                "| split | metric | baseline | fine-tuned | delta |",
                "| --- | --- | ---: | ---: | ---: |",
            ]
        )
        for row in mode_rows:
            split = row["split"]
            for key in METRIC_KEYS:
                lines.append(
                    f"| {split} | {key} | {row[f'baseline_{key}']:.4f} | "
                    f"{row[f'finetuned_{key}']:.4f} | {row[f'delta_{key}']:+.4f} |"
                )
        lines.append("")

    lines.extend(["## Qualitative top-3 before/after", ""])
    for item in qualitative_rows:
        lines.append(f"### {item['prompt']}")
        lines.append("")
        lines.append(f"- Baseline: {', '.join(item['baseline_top3']) or 'n/a'}")
        lines.append(f"- Fine-tuned: {', '.join(item['finetuned_top3']) or 'n/a'}")
        lines.append("")

    return "\n".join(lines) + "\n"


def run_compare_runs(cfg: DictConfig) -> Path:
    baseline_path = get_path(cfg, "baseline_retrieval_json")
    finetuned_path = get_path(cfg, "fine_tuned_retrieval_json")
    baseline_qual_path = get_path(cfg, "baseline_qualitative_json")
    finetuned_qual_path = get_path(cfg, "fine_tuned_qualitative_json")
    out_path = get_path(cfg, "compare_report_md")

    baseline = _load_json(baseline_path)
    finetuned = _load_json(finetuned_path)
    baseline_qual = _load_json(baseline_qual_path)
    finetuned_qual = _load_json(finetuned_qual_path)

    splits = ["val", "test", "metadata_val", "metadata_test"]
    rows = build_all_metrics_tables(baseline, finetuned, splits)
    qual_rows = build_qualitative_comparison(baseline_qual, finetuned_qual)
    warnings = collect_warnings(cfg, baseline, finetuned, rows)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        render_compare_markdown(rows, qual_rows, warnings),
        encoding="utf-8",
    )
    logger.info("Wrote compare report: %s", out_path)
    return out_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare baseline vs fine-tuned retrieval reports.")
    parser.add_argument("--config", type=str, default="configs/local_debug.yaml")
    return parser.parse_args()


def main() -> None:
    setup_logging()
    args = parse_args()
    cfg = load_config(resolve_path(args.config))
    run_compare_runs(cfg)


if __name__ == "__main__":
    main()
