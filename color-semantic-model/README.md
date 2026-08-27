# color-semantic-model

English text-to-color recommendation via fine-tuned sentence-transformer retrieval.

This package (`colorrec`) learns mappings between natural language (adjectives, phrases, brand moods) and color swatches by embedding text queries near color descriptor embeddings.

## Phase 0–4 status (current)

Implemented:

- Project skeleton with OmegaConf YAML configs
- Color space utilities (`hex` / `rgb` / `hsl`, family inference)
- Natural-language descriptor generation
- xkcd `rgb.txt` loader
- Color-Pedia loader (Hugging Face + local parquet/csv/json/jsonl)
- Candidate color bank builder merging xkcd + Color-Pedia
- **Candidate bank quality inspection** (descriptor tokens, duplicates, source comparison)
- **Training pair builder** (candidate_self, color_pedia_metadata, user_curated, optional NRC)
- **Grouped train/val/test split** with leakage checks
- **Baseline retrieval** — embed candidates, cosine search, val/test/metadata holdout metrics, qualitative report
- **Sentence-transformer fine-tuning (MNRL)** — local debug training + fine-tuned eval + compare reports
- Pytest unit tests (offline fixtures; no network required)

Not yet implemented:

- Colors in Context loaders / hard negatives
- Slurm job templates

## Installation

```bash
cd color-semantic-model
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

Color-Pedia from Hugging Face (optional, for online loading):

```bash
pip install -e ".[color_pedia]"
```

Baseline retrieval and fine-tuning (Phase 3.5 / 4):

```bash
pip install -e ".[train,dev]"
```

This installs `sentence-transformers`, `torch`, and related training deps. Tests run offline without downloading models.

## Prepare data

### xkcd

Place `rgb.txt` at:

```
data/raw/xkcd/rgb.txt
```

### Color-Pedia (local offline)

Export or copy parquet/csv/json/jsonl files to:

```
data/raw/color_pedia/
```

See [manual_download.md](manual_download.md) for download instructions.

## Build candidate color bank

```bash
python -m colorrec.data.build_candidate_bank --config configs/local_debug.yaml
```

Outputs:

- `artifacts/candidate_bank/candidate_colors.parquet`
- `artifacts/candidate_bank/candidate_colors.jsonl`
- `artifacts/candidate_bank/schema_report.md`

## Inspect candidate bank quality (Phase 2.5)

Read-only quality check on the built parquet:

```bash
python -m colorrec.data.inspect_candidate_bank --config configs/local_debug.yaml
```

Outputs:

- `artifacts/candidate_bank/inspection_report.md`
- `artifacts/candidate_bank/inspection_report.json`

Checks include descriptor length distribution, token frequency, suspicious/overused tokens, cross-source duplicates, and sample rows.

## Build training pairs (Phase 3)

After building the candidate bank:

```bash
python -m colorrec.data.build_training_pairs --config configs/local_debug.yaml
```

Outputs:

- `artifacts/train_pairs/train_pairs.jsonl`
- `artifacts/train_pairs/val_pairs.jsonl`
- `artifacts/train_pairs/test_pairs.jsonl`
- `artifacts/train_pairs/stats.md`

Sources (configurable in `data.training_pairs.enabled_sources`):

- `candidate_self` — one pair per candidate color (anchor = color name)
- `color_pedia_metadata` — phrase anchors from Color-Pedia metadata fields
- `user_curated` — high-weight pairs from `data/raw/user_curated/user_pairs.csv`
- `nrc_word_colour` — optional; skipped with warning if raw files missing

## Baseline retrieval (Phase 3.5)

After building the candidate bank and training pairs, run the full baseline pipeline (embed candidates, evaluate val/test, qualitative report):

```bash
pip install -e ".[train,dev]"
python -m colorrec.data.build_candidate_bank --config configs/local_debug.yaml
python -m colorrec.data.build_training_pairs --config configs/local_debug.yaml
python -m colorrec.evaluation.baseline_retrieval --config configs/local_debug.yaml
```

Outputs:

- `artifacts/candidate_bank/candidate_embeddings.npy`
- `artifacts/candidate_bank/candidate_metadata.parquet`
- `artifacts/eval_reports/baseline_retrieval.json`
- `artifacts/eval_reports/baseline_retrieval.md`
- `artifacts/eval_reports/baseline_qualitative.json`
- `artifacts/eval_reports/baseline_qualitative.md`

Individual steps:

```bash
# Precompute candidate descriptor embeddings
python -m colorrec.inference.embed_candidates --config configs/local_debug.yaml

