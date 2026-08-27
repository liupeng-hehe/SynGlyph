# 数据隔离约定（共享一套 PostgreSQL）

目标：多人试用时**不共享同一「词表 / 标注空间」**，且**不需要**为每人单独建数据库。

## 租户边界：`Dataset.owner`

- [`Dataset`](../apps/api/app/models/dataset.py) 有 `owner` 字段（字符串，如用户 id、邮箱前缀、或内测代号）。
- 列表与创建数据时，**应始终带上 `owner` 过滤或写入**，使每个测试者只看到自己的 `Dataset` 行。
- `selected_list_id` 等指向 `dataset.id`：同一用户下的 list 与 `UserWordRegistry`、`Stimulus.dataset_id` 一致，形成一条隔离链。

## API 使用要点

- `GET /api/datasets?owner=<id>`：只返回该 owner 的数据集；**内测时每个测试者使用不同 `owner`**。
- 若调用方不传 `owner`，历史行为可能返回默认数据集 — **不适合多用户 staging**，调用方应显式传 `owner`。

## 当前限制（诚实说明）

- 若路由**未**校验登录身份，则 `owner` 仍依赖客户端传入 — **属于协作内测约定**，不是强认证。要上公网需加 **Auth**（如 Clerk / Auth0）并把 `owner` 绑定为服务端解析的 user id。

## 中文等其它域

- 中文词典等模型有独立 `owner` 字段，同样按 owner 区分。
