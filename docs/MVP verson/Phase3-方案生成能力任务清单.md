# Phase 3：方案生成能力 — 任务清单与实现索引

**版本**：v1.0  
**依据**：[MVP-完整任务拆分清单.md](MVP-完整任务拆分清单.md)、[MVP-开发路线确认稿.md](MVP-开发路线确认稿.md)、[Phase0-画像快照与planInputView契约.md](Phase0-画像快照与planInputView契约.md)

**实现状态**：工程已实现（后端方案生成与存储、前端方案页 MVP、自动化测试）。验收与交付物见 [Phase3-交付物与验收说明.md](Phase3-交付物与验收说明.md)。

---

## 1. 阶段目标、依赖与验收

| 维度 | 内容 |
|------|------|
| **阶段目标** | 基于 `planInputView` 生成 **1 套**含冲刺/匹配/保底、解释与免责声明的结构化方案。 |
| **阶段依赖** | Phase 2（画像快照、`planInputView`、`readiness`）。 |
| **架构映射** | `PlanningEngine` → `backend/src/planning-service.js`。 |
| **阶段验收** | 就绪时可生成；未就绪返回明确错误码；结果落库且用户隔离；前端可展示成功/失败。 |

---

## 2. Epic 与交付物对照

| Epic | 交付物 |
|------|--------|
| P3-PM-01 | [Phase3-方案输出规范与文案.md](Phase3-方案输出规范与文案.md) |
| P3-AI-01 / P3-AI-02 | [Phase3-方案生成链与错误码.md](Phase3-方案生成链与错误码.md)、[schemas/plan-result.schema.json](schemas/plan-result.schema.json) |
| P3-BE-01 | `POST /api/v1/plans/generate`、`GET /api/v1/plans`、`GET /api/v1/plans/:planId`（[Phase3-openapi.yaml](Phase3-openapi.yaml)）、`store.planResults` |
| P3-BE-03 | `plan-generation-metrics.js`、`PLAN_GENERATION_TIMEOUT_MS`、`PLAN_METRICS_HTTP_TOKEN`、内部 metrics 端点；见 [Phase1-API-联调说明.md](Phase1-API-联调说明.md) |
| P3-FE-01 | `frontend/` 导航「方案」面板 |
| P3-QA-01 | [Phase3-QA-方案生成用例.md](Phase3-QA-方案生成用例.md)、`backend/tests/api.test.js`（Phase 3 用例） |

---

## 3. 关键路径（执行顺序）

1. 确认启动条件：[Phase3-启动检查清单.md](Phase3-启动检查清单.md)  
2. 冻结文案与错误语义（产品 + AI）  
3. 实现生成链与 API、落库  
4. 前端方案页联调  
5. QA 用例与阶段验收  

---

## 4. 与 Phase 4 的边界（本阶段不做）

| 不做 | 说明 |
|------|------|
| HTML 七章报告、历史聚合列表 | Phase 4 |
| 院校库检索、多方案对比 | MVP 范围外 |
