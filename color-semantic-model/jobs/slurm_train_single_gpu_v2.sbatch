#!/bin/bash
#SBATCH --job-name=colorrec_hpc_v2_train
#SBATCH -A mat250018p
#SBATCH -p GPU-shared
#SBATCH --gres=gpu:v100-32:1
#SBATCH --cpus-per-task=8
#SBATCH --mem=64G
#SBATCH --time=12:00:00
#SBATCH --chdir=/ocean/projects/mat250018p/lvlvmei/SynGlyph/color-semantic-model
#SBATCH --output=logs/slurm/%x-%j.out
#SBATCH --error=logs/slurm/%x-%j.out
#SBATCH --mail-type=END,FAIL
#SBATCH --mail-user=lvlvmei@andrew.cmu.edu

export PROJECT="${PROJECT:-/ocean/projects/mat250018p/lvlvmei}"
export REPO="${REPO:-$PROJECT/SynGlyph/color-semantic-model}"
export SCRATCH="${SCRATCH:-$PROJECT/colorrec}"

set -euo pipefail
module load cuda
source scripts/psc_bridges2_env.sh
source jobs/slurm_common.sh
require_colorrec

log_banner "colorrec HPC v2 FULL TRAIN (GPU)"
write_job_meta "hpc_v2"
print_track_hints "hpc_v2"

py - <<'PY'
import torch
print("torch", torch.__version__, "cuda_available", torch.cuda.is_available())
if torch.cuda.is_available():
    print("gpu", torch.cuda.get_device_name(0))
PY

run_step "embed_candidates (baseline)" \
  py -m colorrec.inference.embed_candidates --config configs/hpc_v2.yaml --force

run_step "baseline_retrieval" \
  py -m colorrec.evaluation.baseline_retrieval --config configs/hpc_v2.yaml --skip-embed

run_step "train+eval (full)" \
  py -m colorrec.training.train_sentence_transformer \
    --config configs/hpc_v2.yaml \
    --run_eval_after_train 2>&1 | tee -a artifacts/logs/hpc_v2_train.log

run_step "success_review (full)" \
  py -m colorrec.evaluation.success_review \
    --config configs/hpc_v2.yaml \
    --run_id hpc_v2 \
    --pytest_passed true

log_banner "full train finished"
echo ""
echo "=== train_summary ==="
cat artifacts/eval_reports/hpc_v2_train_summary.md 2>/dev/null || cat artifacts/eval_reports/train_summary.md || true
echo ""
echo "=== go/no-go ==="
cat artifacts/success_review/hpc_v2/07_go_no_go_decision.md || true
