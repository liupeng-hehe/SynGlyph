#!/bin/bash
#SBATCH --job-name=colorrec_hpc_v2_embed_eval
#SBATCH -A mat250018p
#SBATCH -p GPU-shared
#SBATCH --gres=gpu:v100-32:1
#SBATCH --cpus-per-task=8
#SBATCH --mem=64G
#SBATCH --time=04:00:00
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

log_banner "colorrec HPC v2 re-embed / eval only (GPU)"
write_job_meta "hpc_v2_embed_eval"
print_track_hints "hpc_v2"

run_step "embed_candidates" \
  py -m colorrec.inference.embed_candidates --config configs/hpc_v2.yaml --force
run_step "baseline_retrieval" \
  py -m colorrec.evaluation.baseline_retrieval --config configs/hpc_v2.yaml --skip-embed
run_step "fine_tuned_eval" \
  py -m colorrec.evaluation.fine_tuned_eval --config configs/hpc_v2.yaml
run_step "compare_runs" \
  py -m colorrec.evaluation.compare_runs --config configs/hpc_v2.yaml
run_step "success_review" \
  py -m colorrec.evaluation.success_review \
    --config configs/hpc_v2.yaml \
    --run_id hpc_v2 \
    --pytest_passed true

log_banner "embed/eval finished"
cat artifacts/success_review/hpc_v2/07_go_no_go_decision.md || true
