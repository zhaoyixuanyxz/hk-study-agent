# Phase 2：画像页信息架构（P2-PM-01）

**版本**：v1.0  
**对应 Epic**：`P2-PM-01`  
**依据**：[Phase0-画像快照与planInputView契约.md](Phase0-画像快照与planInputView契约.md)、[MVP-产品文档-留学规划智能体.md](MVP-产品文档-留学规划智能体.md)

---

## 1. 页面与导航

- 与对话同屏切换：**对话** / **画像** 两个 Tab（MVP 不单独路由，降低集成成本）。
- 画像页为只读消费 `GET /api/v1/profile`（或拆分端点）返回的快照与 `plan_input_view`。

## 2. 信息区块与展示规则

| 区块 | 数据来源 | 展示规则 |
|------|----------|----------|
| 摘要 | `snapshot.summary` | 多行文本；空时提示「暂无画像，请先对话」。 |
| 待补充 | `snapshot.gaps` | 列表；无缺口时显示「当前无缺口」。 |
| 更新时间 | `snapshot.updatedAt` | 展示为「快照更新时间」ISO 或本地化可读时间。 |
| 关键事实与状态 | `snapshot.confirmationState.facts` | 每行：`key`、值、`confirmed` / `pending` / `conflict` 标签。 |
| 方案就绪 | `plan_input_view` | 展示 `readiness.ready`、`missingRequired`；可展开 JSON 供研发核对。 |

## 3. 洞察（insights）

- MVP：快照中 `insights` 以摘要或列表形式可归入「摘要」或后续独立卡片；当前实现以快照结构为准，前端可仅展示 `structuredFacts` 与 `gaps`。

## 4. 与验收关系

- 与 MVP「画像模块」一致：**可见摘要、缺口、更新时间、关键事实状态**；方案层依赖 **`planInputView`** 而非原始对话。
