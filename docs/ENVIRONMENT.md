# API environment variables

SynGlyph API reads configuration via `pydantic-settings` ([`apps/api/app/db.py`](../apps/api/app/db.py)). Common variables:

| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | SQLAlchemy URL (SQLite or PostgreSQL) | `sqlite:///./synglyph.db` |
| `LETTER_SEQUENCE_CHECKPOINT` | Fallback `.pt` path for letter-sequence inference | (none) |
| `SYNGLYPH_ML_ENV` | `MLDeployment.environment` for champion resolution | `dev` |
| `SYNGLYPH_CORS_ORIGINS` or `CORS_ALLOW_ORIGINS` | Comma-separated browser origins, or `*` for all (local dev only) | `*` |
| `CHINESE_GLYPH_DATA_ROOT` | Override Chinese glyph JSON root | repo default |
| `ARTIFACTS_ROOT` | Phase 1 ML artifacts root | (none) |

Production: set `SYNGLYPH_CORS_ORIGINS` to your frontend origin(s); avoid `*`.

See also [ENGLISH_ML_LIFECYCLE.md](./ENGLISH_ML_LIFECYCLE.md) for ML-related paths and champion resolution.
