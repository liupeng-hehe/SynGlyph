# Letter color ↔ structure export & EDA

For **26 single-letter** stimuli (`a`–`z`) with annotations (Lab) and **glyph graph** payloads saved from the web app (`/glyph-graph` → Save).

## 1. Prerequisites

- API running, e.g. `http://localhost:8000`
- **Dataset ID**: copy from the app’s dataset selector (UUID)
- **Graphs**: open `/glyph-graph`, select each letter, click **Save graph to API** (26 times), or at least for letters you care about first

## 2. Install deps

```bash
cd /path/to/SynGlyph
python3 -m venv .venv && source .venv/bin/activate   # optional
pip install -r scripts/letter_color_structure/requirements.txt
```

## 3. Build joint CSV

```bash
export SYNGLYPH_API_URL=http://localhost:8000
export SYNGLYPH_DATASET_ID=your-dataset-uuid-here

python scripts/letter_color_structure/build_joint_table.py \
  --output-dir exports/letter_joint
```

Outputs:

- `letter_colors.csv` — `char`, `stimulus_id`, `L`, `a`, `b`
- `letter_graph_features_wide.csv` — mean-pooled segment features + graph-level stats (`struct_*`)
- `letter_joint.csv` — merge
- `export_meta.json`

## 4. EDA plots

```bash
python scripts/letter_color_structure/run_eda.py \
  --joint-csv exports/letter_joint/letter_joint.csv \
  --output-dir exports/eda
```

Produces `structure_pca.png`, `lab_ab_scatter.png`, and `distance_correlation.txt` (pairwise struct distance vs ΔE).

## Notes

- **Rendering**: structure comes from whatever graph you saved in Graph lab (system font canvas). It is **not** the same raster as the annotate UI unless you align fonts later; for exploratory correlation this is still useful.
- **Baseline**: compare any model to **26-class letter one-hot** (strong baseline for “letter → color”).
