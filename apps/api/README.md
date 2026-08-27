# SynGlyph API

部署、staging、CORS 与多用户数据隔离约定见仓库根目录 [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md) 与 [`docs/DATA_ISOLATION.md`](../../docs/DATA_ISOLATION.md)。

## 依赖

- Python **3.12+**（见 `pyproject.toml` 中 `requires-python`）。
- 在 `apps/api` 下执行：`uv sync`（会安装 FastAPI、SQLAlchemy、**PyYAML**，以及通过 path 依赖安装的 **`packages/letter_sequence`**，其中已声明 **PyTorch** 等训练依赖）。
- 若 `uv sync` 在解析 `torch` 时失败（少见平台无官方 wheel），请按 [pytorch.org](https://pytorch.org) 为当前系统单独安装 CPU/CUDA 版 PyTorch。

## 快速启动（无需 PostgreSQL）

默认使用 **SQLite**，无需额外安装数据库。首次启动 API 时自动创建数据表。

```bash
pnpm dev:api
```

数据库文件：`./synglyph.db`（在 `apps/api` 目录下）

## 使用 PostgreSQL

依赖里已包含 **`psycopg2-binary`**（SQLAlchemy 连接 `postgresql://` 时需要）。Docker 里若报 `No module named 'psycopg2'`，请**重建 API 镜像**（见根目录 [`docs/DOCKER.md`](../../docs/DOCKER.md)）。

如需使用 PostgreSQL，设置环境变量：

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/synglyph
```

然后运行迁移：

```bash
uv run alembic upgrade head
```
