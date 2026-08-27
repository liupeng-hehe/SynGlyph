# Active learning refactor — implementation plan (tightened spec)

This document extends the original phased plan with **required** constraints for implementation and experiments. Phase execution follows: baseline audit → shared acquisition → cost → diversity → replay → tuning → evaluation.

## 1. Backward-compatibility regression

When **all new flags are disabled** (cost-aware off, diversity off, legacy acquisition paths where applicable), the implementation must match the pre-refactor behavior on a **fixed candidate pool** within tight float tolerance for:

- Raw feature vectors (five hybrid features per candidate)
- Normalized features (per-dimension robust min–max)
- Final scalar scores
- Final ranking order (same tie-break mode)

**Verification**: automated tests with a deterministic pool (no DB unless needed for labeled counts), using `math.isclose` / small `atol`/`rtol`.

## 2. Offline instability (replay)

**Do not** use DB-backed `ALPredictionHistory` in offline replay.

**Definition**: For each candidate id, maintain **rolling histories** of boundary uncertainty and segment-attribute uncertainty **across prior replay rounds** (values recorded after each round’s scoring pass). Instability is:

`variance(boundary_history) + 0.5 * variance(attribute_history)` (same formula as online [`instability_score`](apps/api/app/services/active_learning_stats.py)).

**Cold start**: Until **both** histories have length ≥ 2 (enough to define variance), instability = **0** (matches online guard when histories are empty).

## 3. Replay training protocol

Support **two** mutually exclusive modes (explicit in config and artifacts; **never mix when comparing policies**):

- **Warm-start**: initialize from previous round checkpoint, then train.
- **From-scratch**: new weights each round (same recipe, same seed protocol as configured).

Field examples: `replay_training_mode: "warm_start" | "from_scratch"`.

## 4. Evaluation objective

**Primary** (choose one as default; make configurable):

- **Cumulative Δval_loss / total estimated labeling cost** over the replay budget (cost-normalized learning efficiency).

**Secondary** (always report where applicable):

- Final `val_loss`
- Improvement vs **random** at the **same** total cost / budget
- Cost to reach a **target** `val_loss` (if not reached, record “not reached” + final val)

## 5. Diversity backend (v1 scope)

Implement **lexical similarity only**:

- `char_ngram_cosine` **or** `jaccard` (configurable).

**Embedding similarity**: stub / extension point only (no mandatory model hook in v1).

## 6. Reproducibility artifacts

Each experiment run should write at least:

- `policy_config.json` — acquisition weights, lambdas, flags, similarity backend, etc.
- `experiment_manifest.json` — dataset version / hash, seed(s), split ids, `model_family`, training config, replay training mode, acquisition config, timestamp, **git commit if available**.

## 7. Baselines

Experiments must support comparison among **all** of:

- **random**
- **legacy_boundary_only** (current simulator-style boundary entropy acquisition)
- **hybrid** (aligned five-feature scorer)

Do not evaluate a new policy **only** against random; include legacy and hybrid baselines under the same protocol.

## 8. Scope lock (tuning phase 1)

First policy-tuning experiments are **hard-scoped** to:

- `model_family = bilstm`
- Fixed data split(s)
- Fixed training recipe

Cross-family transfer experiments are **out of scope** until policy stability is demonstrated.

---

## Phase status

| Phase | Content | Status |
|-------|---------|--------|
| 0 | `docs/al_refactor_baseline.md` — audit | In progress |
| 1 | Shared acquisition (`letter_sequence` + API refactor + parity tests) | In progress |
| 2–7 | Cost, diversity, replay, tuning, eval docs | Planned |