# Evaluate one split
python -m colorrec.evaluation.evaluate_retrieval --config configs/local_debug.yaml --split val
python -m colorrec.evaluation.evaluate_retrieval --config configs/local_debug.yaml --split test

# Qualitative report for fixed prompts
python -m colorrec.evaluation.qualitative_report --config configs/local_debug.yaml

# Ad-hoc query
python -m colorrec.inference.infer \
  --config configs/local_debug.yaml \
  --query "warm nostalgic jazz poster" \
  --top_k 8
```

The baseline uses the base `sentence-transformers/all-MiniLM-L6-v2` model (no fine-tuning). Val/test splits are small and skewed due to grouped split (union-find) to preserve leakage=0; reports include query counts by source and skipped-query counts.


## Fine-tune sentence-transformer (Phase 4)

After baseline retrieval, fine-tune on training pairs with MultipleNegativesRankingLoss:

```bash
pip install -e ".[train,dev]"
python -m colorrec.training.train_sentence_transformer --config configs/local_debug.yaml
python -m colorrec.training.train_sentence_transformer --config configs/local_debug.yaml --run_eval_after_train
```

Or run evaluation/compare separately after training:

```bash
python -m colorrec.inference.embed_candidates --config configs/local_debug.yaml \
  --model_path models/debug_color_sentence_transformer/final \
  --output artifacts/candidate_bank/candidate_embeddings_finetuned.npy

python -m colorrec.evaluation.evaluate_retrieval --config configs/local_debug.yaml \
  --split test \
  --model_path models/debug_color_sentence_transformer/final \
  --embeddings artifacts/candidate_bank/candidate_embeddings_finetuned.npy

python -m colorrec.evaluation.qualitative_report --config configs/local_debug.yaml \
  --model_path models/debug_color_sentence_transformer/final \
  --embeddings artifacts/candidate_bank/candidate_embeddings_finetuned.npy

python -m colorrec.evaluation.compare_runs --config configs/local_debug.yaml
```

Outputs:

- `models/debug_color_sentence_transformer/final/` — fine-tuned model
- `artifacts/eval_reports/train_summary.json` / `.md`
- `artifacts/eval_reports/fine_tuned_retrieval.json` / `.md`
- `artifacts/eval_reports/fine_tuned_qualitative.json` / `.md`
- `artifacts/eval_reports/fine_tuned_vs_baseline.md`

Use Python 3.11/3.12 for `[train]` (PyTorch wheels). Metadata holdout pairs (`metadata_val`, `metadata_test`) are derived from `color_pedia_metadata` train pairs for diagnostic evaluation.

## Success review folder

After baseline and fine-tuned eval, generate a human-readable go/no-go review:

```bash
python -m colorrec.evaluation.success_review --config configs/local_debug.yaml --run_id debug_phase4
```

## Full local training (Phase 4.1)

`local_debug.yaml` is a smoke test (sampled pairs, 1 epoch).  
`full_train_local.yaml` trains on the full pool (excluding metadata holdout).  
`hpc_train.yaml` is the Slurm/HPC template for Phase 8.

## Candidate cleanup + curated palette (Phase 4.2)

Phase 4.2 cleans Color-Pedia display names, adds semantic `family_display`
(in metadata: `raw_name`, `display_name`, `family_hsl`, `family_display`),
loads a curated palette CSV, and fixes success-review qualitative heuristics
(name-aware family matching on top-5).

Rebuild the candidate bank (no model download):

```bash
python -m colorrec.data.build_candidate_bank --config configs/local_debug.yaml
```

Curated palette CSV: `data/raw/user_curated/curated_palette.csv`

```csv
name,hex,family,descriptor,keywords,weight
warm ivory,#F5F0E6,white,,neutral warm ivory skincare luxury,1.0
cream,#FFFDD0,white,,soft cream minimal clean,1.0
sunny yellow,#FFD700,yellow,,playful summer festival sunny bright,1.2
hot pink,#FF69B4,pink,,playful summer festival hot pink vibrant,1.2
soft sage,#BCB88A,green,,fresh organic skincare soft sage,1.2
```

Re-run success review on existing full-train artifacts (no retraining):

```bash
python -m colorrec.evaluation.success_review \
  --config configs/full_train_local.yaml \
  --run_id full_train_v1_phase42 \
  --pytest_passed true
