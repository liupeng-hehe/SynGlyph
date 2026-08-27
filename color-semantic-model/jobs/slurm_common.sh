#!/usr/bin/env bash
# Shared helpers for colorrec Slurm jobs. Sourced by jobs/*.sbatch (not run directly).

log_banner() {
  echo ""
  echo "================================================================"
  echo " $*"
  echo " $(date -Is)  job=${SLURM_JOB_ID:-local}  host=$(hostname)"
  echo "================================================================"
}

log_step() {
  echo ""
  echo "--- [$(date -Is)] $* ---"
}

py() {
  "${COLORREC_PYTHON:-python}" "$@"
}

run_step() {
  local label="$1"
  shift
  log_step "START: ${label}"
  local t0=$SECONDS
  if declare -F require_colorrec >/dev/null 2>&1; then
    require_colorrec
  fi
  "$@"
  local ec=$?
  log_step "DONE:  ${label} (exit=${ec}, elapsed=$((SECONDS - t0))s)"
  return "${ec}"
}

write_job_meta() {
  local run_id="$1"
  local repo="${REPO:-.}"
  local meta="${repo}/artifacts/logs/${run_id}_slurm_${SLURM_JOB_ID:-local}.json"
  python - <<PY
import json, os, subprocess, sys
from datetime import datetime, timezone
meta = {
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "run_id": "${run_id}",
    "slurm_job_id": os.environ.get("SLURM_JOB_ID"),
    "slurm_job_name": os.environ.get("SLURM_JOB_NAME"),
    "slurm_partition": os.environ.get("SLURM_JOB_PARTITION"),
    "hostname": os.uname().nodename,
    "repo": os.environ.get("REPO"),
    "scratch": os.environ.get("SCRATCH"),
}
try:
    out = subprocess.check_output(
        ["scontrol", "show", "job", os.environ["SLURM_JOB_ID"]],
        text=True, stderr=subprocess.DEVNULL,
    )
    meta["scontrol_snippet"] = out[:2000]
except Exception:
    pass
path = "${meta}"
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=2)
    f.write("\n")
print(f"Wrote job meta: {path}", file=sys.stderr)
PY
}

print_track_hints() {
  local run_id="$1"
  cat <<EOF

================================================================
 Track this run (${run_id})
================================================================
  Slurm log (live):
    tail -f logs/slurm/${SLURM_JOB_NAME:-job}-${SLURM_JOB_ID:-?}.out

  Train summary (after training):
    cat artifacts/eval_reports/hpc_v2_train_summary.md
    cat artifacts/eval_reports/hpc_v2_train_summary.json

  Success review (after job ends):
    cat artifacts/success_review/${run_id}/07_go_no_go_decision.md
    cat artifacts/success_review/${run_id}/04_metrics_baseline_vs_finetuned.md

  Model checkpoint:
    ls -la \${SCRATCH}/models/hpc_color_sentence_transformer_v2/final/
================================================================
EOF
}
