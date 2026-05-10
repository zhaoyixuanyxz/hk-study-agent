# Phase 4 交付物与验收说明

**版本**：v1.0  
**阶段**：报告生成与历史记录（Phase 4）

## 交付物索引

| 类型 | 文档 / 位置 |
|------|----------------|
| 产品验收（P4-PM-01） | 本章「报告章节与字数验收表」；与 [MVP-产品文档-留学规划智能体.md](MVP-产品文档-留学规划智能体.md) §7.5 对齐 |
| AI / 实现 | `backend/src/report-service.js`（七章模板、Mock / DeepSeek、`REPORT_GENERATION_TIMEOUT_MS`） |
| 接口契约 | [Phase4-openapi.yaml](Phase4-openapi.yaml) |
| QA 用例 | [Phase4-QA-报告与历史用例.md](Phase4-QA-报告与历史用例.md) |
| 任务与实现索引 | [Phase4-报告与历史任务细化清单.md](Phase4-报告与历史任务细化清单.md) |
| 实现代码 | `backend/src/app.js`（`/api/v1/reports/*`、`/api/v1/history`）、`backend/src/store.js`（`reportResults`、列表查询） |
| 前端 | `frontend/` 导航「报告」「历史」面板；方案页「生成报告」。**五页独立路由**（`/report/:id` 等）留待 Phase 5 收口 |
| 自动化测试 | `backend/tests/api.test.js`（Phase 4 报告生成、列表、详情、历史、越权） |

## 报告章节与字数验收表（P4-PM-01）

| 验收项 | 可测定义 | 实现说明 |
|--------|----------|----------|
| 七章结构 | 正文中存在 7 个 `report-chapter` 章节块（服务层固定标题顺序） | `report-service.js`：`CHAPTER_DEFS` 七章 |
| 字数 | 去 HTML 标签后的连续字符数 ≥ **1000** | `countReportTextChars`；Mock 不足时自动补「补充说明」段落 |
| 免责声明 | 含不适用录取/签证承诺的表述 | 末章及方案 `disclaimer` 口径一致 |

## 阶段验收

1. 在已有**方案落库**前提下，可同步生成 HTML 报告并落库；`GET /api/v1/reports/:reportId` 可读取完整 HTML。  
2. 报告正文七章齐全且字数达标（见上表）。  
3. `GET /api/v1/history` 返回当前用户的线程、画像快照、方案、报告四类摘要；越权访问他方 `report_id` 返回 404。  
4. 单页「报告」「历史」面板可渲染报告并进入历史实体（线程 / 方案 / 报告）。  
5. **P4-AI-02（异步队列）**：本期 **不实施**；采用 **sync_first**（一次请求内生成并落库）。超时由 `REPORT_GENERATION_TIMEOUT_MS` 与模型调用约束；后续可由 Phase 5 观测指标驱动异步化。  
6. **「重新登录仍可看」**：当前 MVP 为 **Bearer Token 存 `localStorage`** 的同一账号会话；若清除存储则视为新用户。正式「账号密码登录 + 换设备」仍在 **Phase 5（P5-FE-01）**。

## 关闭后

**Phase 4 已关闭**：可启动 **Phase 5（前端闭环与上线准备）**，入口见 [Phase5-可落地任务细化清单.md](Phase5-可落地任务细化清单.md)。

**前置回顾**：报告消费 Phase 3 的 `plan` 与 Phase 2 的画像快照；不单独解析原始对话全文。
