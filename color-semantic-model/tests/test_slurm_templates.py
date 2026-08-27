"""Validate Slurm sbatch templates for Phase 8 HPC."""

from __future__ import annotations

from pathlib import Path

import pytest

JOBS_DIR = Path(__file__).resolve().parents[1] / "jobs"

SBATCH_FILES = sorted(JOBS_DIR.glob("slurm_*.sbatch"))


@pytest.mark.parametrize("sbatch_path", SBATCH_FILES, ids=lambda p: p.name)
def test_slurm_prologue(sbatch_path: Path) -> None:
    text = sbatch_path.read_text(encoding="utf-8")
    assert "set -euo pipefail" in text
    assert "source scripts/psc_bridges2_env.sh" in text
    assert "source jobs/slurm_common.sh" in text


@pytest.mark.parametrize("sbatch_path", SBATCH_FILES, ids=lambda p: p.name)
def test_slurm_output_logs(sbatch_path: Path) -> None:
    text = sbatch_path.read_text(encoding="utf-8")
    assert "#SBATCH --output=logs/slurm/%x-%j.out" in text
    assert "#SBATCH --error=logs/slurm/%x-%j.out" in text
    assert "#SBATCH --chdir=" in text


def test_preprocess_is_cpu_only() -> None:
    text = (JOBS_DIR / "slurm_preprocess.sbatch").read_text(encoding="utf-8")
    assert "#SBATCH --gres=gpu" not in text
    assert "build_candidate_bank" in text
    assert "inspect_candidate_bank" in text
    assert "build_training_pairs" in text
    assert "RM-shared" in text


def test_smoke_uses_smoke_config() -> None:
    text = (JOBS_DIR / "slurm_train_single_gpu_smoke.sbatch").read_text(encoding="utf-8")
    assert "configs/hpc_v2_smoke.yaml" in text
    assert "--run_id hpc_v2_smoke" in text
    assert "#SBATCH --time=02:00:00" in text
    assert "GPU-shared" in text
    assert "gpu:v100-32:1" in text


def test_full_train_uses_hpc_v2_config() -> None:
    text = (JOBS_DIR / "slurm_train_single_gpu_v2.sbatch").read_text(encoding="utf-8")
    assert "configs/hpc_v2.yaml" in text
    assert "hpc_v2_smoke" not in text
    assert "--run_id hpc_v2" in text
    assert "#SBATCH --time=12:00:00" in text
    assert "tee -a artifacts/logs/hpc_v2_train.log" in text


def test_embed_eval_job_steps() -> None:
    text = (JOBS_DIR / "slurm_embed_eval_v2.sbatch").read_text(encoding="utf-8")
    assert "embed_candidates" in text
    assert "baseline_retrieval" in text
    assert "--skip-embed" in text
    assert "fine_tuned_eval" in text
    assert "compare_runs" in text
    assert "success_review" in text


def test_slurm_common_helpers_exist() -> None:
    text = (JOBS_DIR / "slurm_common.sh").read_text(encoding="utf-8")
    assert "run_step" in text
    assert "print_track_hints" in text
