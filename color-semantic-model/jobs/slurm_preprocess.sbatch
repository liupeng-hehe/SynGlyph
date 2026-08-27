#!/bin/bash
#SBATCH --job-name=colorrec_preprocess
#SBATCH -A mat250018p
#SBATCH -p RM-shared
#SBATCH --cpus-per-task=8
#SBATCH --mem=32G
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
source scripts/psc_bridges2_env.sh
source jobs/slurm_common.sh

log_banner "colorrec preprocess (CPU)"
write_job_meta "hpc_v2_preprocess"

require_colorrec

run_step "build_candidate_bank" \
  py -m colorrec.data.build_candidate_bank --config configs/hpc_v2.yaml
run_step "inspect_candidate_bank" \
  py -m colorrec.data.inspect_candidate_bank --config configs/hpc_v2.yaml
run_step "build_training_pairs" \
  py -m colorrec.data.build_training_pairs --config configs/hpc_v2.yaml

log_banner "preprocess finished OK"
ls -la artifacts/train_pairs/train_pairs.jsonl artifacts/candidate_bank/candidate_colors.parquet
