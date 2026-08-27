"""Tests for success review folder generator."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml
from omegaconf import OmegaConf

from colorrec.evaluation.compare_runs import build_all_metrics_tables, build_metrics_table
from colorrec.evaluation.success_review import (
    DECISION_GREEN,
    DECISION_RED,
    VERDICT_IMPROVED,
    VERDICT_REGRESSED,
    VERDICT_UNCHANGED_GOOD,
    build_artifact_manifest,
    build_qualitative_verdicts,
    classify_prompt_verdict,
    decide_go_no_go,
    generate_success_review,
    load_review_context,
)


def _metrics_report(r1: float, r10: float) -> dict:
    block = {
        "recall@1": r1,
        "recall@3": r1 + 0.1,
        "recall@5": r1 + 0.15,
        "recall@10": r10,
        "mrr@10": r1 + 0.05,
        "ndcg@10": r1 + 0.05,
    }
    return {
        "skipped_queries": 0,
        "metrics": {
            "exact": block,
            "anchor_group": {k: min(v + 0.08, 1.0) for k, v in block.items()},
            "family_soft": {k: min(v + 0.15, 1.0) for k, v in block.items()},
        },
    }


def _qual_prompt(name: str, family: str, score: float = 0.5) -> dict:
    return {
        "rank": 1,
        "name": name,
        "hex": "#AABBCC",
        "family": family,
        "source": "xkcd",
        "score": score,
        "descriptor": "test descriptor",
    }


def _write_toy_artifacts(root: Path) -> None:
    eval_dir = root / "eval"
    eval_dir.mkdir(parents=True)
    train_dir = root / "train"
    train_dir.mkdir(parents=True)
    model_dir = root / "model" / "final"
    model_dir.mkdir(parents=True)
    (model_dir / "config.json").write_text("{}", encoding="utf-8")

    baseline = {
        "val": _metrics_report(0.5, 0.9),
        "test": _metrics_report(0.6, 0.92),
        "metadata_val": _metrics_report(0.01, 0.03),
        "metadata_test": _metrics_report(0.01, 0.04),
    }
    finetuned = {
        "val": _metrics_report(0.8, 0.95),
        "test": _metrics_report(0.85, 0.98),
        "metadata_val": _metrics_report(0.05, 0.12),
        "metadata_test": _metrics_report(0.06, 0.14),
    }
    (eval_dir / "baseline_retrieval.json").write_text(json.dumps(baseline), encoding="utf-8")
    (eval_dir / "fine_tuned_retrieval.json").write_text(json.dumps(finetuned), encoding="utf-8")

    prompts = list(OmegaConf.create({}).keys())  # placeholder
    expected = {
        "passionate and intense": "red",
        "calm professional healthcare brand": "blue",
        "fresh organic skincare": "green",
        "quiet luxury": "purple",
        "playful summer festival": "yellow",
        "dark mysterious cinematic mood": "black",
        "warm nostalgic jazz poster": "orange",
        "clean minimal tech product": "white",
        "earthy handmade coffee brand": "brown",
        "romantic soft feminine palette": "pink",
    }
    base_qual = {"prompts": {}}
    fine_qual = {"prompts": {}}
    for prompt, fam in expected.items():
        base_qual["prompts"][prompt] = [_qual_prompt(f"Base{i}", fam, 0.4 - i * 0.01) for i in range(3)]
        fine_qual["prompts"][prompt] = [_qual_prompt(f"Fine{i}", fam, 0.5 - i * 0.01) for i in range(3)]
    (eval_dir / "baseline_qualitative.json").write_text(json.dumps(base_qual), encoding="utf-8")
    (eval_dir / "fine_tuned_qualitative.json").write_text(json.dumps(fine_qual), encoding="utf-8")

    (eval_dir / "train_summary.json").write_text(
        json.dumps(
            {
                "model_name": "fake-model",
                "loss": "mnrl",
                "train_pairs": 100,
                "epochs": 1,
                "batch_size": 8,
                "lr": 2e-5,
                "final_model_dir": str(model_dir),
            }
        ),
        encoding="utf-8",
    )
    (train_dir / "stats.md").write_text(
        "# stats\n- Total pairs: **100**\n- Passed: **True**\n- train: **80**\n- val: **10**\n- test: **10**\n",
        encoding="utf-8",
    )
    (root / "inspection.json").write_text(
        json.dumps({"summary": {"total_rows": 50, "count_by_source": {"xkcd": 50}}}),
        encoding="utf-8",
    )


def _toy_cfg(root: Path) -> OmegaConf:
    return OmegaConf.create(
        {
            "project": {"seed": 42},
            "model": {"name": "fake-model"},
            "train": {"final_model_dir": str(root / "model" / "final")},
            "evaluation": {
                "success_review": {
                    "output_dir": str(root / "success_review"),
                    "expected_prompt_families": {
                        "passionate and intense": ["red", "orange", "pink"],
                        "calm professional healthcare brand": ["blue", "green", "grey", "white"],
                        "fresh organic skincare": ["green", "white", "brown"],
                        "quiet luxury": ["black", "purple", "brown", "yellow", "white", "grey"],
                        "playful summer festival": ["yellow", "orange", "pink", "red"],
                        "dark mysterious cinematic mood": ["black", "blue", "purple"],
                        "warm nostalgic jazz poster": ["orange", "brown", "red", "yellow"],
                        "clean minimal tech product": ["white", "grey", "blue"],
                        "earthy handmade coffee brand": ["brown", "orange", "white", "black"],
                        "romantic soft feminine palette": ["pink", "red", "purple", "white"],
                    },
                    "thresholds": {
                        "min_acceptable_prompts": 7,
                        "max_regressed_prompts": 2,
                        "metadata_exact_r10_min_delta": 0.02,
                        "xkcd_r10_max_regression": 0.02,
                    },
                },
            },
            "paths": {
                "baseline_retrieval_json": str(root / "eval" / "baseline_retrieval.json"),
                "fine_tuned_retrieval_json": str(root / "eval" / "fine_tuned_retrieval.json"),
                "baseline_qualitative_json": str(root / "eval" / "baseline_qualitative.json"),
                "fine_tuned_qualitative_json": str(root / "eval" / "fine_tuned_qualitative.json"),
                "train_summary_json": str(root / "eval" / "train_summary.json"),
                "train_pair_stats": str(root / "train" / "stats.md"),
                "candidate_bank_inspection_json": str(root / "inspection.json"),
                "candidate_embeddings": str(root / "missing_embeddings.npy"),
            },
        }
    )


EXPECTED_FILES = [
    "00_README.md",
    "01_artifact_manifest.md",
    "02_data_quality.md",
    "03_training_summary.md",
    "04_metrics_baseline_vs_finetuned.md",
    "05_qualitative_review.md",
    "06_failure_cases.md",
    "07_go_no_go_decision.md",
    "success_criteria.yaml",
    "run_metadata.json",
    "reproduce_commands.sh",
    "model_card.md",
]


def test_generate_success_review_folder(tmp_path) -> None:
    _write_toy_artifacts(tmp_path)
    cfg = _toy_cfg(tmp_path)
    out = generate_success_review(cfg, run_id="test_run", config_path=tmp_path / "cfg.yaml", pytest_passed=True)
    assert out.is_dir()
    for name in EXPECTED_FILES:
        assert (out / name).exists(), f"missing {name}"


def test_missing_optional_artifacts_no_crash(tmp_path) -> None:
    _write_toy_artifacts(tmp_path)
    cfg = _toy_cfg(tmp_path)
    ctx = load_review_context(cfg, run_id="x", output_dir=tmp_path / "out", config_path=tmp_path / "cfg.yaml")
    assert any("Missing artifact" in w for w in ctx.warnings)


def test_artifact_manifest_exists_flags(tmp_path) -> None:
    _write_toy_artifacts(tmp_path)
    cfg = _toy_cfg(tmp_path)
    manifest = build_artifact_manifest(cfg)
    baseline = next(e for e in manifest if e.key == "baseline_retrieval_json")
    assert baseline.exists is True
    missing = [e for e in manifest if not e.exists]
    assert missing


def test_metrics_delta(tmp_path) -> None:
    _write_toy_artifacts(tmp_path)
    baseline = json.loads((tmp_path / "eval" / "baseline_retrieval.json").read_text())
    finetuned = json.loads((tmp_path / "eval" / "fine_tuned_retrieval.json").read_text())
    rows = build_metrics_table(baseline, finetuned, ["val"])
    assert rows[0]["delta_recall@1"] == pytest.approx(0.3)


def test_qualitative_family_heuristic() -> None:
    expected = ["brown", "orange"]
    baseline = [_qual_prompt("x", "blue")]
    improved = [_qual_prompt("coffee", "brown")]
    assert classify_prompt_verdict("q", baseline, improved, expected) == VERDICT_IMPROVED
    regressed = [_qual_prompt("x", "blue")]
    assert classify_prompt_verdict("q", improved, regressed, expected) == VERDICT_REGRESSED


def test_wine_red_not_family_mismatch_for_red_prompt() -> None:
    expected = ["red", "orange", "pink"]
    baseline = [
        _qual_prompt("blood", "red", 0.52),
        _qual_prompt("Ecstatic Red", "pink", 0.51),
        _qual_prompt("deep red", "red", 0.50),
    ]
    finetuned = [
        {
            **_qual_prompt("Wine Red #B85282", "grey", 0.63),
            "hsl": [350.0, 0.35, 0.52],
        },
        {
            **_qual_prompt("Maroonish Red (Approximate) #A21151", "grey", 0.62),
            "hsl": [330.0, 0.8, 0.35],
        },
        {
            **_qual_prompt("Wine Red #D02B5C", "grey", 0.61),
            "hsl": [340.0, 0.7, 0.45],
        },
    ]
    verdict = classify_prompt_verdict("passionate and intense", baseline, finetuned, expected)
    assert verdict in {VERDICT_UNCHANGED_GOOD, VERDICT_IMPROVED}
    assert verdict != VERDICT_REGRESSED


def test_sage_green_not_family_mismatch_for_green_prompt() -> None:
    expected = ["green", "white", "brown"]
    baseline = [_qual_prompt("sage", "green", 0.39) for _ in range(3)]
    finetuned = [
        _qual_prompt("fresh green", "green", 0.40),
        _qual_prompt("light sage", "green", 0.38),
        {
            **_qual_prompt("Sage Green #B4CB16 #B4CB16", "yellow", 0.36),
            "hsl": [68.0, 0.78, 0.45],
        },
    ]
    verdict = classify_prompt_verdict("fresh organic skincare", baseline, finetuned, expected)
    assert verdict != VERDICT_REGRESSED


def test_qualitative_verdict_includes_heuristic_reason(tmp_path) -> None:
    _write_toy_artifacts(tmp_path)
    cfg = _toy_cfg(tmp_path)
    ctx = load_review_context(cfg, run_id="x", output_dir=tmp_path / "out", config_path=tmp_path / "cfg.yaml")
    assert ctx.qualitative_verdicts
    assert all("heuristic_reason" in item for item in ctx.qualitative_verdicts)


def test_decision_green_yellow_red(tmp_path) -> None:
    _write_toy_artifacts(tmp_path)
    cfg = _toy_cfg(tmp_path)
    ctx = load_review_context(cfg, run_id="x", output_dir=tmp_path / "out", config_path=tmp_path / "cfg.yaml")
    ctx.pytest_passed = True
    decide_go_no_go(ctx)
    assert ctx.decision == DECISION_GREEN

    ctx.metrics_rows[0]["delta_recall@10"] = -0.5
    decide_go_no_go(ctx)
    assert ctx.decision == DECISION_RED

    ctx.metrics_rows[0]["delta_recall@10"] = 0.05
    ctx.qualitative_verdicts = [{"verdict": VERDICT_REGRESSED} for _ in range(5)]
    decide_go_no_go(ctx)
    assert ctx.decision == DECISION_RED


def test_run_metadata_and_reproduce(tmp_path) -> None:
    _write_toy_artifacts(tmp_path)
    cfg = _toy_cfg(tmp_path)
    out = generate_success_review(cfg, run_id="meta_run", config_path=tmp_path / "local_debug.yaml")
    meta = json.loads((out / "run_metadata.json").read_text())
    assert meta["run_id"] == "meta_run"
    assert "timestamp" in meta
    assert "config_path" in meta
    sh = (out / "reproduce_commands.sh").read_text()
    assert "success_review" in sh
    assert (out / "reproduce_commands.sh").stat().st_mode & 0o111


def test_success_review_shows_soft_metrics(tmp_path) -> None:
    _write_toy_artifacts(tmp_path)
    cfg = _toy_cfg(tmp_path)
    out = generate_success_review(cfg, run_id="soft_metrics", config_path=tmp_path / "cfg.yaml", pytest_passed=True)
    md = (out / "04_metrics_baseline_vs_finetuned.md").read_text(encoding="utf-8")
    assert "anchor_group metrics" in md
    assert "family_soft metrics" in md
    family_section = md.split("## family_soft metrics", 1)[1]
    assert "| metadata_test | recall@5 |" in family_section


def test_success_review_go_no_go_shows_metadata_test_family_soft(tmp_path) -> None:
    _write_toy_artifacts(tmp_path)
    cfg = _toy_cfg(tmp_path)
    out = generate_success_review(cfg, run_id="family_soft_go", config_path=tmp_path / "cfg.yaml", pytest_passed=True)
    md = (out / "07_go_no_go_decision.md").read_text(encoding="utf-8")
    assert "metadata_test family_soft R@5" in md
    assert "| metadata_test family_soft R@5 |" in md
    assert "—" not in md.split("metadata_test family_soft R@5")[1].split("\n")[0]


def test_success_criteria_yaml_written(tmp_path) -> None:
    _write_toy_artifacts(tmp_path)
    cfg = _toy_cfg(tmp_path)
    out = generate_success_review(cfg, run_id="criteria_run")
    data = yaml.safe_load((out / "success_criteria.yaml").read_text())
    assert data["engineering"]["require_pytest_passed"] is True
    assert "metrics" in data
