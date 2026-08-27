# Build Your Own (BYO) — deployment

BYO lives in [`apps/web-presentation/app/build-your-own/`](../apps/web-presentation/app/build-your-own/) and calls the FastAPI routes under **`/api/lab/*`**.

## Topology

```text
Browser → Next.js (web-presentation) ──rewrite──► FastAPI (apps/api)
              /api/lab/*                       DATABASE_URL
```

- **Next.js** rewrites `/api/lab/:path*` to the internal API base URL (see [`apps/web-presentation/next.config.js`](../apps/web-presentation/next.config.js)).
- **Production**: set **`SYNGLYPH_API_INTERNAL`** to the API origin the Next server can reach (same VPC / private URL is fine). Example: `http://api:8000`.
- **Alternative**: terminate TLS on a reverse proxy and route `/api/*` to FastAPI and everything else to Next; then you may not need Next rewrites if the browser talks to the API on the same host.

## Environment variables

### Web (`apps/web-presentation`)

| Variable | Purpose |
|----------|---------|
| `SYNGLYPH_API_INTERNAL` | Base URL for server-side rewrites to FastAPI (default dev: `http://127.0.0.1:8000`). |

See [`apps/web-presentation/.env.example`](../apps/web-presentation/.env.example).

### API (`apps/api`)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres (recommended in prod) or SQLite (local). |
| `SYNGLYPH_ML_ENV` | Champion lookup environment label (must match `ml_deployment.environment`). Default `dev`. |
| `LETTER_SEQUENCE_CHECKPOINT` | Optional explicit `.pt` path before champion resolution. |
| `LAB_TRAINING_ENABLED` | `1`/`true` (default): allow `POST /api/lab/train`. Set to `0`/`false` on serverless or multi-replica hosts **without** shared disk for `data/lab_training_runs/` — BYO preview still works via champion + rule fallback; only **local fine-tune** is disabled. |

Champion resolution and structured diagnostics: [`describe_active_champion_letter_sequence`](../apps/api/app/services/letter_sequence_checkpoint_resolve.py). Ops check:

```bash
cd apps/api && uv run python ../../scripts/verify_byo_champion_checkpoint.py
```

Exit code **0** only when the active english `letter_sequence` champion’s `checkpoint_uri` exists on disk for `SYNGLYPH_ML_ENV`.

## BYO training modes

| Mode | When to use |
|------|-------------|
| **API-process thread + subprocess** (current) | Single long-lived VM/container; local disk for `data/lab_training_runs/`. |
| **`LAB_TRAINING_ENABLED=0`** | Fastest safe deploy when you only need preview + palette (champion rebase or rules). |
| **Dedicated worker + shared artifact store** | Horizontal scale; replace in-process training with a queue job writing checkpoints to shared/object storage and persist URIs in `lab_profile.active_checkpoint_uri`. |

Keep champion checkpoint **schema-compatible** with [`packages/letter_sequence`](../packages/letter_sequence) inference (`extra_dim`, heads). Mismatch causes inference exceptions and BYO falls back to rule-based colors.

## Reverse proxy sketch (optional)

Same external host for UI + API:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
location / {
    proxy_pass http://127.0.0.1:3000;
}
```

Ensure **`X-Forwarded-For`** is set so [`lab_client_identity`](../apps/api/app/services/lab_client_identity.py) participant keys remain stable behind the proxy.

## Related docs

- [ENGLISH_ML_LIFECYCLE.md](./ENGLISH_ML_LIFECYCLE.md) — snapshots, champion promotion, inference.
- [REGISTRY.md](./REGISTRY.md) — API workflow index.
