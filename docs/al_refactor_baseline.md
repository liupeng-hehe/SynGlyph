# Active learning refactor — baseline audit (Phase 0)

This note summarizes **current** behavior before the cost / diversity / replay extensions, and what the refactor **will** and **will not** change.

## Module roles

### [`apps/api/app/services/active_learning_scoring.py`](apps/api/app/services/active_learning_scoring.py)

**Online orchestration** for hybrid active learning:

1. Fetch a **candidate pool** (SQL): unannotated English stimuli, optionally scoped to a selected list; or KB lexicon mapped to stimuli.
2. **Model predictions** via [`score_candidate_stimuli`](apps/api/app/services/active_learning_predictions.py): boundary uncertainty (mean boundary entropy) and segment-attribute uncertainty (prominence/spread proxy).
3. **Corpus statistics** from labeled annotations: segment novelty and coverage gain via [`active_learning_stats`](apps/api/app/services/active_learning_stats.py); optional **KB blend** when an active vocab exists (adjusts coverage/novelty toward KB gap scores).
4. **Instability** from per-stimulus **history** (boundary + attribute series) via `history_lookup` (API wires this to persisted history).
5. **Robust percentile min–max** normalization per feature ([`active_learning_normalization`](apps/api/app/services/active_learning_normalization.py)), then **weighted sum** using [`WEIGHTS`](apps/api/app/config/active_learning.py).
6. **Sort** by score (tie-break: none / hash / random), return top `limit`.

Stages: `hybrid_scoring_v1` without KB blend, `hybrid_scoring_v2` when KB blend is active.

### [`apps/api/app/services/active_learning_predictions.py`](apps/api/app/services/active_learning_predictions.py)

Loads the letter-sequence checkpoint (cached), runs the model on candidate text, returns **boundary uncertainty** and **segment attribute uncertainty** per stimulus. No DB beyond snapshot resolution.

### [`apps/api/app/services/active_learning_stats.py`](apps/api/app/services/active_learning_stats.py)

- Builds **n-gram / character counts** from **labeled** stimuli in the DB.
- **Segment novelty**: rarity of chars / bigrams / trigrams vs labeled counts.
- **Coverage gain**: deficit vs target counts ([`TARGETS`](apps/api/app/config/active_learning.py)).
- **Instability**: `var(boundary_hist) + 0.5 * var(attribute_hist)` when histories exist.

### [`apps/api/app/api/active_learning.py`](apps/api/app/api/active_learning.py)

- `POST /api/active-learning/refresh` — runs `compute_hybrid_al_scores`, persists snapshot + history pruning.
- `GET /api/active-learning/prioritized` — reads latest snapshot; may trigger refresh (including KB path).

**Stable API surface**: request/response schemas for refresh and prioritized list are unchanged in Phase 1.

### [`packages/letter_sequence/letter_sequence/models/model_factory.py`](packages/letter_sequence/letter_sequence/models/model_factory.py)

Canonical **`mlp` | `bilstm` | `transformer_encoder`** construction for training and checkpoint loading in scripts.

### [`packages/letter_sequence/letter_sequence/training/train_loop.py`](packages/letter_sequence/letter_sequence/training/train_loop.py)

Shared training: **`train_loss` and `val_loss`** use the same multitask loss definition (weighted smooth L1 + masks).

### [`packages/letter_sequence/letter_sequence/eval/evaluate_snapshot.py`](packages/letter_sequence/letter_sequence/eval/evaluate_snapshot.py)

Loads checkpoint, runs `compute_epoch_metrics` on a JSONL split (diagnostic MAE + loss-style metrics). Used for snapshot eval; replay metrics will align with `train_loop` val loss where applicable.

### [`packages/letter_sequence/letter_sequence/al/simulate_active_learning.py`](packages/letter_sequence/letter_sequence/al/simulate_active_learning.py)

**Offline simulation today**:

- Splits frozen canonical data into train pool + val.
- **Random** or **`uncertainty`** sampling: uncertainty = **boundary-only** scalar ([`uncertainty_scores_batch`](packages/letter_sequence/letter_sequence/al/uncertainty.py)), **not** the full hybrid score.
- Trains per round on labeled subset; logs extended val metrics.

**Does not** replicate hybrid normalization, novelty/coverage/instability, or KB blend.

## Online vs offline today

| Aspect | Online (API) | Offline (simulator) |
|--------|----------------|---------------------|
| Acquisition signal | Five features + robust norm + weights (+ optional KB) | Single score: boundary entropy only (or random) |
| Novelty / coverage | From DB labeled counts | Not used |
| Instability | From DB-backed history | Not used |
| Normalization | Per-pool percentile min–max | N/A (scalar sort) |

## What Phase 1 changes

- **Extract** shared math: robust normalization + hybrid weighted score into `letter_sequence` ([`acquisition_policy`](packages/letter_sequence/letter_sequence/al/acquisition_policy.py)).
- **Extract** text-only novelty/coverage/count building into `letter_sequence` ([`text_stats`](packages/letter_sequence/letter_sequence/al/text_stats.py)); API **stats** module becomes a thin DB → text adapter.
- **Refactor** `compute_hybrid_al_scores` to call the shared scorer so online and future replay share one code path for norm + score.
- **Tests**: with all new flags **off**, raw/normalized/scores/ranking match within tolerance on a fixed pool.

## What this phase does **not** change

- No new API fields required for clients (Phase 1).
- No change to default hybrid weights or normalization defaults.
- No replacement of `train_loop` or model factory.
- No frontend changes.

## Later phases (pointer)

See [`docs/al_refactor_plan.md`](al_refactor_plan.md): cost-aware scoring, lexical-only diversity rerank, replay partitions (L0/U/V/T), training mode (warm-start vs scratch), objectives, baselines (random / legacy_boundary / hybrid), manifests, and tuning scope (BiLSTM-first).
