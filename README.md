# SynGlyph

## How SynGlyph works

SynGlyph is a perceptual visualization platform for synesthetic reading. Its goal is to render text as a **structured visual field**: not only which colors appear, but how they occupy space, how salient they feel, how soft or diffuse they appear, and how transitions behave between letters or parts of a word.

### From perception to parameters

In the **English letter pipeline** implemented today, that intuition is represented through four families of quantities:

- **Lab color** — captures lightness and chromatic variation, preserving tonal nuance rather than reducing a letter to a single flat swatch.
- **Prominence** — represents how strongly a letter or segment stands out in the perceptual field, allowing the visualization to reflect emphasis or halo-like structure rather than hue alone.
- **Spread** — represents how diffuse, soft, or spatially extended the color feels at a given position, supporting density and softness instead of only hard fills.
- **Boundary strength** — represents how sharp or blended the transition is between adjacent letters, so continuity and contrast across a word are modeled as part of the experience.

Together, these parameters support SynGlyph’s core idea: synesthetic text perception is better modeled as a **field** of local structure, gradation, and transition than as a simple character-to-color lookup table.

### What the system does today

The current system supports an end-to-end loop:

1. **Store** human annotations for words, segments, and their perceptual attributes.
2. **Train** letter-sequence models to predict Lab, prominence, spread, and boundary-related targets.
3. **Serve** HTTP inference so the web interface can preview model outputs and compare them with human labels.
4. **Prioritize** the next items to annotate through an active learning loop that combines model uncertainty with novelty, coverage, and optional signals from an orthographic knowledge base.

This makes SynGlyph more than a static renderer: it is an **iterative perceptual modeling system** in which annotation, training, inference, and visualization continuously inform one another.

### Honest scope

The current implementation is still **research-grade**. The English modeling stack is **letter-centric**, inference for the letter-sequence path currently runs on **CPU**, and parts of the tooling remain **operator-oriented** (for example, workbench, lab, and metrics flows). A Chinese glyph-oriented path and English product-facing tables also exist alongside the **legacy** English ML pipeline, but they are **not yet fully unified**. **Multi-user comparison** across different synesthetic maps remains a product direction rather than a shipped feature.

Even with those limits, the system already implements the core technical idea behind SynGlyph: a **structured-field** representation of synesthetic text perception rather than a flat character-to-color mapping.

### Modeling loop

For the English letter-sequence path, the repository implements a closed loop you can run end to end:

1. **Annotate** — Save segment-level labels (Lab, prominence, spread) and boundary-related structure for stimuli in the legacy English store (`Dataset` / `Stimulus` / `Annotation` / …).
2. **Freeze / export** — Build a versioned dataset and `letter_sequence`-style samples (JSONL) for training (see [`docs/PHASE1_REPRODUCIBILITY.md`](docs/PHASE1_REPRODUCIBILITY.md) and [`docs/ENGLISH_ML_LIFECYCLE.md`](docs/ENGLISH_ML_LIFECYCLE.md)).
3. **Train** — Run letter-sequence training (PyTorch package `packages/letter_sequence`) and record checkpoints; register **model snapshots** and optional **deployment** aliases for “champion” models.
4. **Infer & prioritize** — Use HTTP endpoints under `/api/letter-sequence` for prediction and `/api/active-learning` to refresh a prioritized queue using the resolved checkpoint; then return to annotation.

Details, table names, and checkpoint resolution order are documented in [`docs/ENGLISH_ML_LIFECYCLE.md`](docs/ENGLISH_ML_LIFECYCLE.md).

### Current implementation boundary

These are the main **hard edges** of the code as it exists today—not a roadmap:

| Area | Boundary |
|------|----------|
| **Training data** | Letter-sequence exports assume **single-letter segments** and **Latin letters** for the V1 sample builder (`packages/letter_sequence`). Arbitrary multi-grapheme segments or scripts are not yet first-class in that path. |
| **Data model** | **Legacy** tables power letter-sequence training, AL, and Workbench. The **`english_*`** product namespace is **separate** and **not** automatically synced into the same export—see [`docs/ENGLISH_ML_LIFECYCLE.md`](docs/ENGLISH_ML_LIFECYCLE.md). |
| **Inference** | Letter-sequence HTTP inference is **CPU**-oriented; character coverage follows the model vocabulary (e.g. `[a-z]` with UNK for other characters). |
| **Active learning** | Meaningful **uncertainty** scores require a **resolvable checkpoint**. If none is available, uncertainty terms are effectively zero—documented behavior, not a hidden fallback. |
| **Observability** | The **metrics** UI is fed by **offline** rollup (`scripts/rollup_metrics.py`), not live production telemetry. |
| **Product** | **Cross-user** comparison of synesthetic maps is **not** implemented as a feature set. |

---

## Product split: English vs Chinese annotation

The repo is organized as **two product surfaces** with **separate route namespaces**, **separate API prefixes**, **separate DB table families** (`english_*` / `chinese_*`), and **shared low-level packages only**.

| Layer | English | Chinese |
|--------|---------|---------|
| Web app | `apps/web-english` (port **3000** default) | `apps/web-chinese` (port **3001** default) |
| Web routes | `/english/*` + legacy routes (`/`, `/annotate/...`, etc.) | `/chinese/*` |
| API | `/api/english/*` | `/api/chinese/*` |
| DB tables | `english_annotation_sessions`, `english_word_instances`, `english_segments`, `english_transitions` | `chinese_glyph_templates`, `chinese_annotation_sessions`, `chinese_glyph_instances`, `chinese_regions`, `chinese_transitions` |

