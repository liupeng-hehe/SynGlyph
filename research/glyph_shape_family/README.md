# Glyph shape-family (skeleton → features → UMAP)

Unsupervised, explainable **shape** features from lowercase skeleton PNGs (black background, bright strokes). No color in the fit; no deep learning, no OCR, no word-level tasks.

## Install

```bash
cd research/glyph_shape_family
python3 -m venv .venv      # requires Python >= 3.9; 3.11+ recommended for some optional wheels (numba/umap)
source .venv/bin/activate
python -m pip install -e ".[dev]"
```

Optional **HDBSCAN** (otherwise `run_umap.py` defaults to k-means):

```bash
pip install -e ".[cluster]"
```

For **Python 3.13+**, `umap-learn` may pull `numba` without a wheel; use 3.11/3.12 or a conda environment if `pip` tries to compile `numba` from source.

## Data assumptions

- One PNG per glyph instance; filename supplies `glyph_label` via regex (default: leading lowercase letter, e.g. `b_01.png` → `b`).
- **SynGlyph web**: on `/glyph-graph`, use **下载当前 skeleton PNG** or **下载全部 skeleton PNG（ZIP）** to get black-on-white PNGs matching this loader; unzip the ZIP into a folder and pass that folder path to `extract_features.py`.
- **Black background, bright skeleton**; loader inverts if the image is mostly white.
- **1-pixel-wide skeleton** is assumed. If strokes are thick, thin first (e.g. scikit-image skeletonize) before export.
- **Normalize** crops to foreground bbox, scales so bbox height matches `--ref-height`, then pads to a square canvas (`--canvas-h` / `--canvas-w` override). This reduces scale mismatch but does not recover true typography baseline/x-height unless you bake that into the PNG.

### Coordinate risks

| Risk | Mitigation in this package |
|------|---------------------------|
| Inconsistent scale | `normalize_canvas` scales the **longer** bbox side to `ref_height` (default 64) and keeps a 1px-thin bbox dimension at 1px so lines do not become solid blocks. |
| Unknown baseline / x-height | Ascender/descender use **heuristic** top/bottom thirds on the normalized canvas; `normalize_heuristic_baseline` is logged as `1.0` in features. |
| Thick strokes | Degree-based stats are wrong on thick masks; thin to 1px first. |
| Rotation / large slant | Not corrected; prefer upright skeletons. |

## Feature modes

- **`raw`** (default in `extract_features.py`): all numeric columns, including `normalize_*` metadata columns.
- **`family`**: columns that de-emphasize signed left–right asymmetry (`loop_side_signed` dropped; `loop_side_abs` kept). Optional `--fold-vprof` averages symmetric vertical-profile bins.
- **`full`**: includes `loop_side_signed` and all batch-2 columns present in the CSV.

Batch-2 fields `has_crossbar`, `has_diagonal_cross`, `has_serpentine_or_zigzag` are **NaN stubs** until implemented; UMAP script imputes with 0.

## Scripts

**1. Extract features**

```bash
python scripts/extract_features.py /path/to/pngs -o features.csv --mode family --ref-height 64 --meta-jsonl meta.jsonl
```

**2. 2D embedding + clustering**

Default is **PCA** (no extra deps). For **UMAP**: `pip install -e ".[umap]"` then `--embedder umap`.

```bash
python scripts/run_umap.py features.csv -o umap_out --prefix run1 --cluster kmeans --embedder pca
# UMAP:  pip install -e ".[umap]"  then  --embedder umap
# HDBSCAN: pip install -e ".[cluster]"  then  --cluster hdbscan
```

Outputs:

- `run1_embedding.csv` — original columns + `umap_x`, `umap_y`, `cluster_id`
- `run1_umap.png` — scatter with **glyph_label** annotations
- `run1_cluster_summary.csv` — counts per (`cluster_id`, `glyph_label`)

`--color-csv` is reserved for a future **overlay** (metadata only; never used in `fit`).

## Explain label clusters with features (reverse screening)

