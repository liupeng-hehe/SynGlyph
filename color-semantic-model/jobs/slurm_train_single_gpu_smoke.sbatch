#!/bin/bash
#SBATCH --job-name=colorrec_hpc_v2_smoke
#SBATCH -A mat250018p
#SBATCH -p GPU-shared
#SBATCH --gres=gpu:v100-32:1
#SBATCH --cpus-per-task=8
#SBATCH --mem=64G
#SBATCH --time=02:00:00
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

log_banner "colorrec HPC v2 SMOKE (GPU)"
write_job_meta "hpc_v2_smoke"
print_track_hints "hpc_v2_smoke"

py - <<'PY'
import torch
print("torch", torch.__version__, "cuda_available", torch.cuda.is_available())
if torch.cuda.is_available():
    print("gpu", torch.cuda.get_device_name(0))
PY

run_step "train+eval (smoke)" \
  py -m colorrec.training.train_sentence_transformer \
    --config configs/hpc_v2_smoke.yaml \
    --run_eval_after_train

run_step "success_review (smoke)" \
  py -m colorrec.evaluation.success_review \
    --config configs/hpc_v2_smoke.yaml \
    --run_id hpc_v2_smoke \
    --pytest_passed true

log_banner "smoke finished"
cat artifacts/success_review/hpc_v2_smoke/07_go_no_go_decision.md || true