### Shared packages (no domain business logic)

- `packages/annotation-core` — `ColorSpec`, `AnchorSpec`, `SpreadSpec`, `DirectedTransitionSpec`
- `packages/chinese-glyph-core` — normalized glyph types + `bboxFromMedians` helpers
- `packages/english-annotation-core` — English-only draft types (re-exports shared primitives where useful)
- `packages/shared` — existing shared TS types

There is **no** single abstract “annotation” domain layer that mixes English and Chinese workflows.

### English ML authority (legacy vs `english_*`)

- **Letter-sequence training, evaluation, active learning, and `/api/letter-sequence` predictions** use the **legacy** English pipeline: `Dataset` → `Stimulus` → `Annotation` (and related tables). This is what the Workbench and dataset export scripts use.
- The **`english_*`** tables back **`/api/english/*`** and the optional `/english` session UI. They are a **separate product namespace**; they are **not** automatically synced to the training export path today.
- If you add features, confirm which store they target to avoid splitting truth. Full diagram: [`docs/ENGLISH_ML_LIFECYCLE.md`](docs/ENGLISH_ML_LIFECYCLE.md).
- **Build Your Own** (`apps/web-presentation`, `/build-your-own`) uses **`/api/lab/*`** (profile, preview, optional local training). Deployment and env vars: [`docs/BYO_DEPLOYMENT.md`](docs/BYO_DEPLOYMENT.md).

### Chinese Phase 1 — frozen glyph dataset (ML-ready)

Canonical export from `chinese_*` tables + glyph files: `examples.jsonl`, manifest, stats, and quality report under `artifacts/datasets/{id}/`, recorded in `ml_dataset_version` (`product_line=chinese`, `task_name=glyph_region_annotation`). See [`docs/CHINESE_PHASE1_DATA_PIPELINE.md`](docs/CHINESE_PHASE1_DATA_PIPELINE.md). Scripts: `scripts/export_chinese_dataset_version.py`, `scripts/check_chinese_dataset_quality.py`, `scripts/smoke_chinese_phase1.py`.

### Chinese glyph data

- Default directory: `data/chinese_glyphs/<character>.json` (UTF-8 filename = one Unicode character).
- Override with env: `CHINESE_GLYPH_DATA_ROOT` (see `apps/api/app/db.py`).
- Format: `character`, `decomposition`, `matches`, `strokes`, `medians`; optional **`radStrokes`** (Hanzi Writer: stroke indices for the radical) enables 部首蓝 / 声旁绿-style coloring in the Chinese UI.
- `福` is shipped as **Hanzi Writer**-compatible JSON (filled SVG paths); add more characters the same way or drop files from [hanzi-writer-data](https://www.npmjs.com/package/hanzi-writer-data).

### Run (development)

```bash
pnpm install
# Terminal A — API
pnpm dev:api
# Terminal B — English web (legacy + /english)
pnpm dev:web-english
# Terminal C — Chinese web
pnpm dev:web-chinese
```

- API: `http://127.0.0.1:8000` — try `GET /api/english/health` and `GET /api/chinese/health`
- English UI: `http://127.0.0.1:3000/english`
- Chinese UI: `http://127.0.0.1:3001/chinese` (after `pnpm dev:web-chinese`)

Set `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000` for both frontends if the API is not same-origin.

### Staging / shared Postgres / CI / Docker

- Hosting choice, `DATABASE_URL`, CORS, GitHub Actions: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
- **Docker**（镜像、Compose、`docker compose up`）：[`docs/DOCKER.md`](docs/DOCKER.md)。
- Multi-tester data boundaries (`Dataset.owner`): [`docs/DATA_ISOLATION.md`](docs/DATA_ISOLATION.md).

### Database migrations

Alembic revision `f1a2b3c4d5e6_english_chinese_product_tables.py` adds the `english_*` and `chinese_*` tables. If `alembic upgrade` fails (e.g. stray legacy revision files), SQLite dev still creates tables via `Base.metadata.create_all` on API startup once models are imported.

### English letter-sequence MLE (Phase 1)

Frozen datasets, evaluation runs, deployment aliases, and snapshot lineage for the letter-sequence model are documented in [`docs/PHASE1_REPRODUCIBILITY.md`](docs/PHASE1_REPRODUCIBILITY.md). CLI helpers live under `scripts/` (`export_dataset_version.py`, `evaluate_model_snapshot.py`, `promote_model_snapshot.py`, `smoke_phase1.py`).

### English letter-sequence experiments (Phase 2)

Comparable ML experiments (sampling strategies × model families) on frozen data, active-learning simulation, and fixed slice/latency metrics: [`docs/PHASE2_EXPERIMENTS.md`](docs/PHASE2_EXPERIMENTS.md). Scripts: `scripts/train_model_family.py`, `scripts/run_active_learning_experiment.py`, `scripts/run_experiment_grid.py`.

## Ports in use?

```bash
./scripts/kill_ports.sh
```

Kills processes on ports 3000, 3001, 3002, 8000.

## Setup & Run

See `docs/MANUAL_TEST.md` for full instructions.

- Environment variables (API): [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md)
- New project onboarding (English ML path): [`docs/ONBOARDING.md`](docs/ONBOARDING.md)
- API workflow index: [`docs/REGISTRY.md`](docs/REGISTRY.md)
- HITL metrics taxonomy and rollup: [`docs/METRICS_TAXONOMY.md`](docs/METRICS_TAXONOMY.md); UI: `http://127.0.0.1:3000/metrics` (after `rollup_metrics.py`)
