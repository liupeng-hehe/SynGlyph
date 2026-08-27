# Backlog: `english_*` vs legacy English tables

**Current state (see [README](../README.md) and [ENGLISH_ML_LIFECYCLE.md](./ENGLISH_ML_LIFECYCLE.md)):**

- **Legacy** (`dataset`, `stimulus`, `annotation`, …): powers Workbench, dataset export, letter-sequence training, active learning, `/api/letter-sequence/*`.
- **`english_*`** (`english_annotation_sessions`, `english_word_instances`, …): powers `/api/english/*` and the optional `/english` session UI in `web-english`.

**No automatic sync** exists between the two. A future migration project might:

1. Define the target source of truth (or dual-write policy).
2. Add a one-time or incremental bridge (export/import or SQL job).
3. Switch read paths in the ML pipeline only after parity tests.

Track that work as its own milestone; it is **not** required for routine Phase 1/2 ML experiments on frozen data.
