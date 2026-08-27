# Teacher color collection

This dataset is for training colorrec on a richer task than fixed feeling chips:

```text
concept word + interpretation lens -> color recommendation + color description
```

Example:

```text
memory as old photograph -> faded sepia wash #A9825A
memory as blue distance  -> distant fog blue #7895A8
memory as warm paper     -> warm parchment #D8C3A5
```

## Files

| File | Purpose |
|------|---------|
| `data/raw/user_curated/teacher_color_collection.csv` | Curated training pairs, compatible with `user_pairs.csv` schema |
| `data/raw/user_curated/user_pairs.csv` | Existing main curated training file |

## Schema

The CSV uses the existing Schema A:

```csv
anchor_text,positive_color_name,positive_hex,positive_descriptor,color_family,weight
```

- `anchor_text`: the query form the model should learn, e.g. `glass as city reflection`
- `positive_color_name`: evocative color name, e.g. `rainlit cyan`
- `positive_hex`: target color
- `positive_descriptor`: rich text used as the positive sentence-transformer target
- `color_family`: broad family for metrics / inspection
- `weight`: default `3.2`, below hand-verified OpenAI distill rows (`3.5+`) but above synthetic bulk rows (`2.8`)

## How to expand

For each concept, create 4-6 interpretation lenses:

| Lens Type | Example |
|-----------|---------|
| material | `silk as softness` |
| emotion | `memory as bruised tenderness` |
| atmosphere | `harbor as morning calm` |
| narrative | `paper as confession` |
| tension | `glass as hidden danger` |
| use case | `prayer as midnight vigil` |

Then assign:

1. a color name,
2. a HEX,
3. a family,
4. a 1-sentence design rationale inside `positive_descriptor`.

## Recommended training mix

```text
teacher_color_collection.csv     weight 3.2  (semantic richness)
openai_distill_pairs.csv         weight 3.5  (product-quality teacher rows)
synthetic_studio_bulk_pairs.csv  weight 2.8  (volume / UI query shape)
existing user_pairs.csv          weight 3.5  (hand-picked anchors)
```

## Merge into training

Append selected rows into `data/raw/user_curated/user_pairs.csv`, then:

```bash
python -m colorrec.data.build_candidate_bank --config configs/full_train_v2.yaml
python -m colorrec.data.build_training_pairs --config configs/full_train_v2.yaml
python -m colorrec.training.train_sentence_transformer \
  --config configs/full_train_v2.yaml \
  --run_eval_after_train
```

For HPC, sync updated `data/raw/user_curated/` and run `configs/hpc_v2.yaml`.

## Important

Do not only train on generic anchors like `memory`, `glass`, `paper`.
The value is in the interpretation lens:

```text
memory as warm paper
memory as blue distance
memory as bruised tenderness
```

This teaches the model that one word can legitimately map to multiple colors depending on description style.
