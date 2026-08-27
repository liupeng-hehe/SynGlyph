# API workflow registry (lightweight)

High-level entry points and what they drive. For full ML lineage see [ENGLISH_ML_LIFECYCLE.md](./ENGLISH_ML_LIFECYCLE.md).

| Workflow | Entry | Primary tables / artifacts |
|----------|-------|----------------------------|
| English Workbench annotate | `POST /api/annotations`, `POST /api/annotation/commit` | `annotation`, `stimulus`, `session` |
| English product UI (isolated) | `POST /api/english/session`, … | `english_*` |
| Chinese glyph annotate | `/api/chinese/*` | `chinese_*` |
| Stimuli / bulk words | `POST /api/stimuli`, `/bulk` | `stimulus`, optional `user_word_registry` |
| Active learning queue | `POST /api/active-learning/refresh`, `GET .../prioritized` | `al_queue_snapshot`, `al_prediction_history` |
| Training run | `POST /api/training/runs` | `training_run`, subprocess → `letter_sequence.pt` |
| Model artifact | `POST /api/training/runs/.../snapshots` | `model_snapshot` |
| Champion deploy | scripts / service | `ml_deployment` |
| Build Your Own (BYO) | `POST /api/lab/*` | `lab_profile`, … → champion `letter_sequence` checkpoint + optional `data/lab_training_runs/` |
| HITL metrics (read-only) | `GET /api/metrics/summary`, `GET /api/metrics/workflow` | `metric_fact`, `workflow_metrics_snapshot` — populate via `scripts/rollup_metrics.py` |

**Related:** [CHINESE_PHASE1_DATA_PIPELINE.md](./CHINESE_PHASE1_DATA_PIPELINE.md), [PHASE2_EXPERIMENTS.md](./PHASE2_EXPERIMENTS.md), [METRICS_TAXONOMY.md](./METRICS_TAXONOMY.md), [BYO_DEPLOYMENT.md](./BYO_DEPLOYMENT.md).
