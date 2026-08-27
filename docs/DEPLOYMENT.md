# 部署与内测托管（单人最少运维）

本文档对应「可试用产品」最小路径：先能稳定跑 staging，再考虑生产。

## 托管方式建议（已选定默认方向）

| 方案 | 适合 | 运维量 |
|------|------|--------|
| **PaaS（默认推荐）** — Render、Railway、Fly.io 等 | 单人、先验证产品 | 低：连接 Git、配环境变量、托管 Postgres 一键开 |
| **AWS** — RDS + App Runner / ECS Fargate | 已绑定 AWS、长期全栈在云上 | 中高：网络、IAM、账单结构需自己管 |

**默认结论**：内测与 staging 优先用 **PaaS + 托管 PostgreSQL**；日后若必须全在 AWS，再把同一套容器/环境变量迁到 RDS + App Runner 即可，无需改业务代码。

## 环境分层

| 环境 | 数据库 | 说明 |
|------|--------|------|
| **local** | SQLite（默认） | `apps/api` 下 `synglyph.db`，启动时自动建表 |
| **staging** | PostgreSQL | 与生产同形态，供他人试用；连接串用 `DATABASE_URL` |
| **production** | PostgreSQL | 与 staging 同流程；域名与备份策略另定 |

## 后端必配环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | 例如 `postgresql://user:pass@host:5432/dbname`；不设则 SQLite |
| `SYNGLYPH_CORS_ORIGINS` | 浏览器来源，逗号分隔，如 `https://your-app.onrender.com`；生产**勿**用 `*` |
| `LETTER_SEQUENCE_CHECKPOINT` | 推理用 checkpoint 路径（若需） |

首次使用 PostgreSQL 时在 `apps/api` 执行：

```bash
uv sync --extra dev
export DATABASE_URL=postgresql://...
uv run alembic upgrade head
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 前端必配

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_API_URL` | 公网可访问的 API 根 URL，**无尾部斜杠**，如 `https://api.example.com` |

构建前设置，避免把 `localhost` 打进生产 bundle。

## Docker

习惯、命令与 Git 对照见 [DOCKER.md](./DOCKER.md)。

**一键：Postgres + FastAPI + web-english**（浏览器访问前端 `http://localhost:31415`，API `http://localhost:8000`；31415 避免占用本机常用的 3000 开发端口）：

```bash
docker compose up --build
```

**只起 Postgres**（API 仍在宿主机跑，适合 `pnpm dev:api`）：

```bash
docker compose up -d db
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/synglyph
cd apps/api && uv run alembic upgrade head && uv run uvicorn app.main:app --reload --port 8000
```

## CI

见 [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)：推送时跑 API 测试（可逐步加前端 lint）。

## 相关

- 多用户数据隔离约定见 [DATA_ISOLATION.md](./DATA_ISOLATION.md)。
