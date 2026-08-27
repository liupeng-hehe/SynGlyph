# Distill OpenAI → colorrec training data (Scheme C)

## Bulk data without OpenAI (synthetic)

For **large Studio-format** datasets without API cost:

```bash
python scripts/generate_studio_bulk_pairs.py --max-pairs 800
python scripts/generate_studio_bulk_pairs.py --max-pairs 2000 --merge-into-training
```

Pre-generated in repo: `data/raw/user_curated/synthetic_studio_bulk_pairs.csv` (800 rows).

- **Pros:** free, instant, anchor format matches Color Studio (`feelings. passage`)
- **Cons:** descriptions are template-based — quality below OpenAI distill; use **weight 2.8** vs **3.5** for OpenAI rows

**Recommended mix:** synthetic bulk (volume) + OpenAI distill on your best 50–100 Studio sessions (quality).

---

## OpenAI distillation

Turn Color Studio–quality OpenAI suggestions into **user_curated** training pairs so fine-tuned retrieval matches your product query format (`feelings + passage`).

## What gets written

| File | Purpose |
|------|---------|
| `data/raw/user_curated/openai_distill_pairs.csv` | Schema A rows (`anchor_text`, `positive_hex`, `positive_descriptor`, …) |
| `data/raw/user_curated/openai_distill_palette.csv` | New hexes for `curated_palette.csv` (candidate bank) |
| `artifacts/logs/openai_distill_audit.jsonl` | Raw OpenAI JSON + errors (resume/debug) |

**Anchor format** matches the web app: `warm, nostalgic. [passage excerpt]` — same as `buildColorRecQuery` / Color Studio.

**Positive side** is a rich descriptor (name + family + tone + feelings + passage + OpenAI description/reason) used by MNRL training.

## 1. Prepare seeds

Edit `data/raw/user_curated/distill_seeds.jsonl` (one JSON per line):

```json
{"feelings": ["warm", "nostalgic"], "passage": "Your passage text…", "note": "optional label"}
```

Tips:

- Use **real passages** from your PDF/Studio workflow (export or paste).
- Combine **2–3 feeling chips** like the UI presets.
- Aim for **50–200 seeds** for a noticeable shift; start with 6–24 for a smoke distill.

## 2. Run distillation

```bash
cd color-semantic-model
source .venv312/bin/activate
export OPENAI_API_KEY=sk-...

# Preview anchors only
python scripts/distill_openai_color_pairs.py --dry-run

# Call OpenAI (default seeds file + 1 try-another variant per seed)
python scripts/distill_openai_color_pairs.py --config configs/distill_openai.yaml

# More diversity
python scripts/distill_openai_color_pairs.py --variants 2 --limit 20

# Merge into main training CSVs
python scripts/distill_openai_color_pairs.py --merge-into-training
```

`--merge-into-training` appends into:

- `data/raw/user_curated/user_pairs.csv`
- `data/raw/user_curated/curated_palette.csv`

(deduped by `anchor + hex` and by hex).

## 3. Rebuild artifacts + fine-tune

```bash
python -m colorrec.data.build_candidate_bank --config configs/full_train_v2.yaml
python -m colorrec.data.build_training_pairs --config configs/full_train_v2.yaml
python -m colorrec.training.train_sentence_transformer \
  --config configs/full_train_v2.yaml \
  --run_eval_after_train
```

For HPC, use `configs/hpc_v2.yaml` after syncing updated `data/raw/user_curated/` to Ocean.

Check `user_curated` share in train log and `metadata_test family_soft R@5` in success_review.

## 4. Deploy new checkpoint

Replace `models/hpc_color_sentence_transformer_v2/` (or local v2 path), re-embed candidates, restart API.

## Quality checklist

- [ ] Anchors read like **Studio queries**, not generic one-word moods only
- [ ] `positive_descriptor` includes OpenAI **description + reason** (not hex alone)
- [ ] New hexes appear in **curated_palette** (so retrieval can return them)
- [ ] Weight ≥ 3.5 for distilled rows (`user_curated` oversampling)
- [ ] Hold out 10–15 seeds manually for before/after `infer` comparison

## Cost rough order

~$0.01–0.03 per seed (gpt-4o-mini, one variant). 100 seeds ≈ $1–3.

## Manual curation (recommended)

After distill, skim `openai_distill_pairs.csv`:

- Delete rows with neon/unreadable hex for PDF wash
- Bump `weight` to 4.0–5.0 for exemplar rows
- Copy your best Studio sessions into `distill_seeds.jsonl` and re-run
