# Manual data download guide

This project does **not** redistribute third-party datasets. Place raw files locally under `data/raw/`.

## xkcd Color Survey (`rgb.txt`)

**Required for xkcd candidate colors.**

1. Obtain the xkcd color survey `rgb.txt` file (tab-separated color name + hex).
2. Save it at:

```
data/raw/xkcd/rgb.txt
```

Example:

```bash
curl -fsSL "https://xkcd.com/color/rgb.txt" -o data/raw/xkcd/rgb.txt
```

## Color-Pedia (Hugging Face)

**Phase 2+ candidate source.**

Dataset: [`boltuix/color-pedia`](https://huggingface.co/datasets/boltuix/color-pedia)

### Option A — Online (compute node with internet)

```bash
pip install -e ".[color_pedia]"
python -m colorrec.data.build_candidate_bank --config configs/local_debug.yaml
```

Set in config:

```yaml
data:
  sources:
    color_pedia: true
  color_pedia:
    dataset_name: boltuix/color-pedia
    cache_dir: data/cache/huggingface
```

### Option B — Offline (recommended for HPC)

1. On a machine with internet, download or export the dataset.
2. Save one or more files under:

```
data/raw/color_pedia/
  colors.parquet   # or .csv / .json / .jsonl
```

3. Enable in config:

```yaml
data:
  sources:
    color_pedia: true
  color_pedia:
    local_dir: data/raw/color_pedia
```

The loader auto-detects columns using configurable `column_candidates` (see `configs/base.yaml`). Schema inspection is saved to `data/raw/color_pedia/schema_inspection.json`.

## NRC Word–Colour Association Lexicon

**Phase 3 optional source.**

- Download manually from the official NRC distribution (respect license terms).
- Place CSV/TSV/TXT/JSON files under `data/raw/nrc_word_colour/`.
- Enable in config:

```yaml
data:
  training_pairs:
    enabled_sources:
      nrc_word_colour: true
```

If the directory is missing or empty, the builder logs a warning and continues.

## Colors in Context

**Phase 7 hard negatives (not implemented yet).**

- Obtain according to original license requirements.
- Place under `data/raw/colors_in_context/`.

## User curated pairs

**Phase 3 high-weight source.**

```
data/raw/user_curated/user_pairs.csv
```

Supported CSV schemas:

**Schema A:** `anchor_text,positive_color_name,positive_hex,positive_descriptor,color_family,weight`

**Schema B:** `query,preferred_hexes,rejected_hexes`

If the file is missing, the builder logs a warning and continues.
