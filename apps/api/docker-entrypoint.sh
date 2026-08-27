#!/bin/sh
set -e
cd /app/apps/api

# Run Alembic only when targeting PostgreSQL (compose / staging / prod).
if [ -n "${DATABASE_URL:-}" ] && echo "$DATABASE_URL" | grep -qiE 'postgres|postgresql'; then
  echo "[entrypoint] Running alembic upgrade head..."
  .venv/bin/alembic upgrade head
fi

exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
