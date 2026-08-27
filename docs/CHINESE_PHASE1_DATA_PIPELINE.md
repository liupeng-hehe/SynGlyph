# Chinese Phase 1 — ML-ready data pipeline

## 1. Product boundary (English vs Chinese)

- **English** letter-sequence datasets use `product_line=english`, `task_name=letter_sequence`, and the English freeze path (`letter_sequence_dataset_export`).
- **Chinese** glyph–region–transition datasets use `product_line=chinese`, `task_name=glyph_region_annotation`, and `freeze_chinese_dataset_version` in [`apps/api/app/services/chinese_dataset_export.py`](../apps/api/app/services/chinese_dataset_export.py).
- The two lines share **`ml_dataset_version`** and artifact layout under `artifacts/datasets/{dataset_version_id}/`, but **schemas and semantics differ**. Do not mix rows across product lines in one training job without explicit adapters.

## 2. Goals (Phase 1)

Chinese Phase 1 delivers a **frozen, versioned, auditable** canonical layer:

- **Not in scope**: training Chinese models, active learning, experiment grids, deployment UI, inference serving, or a separate Chinese-only dataset registry table.
- **In scope**: `chinese_*` DB + offline glyph JSON / `graphics.txt` → **`examples.jsonl`** (single source of truth) → `manifest.json`, `stats.json`, `quality_report.json`, plus an **`ml_dataset_version`** row.

## 3. Canonical sample (one row = one glyph instance)

- **Granularity**: one `chinese_glyph_instances.id` = one canonical JSON object (one character instance in one annotation session).
- **Stable ids**:
  - `example_id` = SHA-256 hex of `chinese|glyph_region_annotation|{glyph_instance_id}` (see [`chinese_canonical.py`](../apps/api/app/services/chinese_canonical.py)).
  - `region_id` = DB `ChineseRegion.id`; transitions reference **only** these ids.
- **Region order**: sorted by `(z_index asc, region_id asc)` for stable arrays.
- **`region_id_to_index`**: maps each `region_id` to its index in the `regions` array (for future GNN / Set models — **do not** rely on raw array order without this map).
- **Transitions order**: `(source_region_id, target_region_id, transition_id)` lexicographic.
- **`metadata.dictionary_owner`**: from `ChineseDictionary.owner` (namespace owner). It is **not** a general annotator identity; future user ids would be additional fields.
- **`metadata.transform_json`**: parsed from `ChineseGlyphInstance.transform_json` (preserved for future geometric alignment).

## 4. Template merge policy (DB canonical, file fallback)

1. **`ChineseGlyphTemplate` (DB)** is the **authoritative persisted template** (strokes, medians, decomposition, matches).
2. **`load_glyph` / `load_glyph_with_provenance`** ([`chinese_glyph_loader.py`](../apps/api/app/services/chinese_glyph_loader.py)) supplies **fallback** data when DB fields are missing, or the **whole** template when there is **no** DB row (`file_only`).
3. If DB and file **both** supply medians (or strokes) and they **conflict**, **DB values are kept**, and a **`template_db_file_mismatch`** quality issue (`severity: warning`) is emitted — **no silent overwrite**.

`template.template_export_category` in each example is one of: `db_only` | `file_only` | `db_plus_file_patch` | `missing_both`.

## 5. Dataset hash and manifest

- **`dataset_hash`**: SHA-256 over the **sorted** list of canonical objects (sort by `example_id`), with stable JSON (`sort_keys=True`, compact separators). **`created_at` in manifest does not affect the hash.**
- **`split_strategy`**: fixed to **`full_export_v1`**. **`train_count` / `val_count` / `test_count` on `ml_dataset_version` are placeholders** (typically `train_count = example_count`, `val_count = test_count = 0`). They **do not** represent a real train/val/test split in Phase 1. Future work should introduce a new `split_strategy` and explicit split fields in canonical rows if needed.

## 6. `stats.json`

Includes aggregate counts (characters, sessions, regions, transitions, template categories, missing templates, etc.) plus:

- **`region_count_distribution`**: buckets over **regions per glyph instance** (`0`, `1`, `2-3`, `4-6`, `7+`).
- **`stroke_count_distribution`**: buckets over stroke count (`1-5`, `6-10`, …).
- **`template_source_distribution`**: counts of `template_export_category`.
- **`template_file_line_distribution`**: when a file was used, whether resolution was `local_json`, `graphics_txt`, or `none`.

## 7. `quality_report.json`

- **`issues`**: list of objects, each with at least **`code`**, **`severity`** (`error` | `warning` | `info`), **`example_id`**, **`glyph_instance_id`**, and optional **`character`**, **`region_id`**, **`transition_id`**, **`detail`**.
- **`issue_counts`**: keyed by `code:severity`.
- **`summary`**: counts of errors / warnings / infos.

**Severity guidance**: `error` — strong signal to exclude or fix a sample; `warning` / `info` — review.

## 8. Export and QA scripts

From repo root, with `PYTHONPATH` including `apps/api` and `DATABASE_URL` pointing at your DB:

```bash
# Create ml_dataset_version + artifacts
python scripts/export_chinese_dataset_version.py [--source-cutoff-at ISO8601]

# Re-scan examples.jsonl for quality (and optionally rewrite quality_report.json)
python scripts/check_chinese_dataset_quality.py --dataset-version-id <uuid> [--write-quality-report]
# or
python scripts/check_chinese_dataset_quality.py --artifact-path artifacts/datasets/<uuid>

# Smoke: export if at least one glyph instance exists
python scripts/smoke_chinese_phase1.py
```

## 9. Why these fields exist (future MLP / Set / GNN)

- **Per-glyph features** (`features.*`): counts, template flags — baselines and tabular models.
- **Regions with bbox / centroid / coarse position**: set or bag-of-regions models.
- **`region_id_to_index` + transitions**: graph edges between region nodes; stable indexing avoids order drift across exports.

## 10. Known limitations and TODO

- **No training** or AL in Phase 1.
- **Full snapshot export** of qualifying instances; **no per-edit event log** in DB yet. A future phase can add `chinese_annotation_events` (or equivalent) and extend export to append event streams; manifest may gain `annotation_event_export` metadata later.
- **Split placeholders** on `ml_dataset_version` must not be read as real evaluation splits.

## 11. Tests

[`apps/api/tests/test_chinese_dataset_export.py`](../apps/api/tests/test_chinese_dataset_export.py) covers deterministic ids/hash, quality shape, and a minimal end-to-end freeze against SQLite.
