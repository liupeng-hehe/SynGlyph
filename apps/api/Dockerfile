# Build from repository root:
#   docker build -f apps/api/Dockerfile -t synglyph-api .
#
# Expects: packages/letter_sequence (editable dep) + apps/api (uv.lock).

FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY packages/letter_sequence /app/packages/letter_sequence
COPY apps/api /app/apps/api
RUN chmod +x /app/apps/api/docker-entrypoint.sh

WORKDIR /app/apps/api
ENV UV_LINK_MODE=copy
RUN uv sync --frozen --no-dev

ENV PATH="/app/apps/api/.venv/bin:$PATH"
ENV PYTHONPATH=/app/apps/api

EXPOSE 8000
ENTRYPOINT ["/app/apps/api/docker-entrypoint.sh"]
