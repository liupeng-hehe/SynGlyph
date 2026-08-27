"""Tests for baseline vs fine-tuned compare report."""

from __future__ import annotations

import json

import pytest

from omegaconf import OmegaConf

from colorrec.evaluation.compare_runs import (
    build_all_metrics_tables,
    build_metrics_table,
    collect_warnings,
    find_metrics_row,
    lookup_metric_delta,
    metric_delta_from_reports,
    run_compare_runs,
)


def _report(split: str, r1: float, *, mode: str = "exact") -> dict:
    block = {
        "recall@1": r1,
        "recall@3": r1 + 0.1,
        "recall@5": r1 + 0.2,
        "recall@10": r1 + 0.3,
        "mrr@10": r1 + 0.05,
        "ndcg@10": r1 + 0.05,
    }
    return {
        "split": split,
        "skipped_queries": 0,
        "metrics": {
            "exact": block,
            "anchor_group": {k: min(v + 0.1, 1.0) for k, v in block.items()},
            "family_soft": {k: min(v + 0.2, 1.0) for k, v in block.items()},
        },
    }


def test_build_metrics_table_delta() -> None:
    baseline = {"val": _report("val", 0.5)}
    finetuned = {"val": _report("val", 0.7)}
    rows = build_metrics_table(baseline, finetuned, ["val"])
    assert rows[0]["delta_recall@1"] == pytest.approx(0.2)


def test_missing_metadata_holdout_warning(tmp_path) -> None:
    cfg = OmegaConf.create({"paths": {}})
    baseline = {"val": _report("val", 0.5)}
    finetuned = {"val": _report("val", 0.6)}
    rows = build_metrics_table(baseline, finetuned, ["val"])
    warnings = collect_warnings(cfg, baseline, finetuned, rows)
    assert any("Metadata holdout is missing" in w for w in warnings)


def test_run_compare_runs_writes_md(tmp_path) -> None:
    baseline = {
        "val": _report("val", 0.5),
        "test": _report("test", 0.6),
    }
    finetuned = {
        "val": _report("val", 0.7),
        "test": _report("test", 0.65),
    }
    baseline_qual = {"prompts": {"q": [{"rank": 1, "name": "A", "hex": "#000", "family": "red"}]}}
    finetuned_qual = {"prompts": {"q": [{"rank": 1, "name": "B", "hex": "#111", "family": "blue"}]}}

    cfg = OmegaConf.create(
        {
            "paths": {
                "baseline_retrieval_json": str(tmp_path / "baseline.json"),
                "fine_tuned_retrieval_json": str(tmp_path / "finetuned.json"),
                "baseline_qualitative_json": str(tmp_path / "base_qual.json"),
                "fine_tuned_qualitative_json": str(tmp_path / "fine_qual.json"),
                "compare_report_md": str(tmp_path / "compare.md"),
            }
        }
    )
    (tmp_path / "baseline.json").write_text(json.dumps(baseline), encoding="utf-8")
    (tmp_path / "finetuned.json").write_text(json.dumps(finetuned), encoding="utf-8")
    (tmp_path / "base_qual.json").write_text(json.dumps(baseline_qual), encoding="utf-8")
    (tmp_path / "fine_qual.json").write_text(json.dumps(finetuned_qual), encoding="utf-8")

    out = run_compare_runs(cfg)
    md = out.read_text(encoding="utf-8")
    assert "Fine-Tuned vs Baseline Retrieval" in md
    assert "anchor_group" in md
    assert "family_soft" in md


def test_build_all_metrics_tables_modes() -> None:
    baseline = {"metadata_val": _report("metadata_val", 0.01)}
    finetuned = {"metadata_val": _report("metadata_val", 0.05)}
    rows = build_all_metrics_tables(baseline, finetuned, ["metadata_val"])
    modes = {r["mode"] for r in rows}
    assert modes == {"exact", "anchor_group", "family_soft"}


def test_metadata_test_family_soft_delta_helpers() -> None:
    baseline = {"metadata_test": _report("metadata_test", 0.10)}
    finetuned = {"metadata_test": _report("metadata_test", 0.30)}
    rows = build_all_metrics_tables(baseline, finetuned, ["metadata_test"])
    row = find_metrics_row(rows, "metadata_test", "family_soft")
    assert row is not None
    delta = lookup_metric_delta(rows, "metadata_test", "family_soft", "recall@5")
    assert delta is not None
    assert delta == pytest.approx(row["delta_recall@5"])
    direct = metric_delta_from_reports(baseline, finetuned, "metadata_test", "family_soft", "recall@5")
    assert direct == pytest.approx(delta)


def test_compare_md_includes_metadata_test_family_soft(tmp_path) -> None:
    baseline = {
        "metadata_test": _report("metadata_test", 0.10),
    }
    finetuned = {
        "metadata_test": _report("metadata_test", 0.25),
    }
    baseline_qual = {"prompts": {}}
    finetuned_qual = {"prompts": {}}
    cfg = OmegaConf.create(
        {
            "paths": {
                "baseline_retrieval_json": str(tmp_path / "baseline.json"),
                "fine_tuned_retrieval_json": str(tmp_path / "finetuned.json"),
                "baseline_qualitative_json": str(tmp_path / "base_qual.json"),
                "fine_tuned_qualitative_json": str(tmp_path / "fine_qual.json"),
                "compare_report_md": str(tmp_path / "compare.md"),
            }
        }
    )
    (tmp_path / "baseline.json").write_text(json.dumps(baseline), encoding="utf-8")
    (tmp_path / "finetuned.json").write_text(json.dumps(finetuned), encoding="utf-8")
    (tmp_path / "base_qual.json").write_text(json.dumps(baseline_qual), encoding="utf-8")
    (tmp_path / "fine_qual.json").write_text(json.dumps(finetuned_qual), encoding="utf-8")

    out = run_compare_runs(cfg)
    md = out.read_text(encoding="utf-8")
    family_section = md.split("## Metrics delta — family_soft", 1)[1]
    assert "| metadata_test | recall@5 |" in family_section
