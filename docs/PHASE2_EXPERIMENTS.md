# Phase 2: English letter-sequence ML experiments

## Goals

1. Under the **same annotation budget**, compare **sampling strategies** (random vs uncertainty v1).
2. Under the **same sampling setup**, compare **model families** (`mlp`, `bilstm`, `transformer_encoder`).

Scope: `product_line = english`, `task_name = letter_sequence` only. No Chinese ML, no diversity/stratified/human-guided AL in this phase.

## Canonical `model_family` ids

Use **only** these strings in checkpoints, `model_snapshot.model_family`, and experiment configs:

- `mlp`
- `bilstm`
- `transformer_encoder`

Legacy Phase 1 values such as `letter_sequence_bilstm` are **normalized to** `bilstm` on load. Display names belong in UI/docs only.

## Experiment matrix (minimum)

|  | `mlp` | `bilstm` | `transformer_encoder` |
|--|-------|----------|------------------------|
| `random` | ✓ | ✓ | ✓ |
| `uncertainty` | ✓ | ✓ | ✓ |

Run multiple **random seeds** (e.g. 3) per cell for variance.

## Sampling strategies

- **random**: uniform random acquisition from the unlabeled pool (deterministic given `random_seed`).
- **uncertainty** (v1): acquisition score = **mean binary entropy** of `sigmoid(pred_boundary)` over **valid boundary positions** only (`uncertainty_v1_boundary_entropy`). No prom/spread proxies in v1 (reserved for ablations / TODO).

## Model families

- **mlp**: Minimal features: char + position embeddings; `is_first` / `is_last`; normalized word length; optional left/right neighbor char embeddings. Per-token MLP trunk; same heads as BiLSTM.
- **bilstm**: Existing `LetterSequenceBiLSTM` (default when `model_family` is missing in old checkpoints).
- **transformer_encoder**: Encoder-only `nn.TransformerEncoder` (non-autoregressive, **no decoder**). Small/medium configs only; `d_model` is padded to a multiple of `nhead` via a linear projection when needed.

## Frozen data

Experiments read **only** Phase 1 frozen artifacts:

- `artifacts/datasets/{dataset_version_id}/examples.jsonl` (canonical)
- `artifacts/datasets/{dataset_version_id}/letter_sequence_samples.jsonl` (legacy)

Do not re-fetch live DB during simulation.

## Active learning simulator

- Implementation: `letter_sequence.al.simulate_active_learning.run_active_learning_simulation`.
- Training uses **`letter_sequence.training.train_loop.run_training`** in-process (not a training subprocess inside the simulator).
- CLI scripts are thin wrappers around the same library entry points.

## Artifact layout (per experiment run)

Directory: `artifacts/experiments/{experiment_run_id}/`

Required files:

| File | Purpose |
|------|---------|
| `experiment_config.json` | Includes `dataset_version_id`, `model_family`, `sampling_strategy`, budget fields, `random_seed`, `git_sha`, etc. |
| `dataset_version_ref.json` | Points at frozen dataset paths / manifest. |
| `round_metrics.jsonl` | One JSON object per training round. |
| `acquisition_log.jsonl` | Picked `example_id`s per round. |
| `final_summary.json` | Aggregated outcome + pointers to cost/latency. |

## Slice analysis (fixed thresholds)

Code: `letter_sequence.eval.experiment_metrics`. **Do not change thresholds between runs** without versioning.

**Word length** (by letter count `L`):

- `short`: `L <= 3`
- `medium`: `4 <= L <= 7`
- `long`: `L >= 8`

**Boundary density** (fraction of boundary positions with target `> 0.5` among valid `T-1` positions):

- `low`: density `< 0.25`
- `high`: density `>= 0.25`

## Latency protocol (`cost.latency`)

Default measurement: `letter_sequence.eval.experiment_metrics.measure_inference_latency_ms`.

Fixed fields recorded in output:

- `device` (default `cpu`)
- `batch_size` (default `8`)
- `warmup` forward passes (default `3`)
- `measurement_repeats` (default `10`)
- Synthetic batch content derived from fixed short words (`cat`, `hello`, `testing`)

## Scripts

- `scripts/train_model_family.py` — train one family on a frozen dataset version.
- `scripts/run_active_learning_experiment.py` — one AL run.
- `scripts/run_experiment_grid.py` — full grid; supports `--skip-existing` if `final_summary.json` is already present for a deterministic run id.

## Limitations / TODO

- Uncertainty v1 is boundary-only; prom/spread/MC dropout/ensemble are future work.
- No stratified/diversity/human-in-the-loop sampling.
- Transformer is an encoder baseline, not a generative LM.
- `frequency_bucket` / `token_position_bucket` optional / not in v1.
