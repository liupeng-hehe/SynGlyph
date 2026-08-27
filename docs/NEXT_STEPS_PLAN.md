# SynGlyph 下一步规划

## 一、工作流澄清

**是的，当前阶段就是积累标注 pool。** 流程是：
1. 添加 words（sticky note 撕下）→ 进入 stimulus pool
2. 标注（annotate）→ 每个词得到 segments + color + P×S + D
3. 保存后自动 next 下一个词
4. 积累足够后可用于训练/分析

---

## 二、多 Dataset 支持

**需求**：可以开多个 dataset，每个 dataset 有独立的词池和计数。

**Schema 变更**：
- 新增 `Dataset` 表：id, name, created_at
- `Stimulus` 表：增加 `dataset_id`（FK，可空以兼容旧数据）
- `Annotation` 通过 stimulus → dataset 关联

**API**：
- `GET/POST /api/datasets`：列出/创建 dataset
- `GET /api/stimuli?dataset_id=xxx`：按 dataset 筛选
- `GET /api/annotations/summary?dataset_id=xxx`：按 dataset 统计

---

## 三、首页 UI 改造

### 3.1 老虎机式中心区
- **移除**：6×6 词网格
- **新增**：中央一个大「滚轮」区域，点击/滚动可随机出一个 pool 里的词
- 滚出后直接跳 `/annotate/[id]`，或显示该词 + 「开始标注」按钮
- 保留：Sticky note（添加词）、Shuffle 逻辑（改为对 pool 打乱后取「下一个」）

### 3.2 标注计数
- 显示：`已标注 X / 共 Y 词`（X = 有 annotation 的数量，Y = 当前 dataset 的 stimulus 总数）
- 若有多 dataset，需有 dataset 选择器，计数随所选 dataset 变化

### 3.3 记事本 Icon（Raw Data）
- 小图标（如 📓）放在 header 或角落
- 点击后：弹出 modal/drawer，展示当前 dataset 的 raw 数据
  - 可展示：stimulus 列表 + 每个的 annotation（segments, raw_input, spans, boundary_influence）
  - 格式：JSON 或表格，便于复制/导出

### 3.4 管理员式数据管理
- 在 raw data 视图或单独的管理页：
  - 列表展示所有 stimulus
  - 每行有：词、是否已标注、删除按钮
  - 批量选择后删除
  - 「保留/删除」= 从 stimulus 表删除（并级联删除 annotation）

### 3.5 视觉风格（DotGrid 方向）
- 用 DotGrid 风格的背景（点阵 + 可选动效）
- 老虎机区域可做成「卡片 + 点阵背景」的风格
- 安装：`pnpm dlx shadcn@latest add "https://shadcnregistry.com/r/react-bits/dotgrid-js-tw"`
- 注意：依赖 gsap，移动端可能有限制

---

## 四、实施阶段建议

| 阶段 | 内容 | 优先级 |
|------|------|--------|
| **Phase 1** | 多 Dataset：schema + API + dataset 选择器 + 计数显示 | 高 |
| **Phase 2** | 老虎机 UI：替换网格为滚轮，保留添加词、Shuffle | 高 |
| **Phase 3** | 记事本 Icon：raw data 弹窗 | 中 |
| **Phase 4** | 管理页：列表 + 删除/保留 | 中 |
| **Phase 5** | DotGrid 风格背景 | 低 |

---

## 五、数据格式（各 dataset 一致）

每个 dataset 的 annotation 格式相同：
- `segments`: [{ text_span, color_lab, prominence, spread }, ...]
- `boundary_influence`: [0.5, 0.5, ...]
- `raw_input`: "a|b|c"

内容（具体词、segment 切分）不同，结构相同。
