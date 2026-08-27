#!/usr/bin/env bash
# Quick status for the latest colorrec Slurm job (run on login node after: source scripts/psc_bridges2_env.sh)
set -euo pipefail

REPO="${REPO:-/ocean/projects/mat250018p/lvlvmei/SynGlyph/color-semantic-model}"
cd "$REPO"

echo "=== Slurm queue (lvlvmei) ==="
squeue -u "${USER:-lvlvmei}" -o "%.10i %.12j %.8T %.10M %.6D %R" 2>/dev/null || squeue -u "${USER:-lvlvmei}"

echo ""
echo "=== Latest slurm logs ==="
ls -lt logs/slurm/*.out 2>/dev/null | head -5 || echo "(no logs yet)"

LATEST="$(ls -t logs/slurm/*.out 2>/dev/null | head -1 || true)"
if [[ -n "${LATEST}" ]]; then
  echo ""
  echo "=== tail ${LATEST} ==="
  tail -30 "${LATEST}"
fi

echo ""
echo "=== Artifacts ==="
for f in \
  artifacts/train_pairs/train_pairs.jsonl \
  artifacts/eval_reports/hpc_v2_train_summary.md \
  artifacts/success_review/hpc_v2/07_go_no_go_decision.md \
  artifacts/success_review/hpc_v2_smoke/07_go_no_go_decision.md
do
  if [[ -f "$f" ]]; then
    echo "  OK  $f"
  else
    echo "  --  $f"
  fi
done

MODEL="${SCRATCH:-/ocean/projects/mat250018p/lvlvmei/colorrec}/models/hpc_color_sentence_transformer_v2/final"
if [[ -d "$MODEL" ]]; then
  echo "  OK  $MODEL"
  ls -la "$MODEL" | head -5
else
  echo "  --  $MODEL"
fi
