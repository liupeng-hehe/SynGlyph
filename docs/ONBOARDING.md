# Onboarding: new project / new annotator

Minimal path to a working English letter-sequence loop (legacy `Dataset` / `Stimulus` / `Annotation` — the ML authority path per [ENGLISH_ML_LIFECYCLE.md](./ENGLISH_ML_LIFECYCLE.md)).

1. **Run stack** — Root [README](../README.md): `pnpm dev:api`, `pnpm dev:web-english`; set `NEXT_PUBLIC_API_URL` to the API.
2. **Create a dataset** — `POST /api/datasets` with `name`, `owner`. Optional: `is_canonical_root=true` to mark your primary “root” project; `import_source` (e.g. `manual`, `alphabet_init`) for bookkeeping.
3. **Seed words** — Use stimuli APIs or Workbench flows to add `Stimulus` rows tied to `dataset_id`.
4. **Annotate** — Complete annotations in the Workbench; use `POST /api/annotation/commit` when closing a word with registry metadata if using pattern-supply lists.
5. **Freeze & train** — Export a dataset version and start training per [PHASE1_REPRODUCIBILITY.md](./PHASE1_REPRODUCIBILITY.md) / [PHASE2_EXPERIMENTS.md](./PHASE2_EXPERIMENTS.md); create `ModelSnapshot`, promote champion via `scripts/promote_model_snapshot.py` or your deployment process.
6. **Verify inference** — `GET /api/letter-sequence/predict/{stimulus_id}` with optional `snapshot_id`; ensure `LETTER_SEQUENCE_CHECKPOINT` or champion `ml_deployment` is set.

**Note:** `/api/english/*` and `english_*` tables are a separate product surface; they do not feed the letter-sequence export until a bridge exists.