If you already have a **label column** (e.g. color cluster id, or any categorical group), score which skeleton features align with label separation. The column must exist in `features.csv` **or** be supplied via `--labels-csv` (see below). `extract_features.py` does **not** add color columns by default.

```bash
# Example if you merged a column named color_cluster into features.csv
python scripts/analyze_label_clusters.py features.csv --label-column color_cluster -o label_analysis_out
```

Merge labels from a separate CSV (joined on `source_path` by default):

```bash
python scripts/analyze_label_clusters.py features.csv \
  --labels-csv colors.csv --join-on source_path --label-column cluster_id -o label_analysis_out
```

Outputs include `screen_composite_ranking.csv` (default prefix `screen`), per-method CSVs, `screen_report.md`, and `screen_meta.json`. Methods: RandomForest Gini importance, permutation importance, mutual information, ANOVA F, Kruskal–Wallis, plus a **composite** rank (mean of normalized ranks). Use `--exclude-columns` to drop extra fields from X; `--n-jobs -1` uses all CPU cores for RF/permutation.

**Caveat:** if labels are almost 1:1 with `glyph_label`, results may reflect letter identity rather than pure shape; interpret accordingly.

### Labels from SynGlyph API (no manual CSV edit)

The API aggregates **per-letter average LAB** from word annotations: `GET /api/letter-priors`. The script can fetch this, run **K-means in Lab space** (one cluster id per letter), merge onto rows by `glyph_label`, and **exclude** the raw LAB columns from screening to avoid trivial leakage (clusters were fit from LAB).

```bash
# API must be running (e.g. pnpm dev:api). Optional: SYNGLYPH_API_URL=http://localhost:8000
export SYNGLYPH_API_URL=http://127.0.0.1:8000
python scripts/analyze_label_clusters.py features.csv --from-letter-priors-api -o label_analysis_out
```

Optional: `--dataset-ids <uuid1,uuid2>` to restrict which datasets feed letter priors; `--color-clusters-k 8` sets requested K (capped by number of letters with data). Writes `label_analysis_out/features_with_color_labels.csv` and `letter_priors_api_meta.json`.

## Manual validation (structure families)

Use **family mode** UMAP and check whether these pairs move closer (qualitative; not a metric objective):

| Family | Letters | UMAP expectation (family mode) |
|--------|---------|--------------------------------|
| Upper bowl | b, d | Closer than in full space if mirror is de-emphasized |
| Lower bowl | p, q, (g single-bowl) | Same |
| Single loop | o, a (single) | Near other loops |
| Humps | n, m, h, r, u | Often separate from bowls |
| Stem / marks | l, i, j, t, f | Often high stem / dot signals |
| Open curves | c, e, s | Fewer loops, open profiles |
| Diagonal / angular | v, w, x, y, z, k | Often asymmetric profiles |

**Sanity checks**

1. **Full mode**: b vs d and p vs q should be **more separable** than in family mode (signed lateral information).
2. **A/B**: rerun with/without fixed `--canvas-h/--canvas-w` to see sensitivity to padding.
3. Inspect outliers: wrong filename labels or broken skeletons often explain bad neighbors.

## Tests

```bash
python -m pytest tests/ -q
```

## Layout

| Module | Role |
|--------|------|
| `glyph_shape_family/io.py` | PNG load + binarize |
| `glyph_shape_family/normalize.py` | Crop, scale, pad + metadata |
| `glyph_shape_family/geometry.py` | 8-CC, degrees, projections |
| `glyph_shape_family/loops_cycles.py` | Cycle count on largest skeleton CC |
| `glyph_shape_family/features_core.py` | Feature dict + CSV row |
| `glyph_shape_family/feature_modes.py` | `family` / `full` column sets |
| `scripts/extract_features.py` | Batch PNG → CSV |
| `scripts/run_umap.py` | CSV → UMAP + clusters + PNG |
| `glyph_shape_family/analysis/label_screening.py` | Supervised screening: label → feature importance |
| `glyph_shape_family/integrations/letter_priors_client.py` | Fetch `GET /api/letter-priors`, Lab K-means → `color_cluster` |
| `scripts/analyze_label_clusters.py` | CLI for label screening + CSV/Markdown report |
