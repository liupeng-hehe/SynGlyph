#!/usr/bin/env bash
# PSC Bridges-2 environment for color-semantic-model (colorrec).
#
# Usage (login node — variables persist in your shell):
#   source /ocean/projects/mat250018p/lvlvmei/SynGlyph/color-semantic-model/scripts/psc_bridges2_env.sh
#
# Or from repo root after cd:
#   source scripts/psc_bridges2_env.sh
#
# Do NOT run with ./psc_bridges2_env.sh — that starts a subshell and exports are lost.
#
# Safe when the caller uses `set -u` (Slurm sbatch): defaults are applied before any
# bare $SCRATCH / $REPO expansion.

# Re-apply venv after `module load cuda` (Anaconda modules prepend their bin/ to PATH).
rebind_colorrec_venv() {
  export PATH="$VENV_DIR/bin:${PATH//$VENV_DIR\/bin:/}"
  export COLORREC_PYTHON="$VENV_DIR/bin/python"
  hash -r 2>/dev/null || true
}

require_colorrec() {
  rebind_colorrec_venv
  if ! "$COLORREC_PYTHON" -c "import colorrec" 2>/dev/null; then
    echo "ERROR: colorrec not importable." >&2
    echo "  COLORREC_PYTHON=$COLORREC_PYTHON" >&2
    echo "  which python=$(command -v python || echo missing)" >&2
    echo "  Fix: pip install -e \"$REPO/.[train,color_pedia,dev]\" inside $VENV_DIR" >&2
    return 1 2>/dev/null || exit 1
  fi
}

# --- paths (edit PROJECT if your allocation path differs) ---
: "${PROJECT:=/ocean/projects/mat250018p/lvlvmei}"
: "${REPO:=$PROJECT/SynGlyph/color-semantic-model}"
: "${SCRATCH:=$PROJECT/colorrec}"
export PROJECT REPO SCRATCH
export VENV_DIR="${VENV_DIR:-$PROJECT/venvs/colorrec-312}"

# --- pip / build temp on Ocean (avoid $HOME quota) ---
export TMPDIR="${TMPDIR:-$PROJECT/tmp}"
export PIP_CACHE_DIR="${PIP_CACHE_DIR:-$PROJECT/pip-cache}"

# --- Hugging Face cache (scp'd from local or prefetch on login node) ---
export HF_HOME="${HF_HOME:-$REPO/data/cache/huggingface}"
export HF_DATASETS_CACHE="${HF_DATASETS_CACHE:-$REPO/data/cache/huggingface}"
export TRANSFORMERS_CACHE="${TRANSFORMERS_CACHE:-$REPO/data/cache/huggingface}"

# --- runtime dirs ---
mkdir -p "$SCRATCH/models" "$SCRATCH/logs" "$TMPDIR" "$PIP_CACHE_DIR" \
  "$REPO/logs/slurm" "$REPO/artifacts/logs"

# --- leave conda base so (colorrec-312) is the active Python ---
if command -v conda >/dev/null 2>&1; then
  conda deactivate >/dev/null 2>&1 || true
  conda deactivate >/dev/null 2>&1 || true
fi

if [[ ! -f "$VENV_DIR/bin/activate" ]]; then
  echo "psc_bridges2_env: venv not found at $VENV_DIR" >&2
  echo "  Create with: python3 -m venv $VENV_DIR && source $VENV_DIR/bin/activate && pip install -e \"$REPO/.[train,color_pedia,dev]\"" >&2
  return 1 2>/dev/null || exit 1
fi

# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"
cd "$REPO" || return 1 2>/dev/null || exit 1
rebind_colorrec_venv

echo "colorrec env ready: REPO=$REPO"
echo "  python: $(which python)"
echo "  COLORREC_PYTHON=$COLORREC_PYTHON"
echo "  SCRATCH=$SCRATCH  HF_HOME=$HF_HOME"
