"""Resume-style sentences from metric facts (no LLM)."""

from __future__ import annotations

from typing import Any


def sentence_mae_improvement(metric_key: str, reduction_pct: float, baseline_label: str = "previous checkpoint") -> str:
    label = metric_key.replace("mae_", "").replace("_", " ").strip() or metric_key
    if reduction_pct >= 0:
        return (
            f"Validation MAE ({label}) error reduced by {reduction_pct:.1f}% vs {baseline_label} "
            "(lower is better)."
        )
    return (
        f"Validation MAE ({label}) increased by {-reduction_pct:.1f}% vs {baseline_label} "
        "(regression vs baseline)."
    )


def sentence_accept_rate(rate: float | None) -> str:
    if rate is None:
        return "Accept rate: not enough review feedback in the window yet."
    return f"Model-assisted review: {100.0 * rate:.1f}% of samples accepted as-is."


def sentence_mean_lab_delta(mean_delta: float | None) -> str:
    if mean_delta is None:
        return "Mean Lab correction magnitude: not recorded in this window."
    return f"Mean per-letter Lab delta when editors corrected color: {mean_delta:.3f}."


def sentence_al_vs_random(
    mae_random: float | None,
    mae_uncertainty: float | None,
    dataset_version_id: str | None = None,
) -> str:
    if mae_random is None or mae_uncertainty is None:
        return (
            "AL vs random: ingest offline experiments (random + uncertainty with same budget) "
            "via rollup_metrics.py to compare final MAE."
        )
    ds = f" on dataset {dataset_version_id}" if dataset_version_id else ""
    if mae_uncertainty < mae_random:
        return (
            f"Uncertainty sampling achieved lower final MAE (boundary proxy) than random "
            f"({mae_uncertainty:.4f} vs {mae_random:.4f}){ds}."
        )
    return (
        f"Random baseline final MAE {mae_random:.4f} vs uncertainty {mae_uncertainty:.4f}{ds} "
        "(see experiment artifacts for label-budget curves)."
    )


def build_summary_cards(facts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Turn flat fact dicts into titled card payloads for the UI."""
    cards: list[dict[str, Any]] = []
    for f in facts:
        key = f.get("metric_key", "")
        if key.endswith("_error_reduction_pct") and f.get("metric_value") is not None:
            cards.append(
                {
                    "title": "Model quality",
                    "body": sentence_mae_improvement(
                        key.replace("_error_reduction_pct", "").replace("_", " "),
                        float(f["metric_value"]),
                    ),
                    "metric_key": key,
                    "value": f["metric_value"],
                }
            )
    return cards
