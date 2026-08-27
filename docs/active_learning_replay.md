# Offline active learning replay

This document explains how **replay** works in `letter_sequence`, how to run baselines and policy tuning, and how to read outputs.

## Protocol

- **Partitions** (from frozen canonical `examples.jsonl`):
  - **L0**: initial labeled seed (sampled from `split=train`).
  - **U**: remaining train examples — labels exist in JSONL but are treated as **hidden** until acquired.
  - **V**: `split=val` — used for `val_loss` (multitask loss, same definition as training).
  - **T**: `split=test` — optional one-shot evaluation at the end of the run.

- **Rounds** (deterministic given `random_seed`):
  1. Evaluate **val_loss_before** on **V** using the previous round checkpoint (none on round 0).
  2. **Train** on the current labeled set (see training modes below).
  3. **val_loss_after** — multitask validation loss after training.
  4. **Acquire** a batch from **U** using the selected acquisition mode.
  5. **Reveal** labels for acquired ids (they join the labeled set).

- **Instability (hybrid, offline)**: rolling histories of boundary and segment-attribute uncertainty per example id across rounds; **0** until both histories have length ≥ 2 (`instability_score_replay_cold`). No DB history.

- **Training modes** (do not mix when comparing policies):
  - `from_scratch`: no `init_checkpoint_path` (fresh weights each round).
  - `warm_start`: `train.init_checkpoint_path` points to the previous round `letter_sequence.pt`.

## Acquisition modes

| Mode | Behavior |
|------|----------|
| `random` | Uniform random batch from **U**. |
| `legacy_boundary_only` | Boundary entropy only (legacy simulator). |
| `hybrid` | Five-feature hybrid aligned with online scoring (no KB blend offline in v1). |

Compare new policies against **all** of: `random`, `legacy_boundary_only`, and `hybrid` under the **same** protocol and budget.

## Objectives

- **Primary (default)**: `cumulative_delta_val_loss / cumulative_labeling_cost` (see `final_summary.json`: `primary_objective_cumulative_delta_val_per_cost`).
- **Secondary**: final `val_loss`, improvement vs random at the same budget, cost to reach a target `val_loss` (post-process from `round_metrics.jsonl`).

## Artifacts (per run directory)

- `experiment_manifest.json` — dataset path/hash, seeds, splits, model family, training config, replay mode, acquisition mode, policy snapshot, timestamp, git SHA (if available).
- `policy_config.json` — policy parameters and derived weights.
- `experiment_config.json` — run parameters.
- `round_metrics.jsonl` — one JSON object per round (metrics, val losses, costs).
- `round_metrics.csv` — flattened round metrics for plotting.
- `final_summary.json` — aggregates + optional one-shot test metrics.

## Commands

**Baseline (legacy wrapper → replay)** — maps `uncertainty` → `legacy_boundary_only`, `from_scratch`:

```bash
cd packages/letter_sequence
PYTHONPATH=. python -c "
from letter_sequence.al.simulate_active_learning import run_active_learning_simulation
run_active_learning_simulation(
  dataset_version_id='<YOUR_DATASET_ID>',
  model_family='bilstm',
  sampling_strategy='uncertainty',
  max_rounds=3,
  max_labeled_total=40,
)
"
```

**Hybrid replay** (direct):

```bash
PYTHONPATH=packages/letter_sequence python -c "
from letter_sequence.al.replay import run_active_learning_replay
from letter_sequence.al.policy_config import AcquisitionPolicyConfig
run_active_learning_replay(
  dataset_version_id='<YOUR_DATASET_ID>',
  model_family='bilstm',
  acquisition_mode='hybrid',
  replay_training_mode='from_scratch',
  policy=AcquisitionPolicyConfig(),
  max_rounds=3,
)
"
```

**Policy tuning (random search stub)**:

```bash
python scripts/tune_active_learning_policy.py --dataset-version-id <YOUR_DATASET_ID> --trials 3 --out-dir artifacts/al_tuning
```

## Online API (cost / diversity)

Hybrid scoring in the API uses the same normalization + linear score as `letter_sequence.al.acquisition_policy`. Optional behavior is **off by default** (env):

- `SYNGLYPH_AL_ENABLE_COST_AWARE=1` — cost penalty.
- `SYNGLYPH_AL_ENABLE_DIVERSITY_RERANK=1` — lexical diversity rerank (`char_ngram_cosine` or `jaccard`; embedding is not implemented in v1).

## Reproducibility

Re-run with the same `dataset_version_id`, `random_seed`, `replay_training_mode`, `acquisition_mode`, `policy_config.json`, and training config. `experiment_manifest.json` records these fields.

## Scope (phase 1 tuning)

Policy tuning defaults target **BiLSTM**, **fixed splits**, and a **fixed training recipe**. Cross-family transfer is out of scope until policies stabilize.
