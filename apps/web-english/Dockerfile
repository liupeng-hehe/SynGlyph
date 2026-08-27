# Build from repository root:
#   docker build -f apps/web-english/Dockerfile -t synglyph-web-english .
#
# Build-arg NEXT_PUBLIC_API_URL is baked into the client bundle at build time.

FROM node:20-bookworm-slim AS builder
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY packages/annotation-core ./packages/annotation-core
COPY packages/english-annotation-core ./packages/english-annotation-core
COPY apps/web-english ./apps/web-english

RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm --filter web-english build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/apps/web-english/.next/standalone ./
COPY --from=builder /app/apps/web-english/.next/static ./apps/web-english/.next/static
COPY --from=builder /app/apps/web-english/public ./apps/web-english/public

EXPOSE 3000
WORKDIR /app/apps/web-english
CMD ["node", "server.js"]
