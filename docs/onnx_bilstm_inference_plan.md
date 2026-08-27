# ONNX BiLSTM 部署验证（仅推理）

## 为什么只接推理、不接训练

- **训练**仍完全在 PyTorch 中：LetterSequenceBiLSTM、active learning、review 评分、数据库与重训流程不变。
- **ONNX** 仅用于把**已冻结**的 checkpoint 做成与生产接近的部署形态，在 API 与 Text Reveal 里做 **PyTorch / ONNX Runtime** 对照，验证数值与展示是否可接受。

## PyTorch 与 ONNX 的边界

| 环节 | 位置 |
|------|------|
| 字符 → `input_ids` / `letter_mask` | Python：`collate_letter_batch`（与训练一致） |
| 每步 extra 特征（vowel / first / last / norm_len） | Python：与 `LetterSequenceBiLSTM._extra_features` 相同；**不**写入 ONNX 图 |
| LSTM + 各 head | ONNX：`model.onnx`（或纯 `input_ids`+`letter_mask` 当 `use_extra_features` 为 false） |
| clamp、截断到词长、JSON | Python：与原有 `predict_word` 一致 |

## 输入输出规范

**PyTorch**：`forward(input_ids, letter_mask)`。

**ONNX**（有 extra 时）：`input_ids` [B,T] int64，`letter_mask` [B,T] float32，`extra_features` [B,T,4] float32。

**ONNX**（无 extra 时）：仅前两维。

**输出**（两种后端经后处理后一致）：`pred_lab`、`pred_prominence`、`pred_spread`、`pred_boundary`（与现有 HTTP JSON 相同）。

## 数据流（简图）

```
训练: 数据 → PyTorch train → checkpoint.pt

导出: checkpoint.pt → export_bilstm_to_onnx → model.onnx + export_report.json

Parity: 同批词 → PyTorch forward + ORT run → parity_report.json

在线: 文本 → collate + extra(若需要) → backend 选择 → 统一 JSON → Text Reveal 渲染
```

## Parity 规则（脚本 / `letter_sequence.onnx.parity_check`）

- 对比四个头：`pred_lab`、`pred_prominence`、`pred_spread`、`pred_boundary`。
- 每个头报告：`shape_match`、`mean_abs_diff`、`max_abs_diff`；无 NaN/Inf。
- 默认阈值（可调）：`mean` 与 `max` 绝对误差在宽松范围内为 pass，略高为 warn。

## English 网页如何切换 backend

1. 配置 [`configs/letter_sequence/stable_checkpoints.json`](../configs/letter_sequence/stable_checkpoints.json)：`is_stable: true`、有效 `path`、可选 `onnx_path` / `onnx_dir`。
2. 启动 API（需安装 `onnxruntime`；Intel Mac 上依赖版本上界见 `apps/api/pyproject.toml` 注释）。
3. 打开 **Text Reveal**（`apps/web-english`），展开 **Model runtime（部署验证）**：
   - 选择 stable checkpoint；
   - 选择 **PyTorch** 或 **ONNX Runtime**；
   - 点击「计算模型颜色」。

与 stable 二选一：选中 stable 时，下方「训练快照」下拉会被忽略（由后端按 `checkpoint_id` 解析 .pt）。

## API 速查

- `GET /api/models/checkpoints`：manifest 列表（含 has_onnx、parity_status 等）。
- `POST /api/letter-sequence/predict-text`：body 可增加 `checkpoint_id`、`backend`（`pytorch` | `onnx`）。
- `POST /api/models/export-onnx`、`POST /api/models/parity-test`：需 `ENABLE_MODEL_RUNTIME_MUTATIONS=1`。
- `POST /api/training/snapshots/{snapshot_id}/export-onnx`：对 **已保存的 Workbench 快照** 一键导出 ONNX（仅 **bilstm**），默认输出到 checkpoint 同目录的 `onnx_runtime/`。门控与上两项相同。

## Workbench 一键导出

在 **ML workbench**（`apps/web-english`）的 **Model snapshots** 表格中，BiLSTM 行有 **「Export ONNX」** 按钮，成功后在 checkpoint 旁生成 `onnx_runtime/model.onnx` 与 `export_report.json`。再将该目录写进 `stable_checkpoints.json` 的 `onnx_dir` 即可在 Text Reveal 里选 ONNX 推理。

## 已知限制与后续

- 仅 **BiLSTM** 家族提供导出脚本；MLP / Transformer 不在此文档范围。
- **Intel macOS** 上 `onnxruntime` 需使用仍提供 x86_64 轮子的版本（与 `pyproject` 中环境标记一致）。
- 多 checkpoint 的 ORT **Session 缓存**按 ONNX 文件路径；切换 manifest 条目时会复用/新建会话。
