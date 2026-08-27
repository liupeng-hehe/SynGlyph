# Metrics taxonomy (HITL) — frozen keys v1

This document defines **stable `metric_key` strings** for [`metric_fact`](apps/api/app/models/metric_fact.py) and rollups. Direction indicates whether **larger numeric values are better** (`up`) or **smaller** (`down`).

## Model quality (from `ml_evaluation_run.metrics_json` / `evaluate_snapshot`)

| metric_key | Source field | Direction | Notes |
|------------|--------------|-----------|--------|
| `mae_lab` | `mae_lab` | down | Mean absolute error, Lab channels |
| `mae_prominence` | `mae_prominence` | down | |
| `mae_spread` | `mae_spread` | down | |
| `mae_boundary` | `mae_boundary` | down | Primary resume-friendly error |
| `n_examples` | `n_examples` | up | Count (diagnostic) |

## Comparisons (derived, same `subject_id` = eval run or experiment)

| metric_key | Direction | Formula (MAE family) |
|------------|-----------|----------------------|
| `mae_boundary_error_reduction_pct` | up | `100 * (MAE_base - MAE_new) / max(MAE_base, ε)` |
| `mae_lab_error_reduction_pct` | up | same pattern |

`comparison_kind`: `none` | `vs_previous_snapshot` | `vs_random_experiment` | `vs_uncertainty_experiment`

`baseline_name`: `""` | `previous_snapshot` | `experiment_random` | `experiment_uncertainty`

## Review feedback (aggregated in `workflow_metrics_snapshot`)

Derived from [`ModelReviewFeedback`](apps/api/app/models/model_review_feedback.py) + [`compute_typed_summary`](apps/api/app/services/review_feedback_summary.py):

| Field | feedback_type / columns | Direction |
|-------|-------------------------|-----------|
| `accept_rate` | `feedback_type == 'accept'` | up |
| `minor_edit_rate` | `minor` | neutral/diagnostic |
| `reject_rate` | `reject` | down |
| `mean_lab_delta` | mean of `lab_delta_mean` where not null | down |
| `mean_boundary_edits` | mean of `boundary_edit_count` | down |

## Active learning (offline experiments)

From `artifacts/experiments/{id}/final_summary.json` last round `metrics`:

| metric_key | Direction | Notes |
|------------|-----------|--------|
| `final_mae_boundary` | down | Last round |
| `final_mae_lab` | down | |

AL vs random **pairwise** rollup (same `dataset_version_id`, `model_family`):  
`label_efficiency_gain_pct` — optional Phase 2; MVP stores separate experiment facts and narrative compares final `mae_boundary`.

## Baseline roles (config / narrative)

- `previous_checkpoint` — prior `model_snapshot` for same dataset version + family  
- `random_sampling` — `sampling_strategy == random` in `final_summary.json`  
- `uncertainty_sampling` — `sampling_strategy == uncertainty` (or project-specific string)  
- `simplest_model` — reserved for scripted small MLP baseline  

## Auditability

- `schema_version`: `metric_fact_v1`, `workflow_snapshot_v1`, `efficiency_observation_v1`  
- `source_artifact_uri`: `file:///…` when ingested from disk  

See [REGISTRY.md](./REGISTRY.md) for workflow entry points.
