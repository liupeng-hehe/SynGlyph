# Phase 1: English letter-sequence MLE reproducibility

This document describes the **default stimulus freeze** path, **canonical vs legacy** JSONL, **feedback** semantics, **deployment** rules, **snapshot-first evaluation**, and **smoke** behavior without a pre-existing model snapshot.

## Default data path (`source_mode=stimulus`)

1. The API loads the same payload as `/api/stimuli/raw-export` (in-process via `get_raw_export_payload`).
2. Samples are converted with `annotation_record_to_sample` (schema v2) as in `scripts/build_letter_sequence_dataset.py`.
3. **Freeze** writes under `artifacts/datasets/<dataset_version_id>/`:
   - `examples.jsonl` — **canonical** rows (single source of truth for hashing).
   - `letter_sequence_samples.jsonl` — **legacy v2** lines derived deterministically from canonical rows for `LetterSequenceDataset` / `train_letter_sequence_model.py`.
   - `manifest.json`, `stats.json`.

The **dataset hash** is SHA-256 over canonical rows only (sorted by `example_id`, stable JSON).

Optional sources `english_db` / `mixed` are reserved; Phase 1 implements **stimulus** only.

## Feedback overlay

Review feedback rows (`model_review_feedback`) are summarized into typed ORM columns on POST/PATCH (`review_feedback_summary`). For training targets:

- **Best-effort** mapping from `(full_text, span)` to a canonical example.
- **Applied** letter-color LAB corrections only when lengths match and LAB values are present (`stats.json` tracks `matched_count`, `unmatched_count`, `applied_count`, `retrain_eligible_count`).

## Training runs

`training_manager` **freezes** a dataset version first, then trains on the frozen `letter_sequence_samples.jsonl` (no post-freeze random re-fetch). On success it:

1. Updates `TrainingRun` with `dataset_version_id` and `git_sha`.
2. Calls **`create_model_snapshot`** (same helper as `POST /api/training/runs/{run_id}/snapshots`).
3. Runs **val** evaluation via `evaluate_snapshot` and persists `ml_evaluation_run`.

## Model snapshots

`create_model_snapshot` writes `artifacts/models/<snapshot_id>/manifest.json` and sets lineage fields (`dataset_version_id`, `git_sha`, `artifact_manifest_uri`, `model_family`, …).

## Offline evaluation (snapshot-first)

Primary path: **`model_snapshot_id`** + **`dataset_version_id`** + split; weights load from `ModelSnapshot.checkpoint_uri`.

- CLI: `scripts/evaluate_model_snapshot.py --model-snapshot-id … --dataset-version-id …`
- `--checkpoint-path` is **debug-only** (bypasses DB checkpoint path).
- `--no-db` prints metrics without writing `ml_evaluation_run`.

## Deployment (champion)

- **`promote_model_snapshot`** (service + `scripts/promote_model_snapshot.py`) deactivates all other active rows for the same `(environment, product_line, task_name, alias)` in one transaction, then inserts one active row.
- **`get_active_deployment`** returns `None` if none, the row if exactly one, and **raises** if more than one active row exists (no silent “pick latest”).

## Inference resolution order

`resolve_letter_sequence_checkpoint` (used by `/api/letter-sequence/predict-*`):

1. Request `checkpoint_path` (debug) if the file exists.
2. Request `snapshot_id` if set.
3. `LETTER_SEQUENCE_CHECKPOINT` (`settings.letter_sequence_checkpoint`).
4. Active **champion** deployment (`SYNGLYPH_ML_ENV` / `settings.ml_environment`, product `english`, task `letter_sequence`, alias `champion`).
5. Latest `ModelSnapshot` by `created_at`.

If step 4 finds **multiple** active deployments, the API returns **500** (ambiguous configuration).

Legacy snapshots without `dataset_version_id` are allowed.

## Smoke test (no pre-existing snapshot)

`scripts/smoke_phase1.py` (run from repo with the API venv, e.g. `cd apps/api && uv run python ../../scripts/smoke_phase1.py`):

- Stable dataset hash + canonical→legacy round-trip.
- Tiny random-initialized checkpoint + `evaluate_snapshot` on a temp JSONL.
- SQLite in-memory checks for `get_active_deployment` (0 / 1 / ambiguous).

## Environment

- `ARTIFACTS_ROOT` — overrides repo `artifacts/` (see `apps/api/app/db.py`).
- `SYNGLYPH_ML_ENV` — deployment environment label (default `dev`).

## Alembic

Revision `p1a2b3c4d5e6_phase1_ml_reproducibility.py` adds `ml_*` tables and Phase 1 columns. SQLite dev DBs also self-heal via `ensure_training_tables` / `_ensure_phase1_ml_tables` in `sqlite_schema.py`.
