# Phase 4：报告与历史 — 任务清单与实现索引

**版本**：v1.0  
**依据**：[MVP-完整任务拆分清单.md](MVP-完整任务拆分清单.md)、[MVP-开发路线确认稿.md](MVP-开发路线确认稿.md)、[Phase3-交付物与验收说明.md](Phase3-交付物与验收说明.md)

**实现状态**：工程已实现（报告生成与存储、历史聚合 API、单页报告/历史面板、自动化测试）。验收与交付物见 [Phase4-交付物与验收说明.md](Phase4-交付物与验收说明.md)。

---

## 1. 阶段目标、依赖与验收

| 维度 | 内容 |
|------|------|
| **阶段目标** | 基于**画像快照 + 方案结果**生成 **HTML 七章报告**并落库；提供**历史聚合**（线程 / 快照 / 方案 / 报告）。 |
| **阶段依赖** | Phase 3（`planResults`）；Phase 2（画像快照）；账号与 `auth()` 继承既有实现。 |
| **架构映射** | `ReportEngine` → `backend/src/report-service.js`；历史 → `GET /api/v1/history`。 |
| **阶段验收** | 见 [Phase4-交付物与验收说明.md](Phase4-交付物与验收说明.md)「阶段验收」 |

---

## 2. Epic 与交付物对照

| Epic | 交付物 |
|------|--------|
| P4-PM-01 | [Phase4-交付物与验收说明.md](Phase4-交付物与验收说明.md)「报告章节与字数验收表」 |
| P4-AI-01 | [report-service.js](../backend/src/report-service.js)（七章、`buildMockHtmlReport` / `generateHtmlReport`） |
| P4-AI-02 | **MVP 裁剪**：同步生成；异步队列未实施，见交付物说明 |
| P4-BE-01 | `POST /api/v1/reports/generate`、`GET /api/v1/reports`、`GET /api/v1/reports/:reportId`（[Phase4-openapi.yaml](Phase4-openapi.yaml)）、`store.reportResults` |
| P4-BE-02 | `GET /api/v1/history`；`store.listThreadsByUser` / `listProfileSnapshotsByUser` 等 |
| P4-FE-01 / P4-FE-02 | `frontend/`「报告」「历史」面板；方案页「生成报告」 |
| P4-QA-01 | [Phase4-QA-报告与历史用例.md](Phase4-QA-报告与历史用例.md)、`backend/tests/api.test.js`（Phase 4 用例） |

---

## 3. 关键路径（执行顺序）

1. 扩展 `store`：`reportResults` 与列表方法  
2. 实现 `report-service.js`（前置校验、七章 HTML、字数）  
3. 注册 API：`/reports/*`、`/history`  
4. 前端报告/历史面板与方案 → 报告 CTA  
5. OpenAPI、QA 文档、`api.test.js`  
6. 阶段验收与关闭（本文档 + 交付物与验收说明）  

---

## 4. 与 Phase 5 的边界（本阶段不做）

| 不做 | 说明 |
|------|------|
| 五页独立路由与登录注册收口 | Phase 5（见 [Phase0-五页信息架构与路由.md](Phase0-五页信息架构与路由.md)） |
| 埋点、全链路回归、PDF | Phase 5 或非 MVP |
| 报告异步任务队列 / 独立 Worker | 留待观测与迭代；本期 sync_first |