```

## Full training v2 run isolation (Phase 4.3)

`full_train_v2.yaml` keeps all v2 model/eval artifacts separate from `full_train_v1`.
Curated palette colors and high-weight `user_pairs.csv` anchors are merged before training.

Recommended order (no training in this phase — run manually when ready):

```bash
# 1) Rebuild candidate bank (palette + cleaned names)
python -m colorrec.data.build_candidate_bank --config configs/full_train_v2.yaml

# 2) Rebuild training pairs (includes user_curated weight 3.5)
python -m colorrec.data.build_training_pairs --config configs/full_train_v2.yaml

# 3) Embed baseline candidates (writes manifest + rejects stale cache)
python -m colorrec.inference.embed_candidates --config configs/full_train_v2.yaml --force

# 4) Baseline eval
python -m colorrec.evaluation.baseline_retrieval --config configs/full_train_v2.yaml

# 5) Train v2 (when ready)
python -m colorrec.training.train_sentence_transformer \
  --config configs/full_train_v2.yaml \
  --run_eval_after_train

# 6) Success review
python -m colorrec.evaluation.success_review \
  --config configs/full_train_v2.yaml \
  --run_id full_train_v2 \
  --pytest_passed true
```

Embedding cache guard: `artifacts/candidate_bank/candidate_embeddings_manifest.json` records
candidate bank hash/row count + model path. Stale `.npy` files are rejected unless
`--force` or `inference.auto_reembed_on_mismatch=true` (enabled in v2 config).

```bash
python -m colorrec.inference.embed_candidates --config configs/full_train_v2.yaml --force
python -m colorrec.evaluation.baseline_retrieval --config configs/full_train_v2.yaml --skip-embed
```

```bash
pip install -e ".[train,dev]"

python -m colorrec.training.train_sentence_transformer \
  --config configs/full_train_local.yaml \
  --run_eval_after_train

python -m colorrec.evaluation.success_review \
  --config configs/full_train_local.yaml \
  --run_id full_train_v1 \
  --pytest_passed true
```

Outputs include:

- `artifacts/eval_reports/full_fine_tuned_retrieval.json` (exact + anchor_group + family_soft metrics)
- `artifacts/eval_reports/full_fine_tuned_vs_baseline.md`
- `artifacts/success_review/full_train_v1/`

Metadata evaluation uses three relevance modes:

- **exact** — single `positive_color_id` (strict; low R@1 is normal)
- **anchor_group** — same normalized anchor, any associated color
- **family_soft** — same color family as expected candidate

Do not judge metadata phrase retrieval by exact R@1 alone.

Optional custom success review output directory:

```bash
python -m colorrec.evaluation.success_review \
  --config configs/local_debug.yaml \
  --run_id full_train_v1 \
  --output_dir artifacts/success_review/full_train_v1
```

Outputs under `artifacts/success_review/{run_id}/`:

- `07_go_no_go_decision.md` — GREEN / YELLOW / RED recommendation
- `04_metrics_baseline_vs_finetuned.md` — metrics delta table (exact / anchor_group / family_soft)
- `05_qualitative_review.md` — fixed prompt before/after top-5
- `06_failure_cases.md` — failure patterns and suggested fixes
- `success_criteria.yaml`, `run_metadata.json`, `reproduce_commands.sh`, `model_card.md`

## Run tests

```bash
pytest
```

## Roadmap (later phases)

| Phase | Feature |
|-------|---------|
| 3 | Training pair builder + grouped split (done) |
| 3.5 | Baseline retrieval evaluation (done) |
| 4 | Sentence-transformer fine-tuning (MNRL) (done) |
| 5 | BYO/API integration |
| 7 | Hard negatives (Colors in Context triplets) |
| 8 | Slurm templates for HPC (done) |

## Phase 8 — HPC / Slurm (v2 recipe)

Phase 8 turns the validated `full_train_v2` recipe into a reproducible HPC workflow. **All HPC artifacts are isolated** from local `full_train_v2` outputs — nothing under `models/full_color_sentence_transformer_v2/` or `artifacts/eval_reports/full_v2_*` is overwritten.

Configs:

| Config | Purpose |
|--------|---------|
| `configs/hpc_v2.yaml` | Single-GPU full run (batch 64, fp16, SCRATCH model dir) |
| `configs/hpc_v2_smoke.yaml` | Slurm smoke test (512 pairs, 1 epoch, isolated paths) |

### 1. Prefetch model + dataset (login node with internet)

```bash
cd color-semantic-model
source .venv312/bin/activate
pip install -e ".[train,color_pedia,dev]"

