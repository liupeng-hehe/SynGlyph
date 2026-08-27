# synglyph-letter-sequence

Letter-level **BiLSTM** sequence model: per-letter Lab / prominence / spread, per-boundary influence.

## Install (editable)

From repo root:

```bash
cd packages/letter_sequence
pip install -e ".[dev]"
```

## Build dataset (JSONL)

Uses SynGlyph raw export JSON (from API or saved file):

```bash
python ../../scripts/build_letter_sequence_dataset.py \
  --input-export path/to/export.json \
  --out-dir data/training_runs/my_run
```

Or fetch from API:

```bash
export SYNGLYPH_API_URL=http://localhost:8000
python ../../scripts/build_letter_sequence_dataset.py \
  --dataset-id YOUR_UUID \
  --out-dir data/training_runs/my_run
```

## Train

```bash
python ../../scripts/train_letter_sequence_model.py \
  --config packages/letter_sequence/configs/default.yaml \
  --samples-jsonl data/training_runs/my_run/letter_sequence_samples.jsonl \
  --out-dir data/training_runs/my_run
```

Outputs: `letter_sequence.pt`, `metrics.json`, `history.json`.

## Evaluate / predict

See `scripts/evaluate_letter_sequence_model.py` and `scripts/predict_letter_sequence_model.py`.
