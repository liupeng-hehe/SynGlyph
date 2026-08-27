# LAB-uniform teacher 5000

Goal: expand `user_curated` with at least **5000 unique positive colors** and broad LAB color-map coverage, while reusing the vocabulary style already present in the color database.

## Existing database vocabulary scan

Inputs scanned:

- `artifacts/candidate_bank/candidate_colors.parquet` — 1966 rows
- `artifacts/candidate_bank/candidate_metadata.parquet` — 1966 rows
- `data/raw/user_curated/user_pairs.csv` — 88 rows
- `data/raw/user_curated/teacher_color_collection.csv` — 100 rows

Source counts:

| source | rows |
|--------|-----:|
| color_pedia | 2000 |
| xkcd | 1898 |
| user_curated_palette | 34 |

Family counts in scanned descriptors:

| family | count |
|--------|------:|
| green | 1077 |
| blue | 900 |
| purple | 437 |
| red | 351 |
| pink | 330 |
| brown | 314 |
| yellow | 298 |
| orange | 264 |
| grey | 82 |
| black | 34 |
| white | 33 |

High-frequency descriptive words:

```text
green, bold, cool, vivid, saturated, blue, balanced, warm, rich, deep,
dark, calm, fresh, purple, natural, organic, light, trustworthy, energetic,
clean, brown, red, colorful, vibrant, mysterious, muted, yellow, creative,
intense, bright, luxurious, earthy, serene, orange, passionate, nature,
sage, grounded, romantic, indigo, lime, stability, harmony, rustic,
gentle, elegant, energy, pastel, spirituality, reliable, teal, dramatic,
cheerful
```

Common phrase patterns:

```text
vivid saturated, saturated bold, bold cool, fresh organic, cool natural,
natural fresh, bold warm, balanced vivid, cool calm, calm clean,
clean trustworthy, rich vivid, colorful cool, mysterious luxurious,
creative mysterious, muted cool, balanced colorful, dark deep,
passionate intense, warm romantic, earthy rustic, warm earthy
```

## Generated files

| file | rows | purpose |
|------|-----:|---------|
| `data/raw/user_curated/lab_uniform_teacher_5000_pairs.csv` | 5000 | Training pairs (`anchor_text` -> `positive_descriptor` / hex) |
| `data/raw/user_curated/lab_uniform_teacher_5000_palette.csv` | 5000 | Candidate palette rows for these colors |
| `artifacts/logs/lab_uniform_teacher_5000_report.json` | 1 | Coverage report |

## LAB coverage

```json
{
  "count": 5000,
  "unique_hex": 5000,
  "lab_min": [0.546, -85.043, -106.035],
  "lab_max": [98.007, 94.416, 93.352],
  "lab_mean": [55.876, 9.962, 4.749],
  "lab_std": [21.604, 40.223, 42.383]
}
```

Family distribution:

| family | rows |
|--------|-----:|
| green | 1126 |
| blue | 1097 |
| purple | 975 |
| brown | 350 |
| yellow | 339 |
| red | 288 |
| pink | 276 |
| grey | 233 |
| orange | 210 |
| black | 106 |

This distribution is not forced equal by family; it follows the shape of the **displayable sRGB gamut in LAB**, where green/blue/purple occupy more sampled cells under this family heuristic.

## How names/descriptors are built

Each row uses:

```text
family-aware noun + interpretation lens + LAB tone words + high-frequency corpus adjective
```

Example:

```text
anchor_text:
  garden as mineral calm, balanced, muted, quiet green

positive_color_name:
  muted garden 1777

positive_hex:
  #088249

positive_descriptor:
  muted garden 1777, green family, balanced, muted, quiet, ...
  LAB L 46.8 a -47.9 b 31.5, ...
  broad gamut teacher color sampled for even LAB color-map coverage
```

## Recommended usage

Do **not** immediately give these rows the same weight as hand-curated / OpenAI teacher rows.

Suggested mix:

| dataset | suggested weight |
|---------|-----------------:|
| hand teacher collection | 3.2 |
| OpenAI distill rows | 3.5 |
| synthetic Studio bulk | 2.8 |
| LAB-uniform 5000 | 2.0–2.4 |

The 5000 set is for **coverage**. It should prevent the model from collapsing into a small palette, but the hand/OpenAI teacher rows should still dominate taste.

## Generate again

```bash
python scripts/generate_lab_uniform_teacher.py --target 5000
```

## Merge into training

Review first, then append selected rows into:

- `data/raw/user_curated/user_pairs.csv`
- `data/raw/user_curated/curated_palette.csv`

Then:

```bash
python -m colorrec.data.build_candidate_bank --config configs/full_train_v2.yaml
python -m colorrec.data.build_training_pairs --config configs/full_train_v2.yaml
python -m colorrec.training.train_sentence_transformer \
  --config configs/full_train_v2.yaml \
  --run_eval_after_train
```

