# Docker 使用说明（含与 Git 的对照）

## 这条命令在干什么？

| 概念 | 一句话 | 和 Git 的类比 |
|------|--------|----------------|
| **Image（镜像）** | 只读的「运行环境 + 代码 + 依赖」快照 | 像某次 **commit** 的**可运行**快照（但比 commit 更重，包含系统库） |
| **Container（容器）** | 从镜像跑起来的**进程**（可起多个） | 像把某个 commit **checkout 出来跑起来**；删容器不等于删镜像 |
| **Dockerfile** | 定义「如何**构建**镜像」的脚本 | 像 **Makefile / CI 脚本**：一步步产出 artifact |
| **Compose** | 一次定义多个服务（DB + API + Web）怎么连 | 像 **一组配套的仓库子模块 + 启动脚本**，但网络由 Compose 配好 |
| **Volume** | 把数据存在镜像外（数据库文件持久化） | **不要**把数据库只放在容器可写层里；Volume 像「工作区外的持久目录」 |
| **Registry** | 存镜像的地方（Docker Hub、ECR 等） | 像 **remote**：`docker push` ≈ `git push`，`pull` ≈ `git fetch` + checkout image |

**记忆口诀**：镜像 ≈ 模板；容器 ≈ 正在跑的实例；Compose ≈ 本地一键起全套。

## 本仓库里有什么？

| 文件 | 作用 |
|------|------|
| [`.dockerignore`](.dockerignore) | 减小 `docker build` 上下文（类似 `.gitignore`，但只影响发给 Docker daemon 的文件） |
| [`apps/api/Dockerfile`](apps/api/Dockerfile) | 构建 **FastAPI** 镜像（`uv sync` + `uvicorn`） |
| [`apps/api/docker-entrypoint.sh`](apps/api/docker-entrypoint.sh) | 启动前：若 `DATABASE_URL` 是 Postgres 则 `alembic upgrade head` |
| [`apps/web-english/Dockerfile`](apps/web-english/Dockerfile) | 构建 **web-english**（`pnpm build` + Next `standalone`） |
| [`docker-compose.yml`](docker-compose.yml) | **db + api + web** 一键启动 |

## 常用命令（习惯养成）

**构建并启动全套（最常用）**

```bash
docker compose up --build
```

- 首次会较慢（拉基础镜像、装 PyTorch 等）。
- 浏览器：前端 [http://localhost:31415](http://localhost:31415)（Compose 故意不用 3000，避免与本机 `pnpm dev` 冲突），API 文档 [http://localhost:8000/docs](http://localhost:8000/docs)。

**后台运行**

```bash
docker compose up -d --build
```

**只看日志**

```bash
docker compose logs -f api
```

**停掉并删容器（Volume 里的数据库默认保留）**

```bash
docker compose down
```

**连删 Volume（清空 Postgres 数据，慎用）**

```bash
docker compose down -v
```

**只构建 API 镜像（调试 Dockerfile）**

```bash
docker build -f apps/api/Dockerfile -t synglyph-api .
```

**只构建 Web 镜像（可改 API 地址）**

```bash
docker build -f apps/web-english/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000 \
  -t synglyph-web .
```

`NEXT_PUBLIC_*` 在 **构建时** 写入前端包；改 API 地址需 **重新 build web**，不能只改运行时环境变量。

## 与 [`docs/DEPLOYMENT.md`](DEPLOYMENT.md) 的关系

- **Compose**：适合本地/小团队与「整条链一键起」。
- **云上 PaaS / AWS**：通常要么 **直接 build Dockerfile**，要么平台自己检测语言；环境变量仍用 `DATABASE_URL`、`SYNGLYPH_CORS_ORIGINS`、`NEXT_PUBLIC_API_URL` 同一套思路。

## 端口冲突

若报错 `bind: address already in use`（常见于 **3000** 已被本机 `pnpm dev` 占用），本仓库 Compose 已将 **web 映射到主机 31415**（`31415:3000`），请打开 **http://localhost:31415**。若仍冲突，可再改 `docker-compose.yml` 里 `ports` 的第一段数字。

## API：`relation "span" does not exist`（Alembic 首个迁移）

空 PostgreSQL 上，旧版迁移链假定 `span` 等表已由本地 SQLite 的 `create_all` 建好。首个迁移 [`519ad1977ed8`](../apps/api/alembic/versions/519ad1977ed8_annotation_schema_revision.py) 在**空库**上只用**同一条 Alembic 连接**执行 `Base.metadata.create_all`（已导入全部 `app.models`），再执行原有 `ALTER`。不要在迁移里再调用 `ensure_training_tables(engine)`：那会从连接池再取一条连接做 DDL，在 Postgres 上容易死锁，并出现 `server closed the connection unexpectedly`。

若迁移曾失败过半截，请清空卷后重来：`docker compose down -v`，然后**强制用当前代码重建 API 镜像**（见下节）。

## API：Alembic 卡在 `ensure_training_tables` / `CREATE TABLE training_run` / `server closed the connection unexpectedly`

说明跑的还是**旧镜像**（镜像里迁移仍含 `ensure_training_tables(bind.engine)`），或 Postgres 在死锁后被中断。

1. 确认本机 `apps/api/alembic/versions/519ad1977ed8_*.py` 里**没有**对 `ensure_training_tables` 的调用（只有注释提到它）。
2. 在项目根目录**无缓存重建 API** 并启动：

```bash
docker compose build api --no-cache
docker compose down -v
docker compose up
```

`-v` 会删掉 Postgres volume；若需保留数据，先备份再操作。仅重建镜像可省略 `down -v`，但若库已半迁移失败，仍建议 `-v` 后重跑。

## API：`ModuleNotFoundError: No module named 'psycopg2'`

连接 **PostgreSQL** 需要 `psycopg2-binary`（已在 `apps/api/pyproject.toml` / `uv.lock`）。若仍报错，说明 **API 镜像是在加入该依赖之前构建的**，或用了旧缓存。

在项目根目录**强制重建 API 镜像**后再启动：

```bash
docker compose build api --no-cache
docker compose up
```

或一次性：`docker compose up --build`（确保会重新执行 `uv sync --frozen` 那一层）。

## 注意事项

1. **API 镜像体积较大**（含 PyTorch CPU 等），属正常。
2. **Windows**：若 `docker-entrypoint.sh` 报奇怪错，检查是否 CRLF 换行，改为 LF。
3. **生产**：勿在公网把 `SYNGLYPH_CORS_ORIGINS` 设为 `*`；与部署文档一致，写明确的前端 origin。