python scripts/prefetch_models_and_datasets.py \
  --cache_dir "${SCRATCH:-$PWD/scratch}/hf_cache" \
  --report artifacts/logs/hpc_v2_prefetch_report.json
```

Respects `HF_HOME`, `HF_DATASETS_CACHE`, and `TRANSFORMERS_CACHE` if already set. On compute nodes without internet, prefetch on a login node first (see `manual_download.md` for offline Color-Pedia export).

### 2. Submit preprocess (CPU, no GPU)

Edit placeholders in `jobs/slurm_preprocess.sbatch` (`<ACCOUNT>`, `<CPU_PARTITION>`, `<QOS>`), then:

```bash
mkdir -p logs/slurm
sbatch jobs/slurm_preprocess.sbatch
```

Runs: `build_candidate_bank` → `inspect_candidate_bank` → `build_training_pairs` using `configs/hpc_v2.yaml`.

### 3. Submit smoke test (single GPU)

```bash
sbatch jobs/slurm_train_single_gpu_smoke.sbatch
```

Uses `configs/hpc_v2_smoke.yaml`, writes to `hpc_v2_smoke_*` artifacts and `${SCRATCH}/models/hpc_color_sentence_transformer_v2_smoke/`, then runs `success_review --run_id hpc_v2_smoke`.

### 4. Submit full HPC train (single GPU)

```bash
sbatch jobs/slurm_train_single_gpu_v2.sbatch
```

Uses `configs/hpc_v2.yaml`: baseline embed/eval → train → eval → `success_review --run_id hpc_v2`.

### 5. Re-embed / re-eval only

After a checkpoint exists but you need fresh embeddings or reports:

```bash
sbatch jobs/slurm_embed_eval_v2.sbatch
```

### Logs

Slurm stdout/stderr: `logs/slurm/<job-name>-<jobid>.out`

Training/eval artifacts:

- `${SCRATCH}/models/hpc_color_sentence_transformer_v2/final` (full)
- `artifacts/eval_reports/hpc_v2_*` (full eval)
- `artifacts/success_review/hpc_v2/` (full success review)

### Success review

```bash
cat artifacts/success_review/hpc_v2/07_go_no_go_decision.md
cat artifacts/success_review/hpc_v2/04_metrics_baseline_vs_finetuned.md
```

Look for **GREEN** decision and positive `metadata_test family_soft R@5` delta in the go/no-go summary table.

### Compute node has no network

1. Run `scripts/prefetch_models_and_datasets.py` on a login node.
2. Export Color-Pedia to `data/raw/color_pedia/` (see `manual_download.md`).
3. Ensure sbatch prologue exports `HF_HOME`, `HF_DATASETS_CACHE`, `TRANSFORMERS_CACHE` under `$SCRATCH`.

### Embedding manifest mismatch

If baseline or fine-tuned embed fails with a stale-cache error:

```bash
python -m colorrec.inference.embed_candidates --config configs/hpc_v2.yaml --force
python -m colorrec.evaluation.baseline_retrieval --config configs/hpc_v2.yaml --skip-embed
```

Or set `inference.auto_reembed_on_mismatch: true` (inherited from `full_train_v2`).

### Avoid overwriting local v2 artifacts

| Local (do not touch on HPC) | HPC isolated |
|------------------------------|--------------|
| `models/full_color_sentence_transformer_v2/` | `${SCRATCH}/models/hpc_color_sentence_transformer_v2/` |
| `artifacts/eval_reports/full_v2_*` | `artifacts/eval_reports/hpc_v2_*` |
| `artifacts/success_review/full_train_v2/` | `artifacts/success_review/hpc_v2/` |

Never point HPC jobs at `configs/full_train_v2.yaml` on shared filesystems if you want to keep local runs separate.

## License

SynGlyph monorepo component. Third-party datasets have their own licenses — see `manual_download.md`.
