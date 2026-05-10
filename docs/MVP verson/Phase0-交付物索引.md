# Phase 0 交付物索引

**版本**：v1.2  
**目的**：集中列出 Phase 0 已落地的文档交付物，便于评审与进入 Phase 1。

| 文档 | 说明 |
|------|------|
| [Phase0-范围基线与变更规则.md](Phase0-范围基线与变更规则.md) | In/Out Scope、变更规则、指标口径、Phase 0 验收清单 |
| [Phase0-对话建档技术路线.md](Phase0-对话建档技术路线.md) | 单 Agent、双链路、Prompt 分层、事实漂移控制 |
| [Phase0-画像快照与planInputView契约.md](Phase0-画像快照与planInputView契约.md) | 画像快照与 `planInputView` 概念契约、版本演进 |
| [Phase0-服务边界与账号鉴权.md](Phase0-服务边界与账号鉴权.md) | 模块边界、最小接口范围、账号鉴权基线 |
| [Phase0-五页信息架构与路由.md](Phase0-五页信息架构与路由.md) | 五页 IA、路由占位、导航与优先级 |
| [Phase0-主链路测试框架.md](Phase0-主链路测试框架.md) | 主链路/异常/安全观测点、样本草案 |

**依据文档**（既有）：

- [MVP-开发路线确认稿.md](MVP-开发路线确认稿.md)
- [MVP-完整任务拆分清单.md](MVP-完整任务拆分清单.md)
- [智能对话建档系统架构设计.md](智能对话建档系统架构设计.md)
- [对话建档Prompt设计稿.md](对话建档Prompt设计稿.md)
- [MVP-产品文档-留学规划智能体.md](MVP-产品文档-留学规划智能体.md)

**Phase 0 完成判定**：以上 Phase 0 交付物均已评审通过，且与依据文档无未决冲突。

---

## Phase 1 交付与执行（关联）

| 文档 | 说明 |
|------|------|
| [Phase1-对话建档核心引擎任务清单.md](Phase1-对话建档核心引擎任务清单.md) | Phase 1 按 Epic 拆分的任务、关键路径与风险 |
| [Phase1-API-联调说明.md](Phase1-API-联调说明.md) | 后端/前端启动、环境变量、端点与测试命令 |
| [Phase1-对话状态与UX原则说明.md](Phase1-对话状态与UX原则说明.md) | `P1-PM-01` UX 原则 |

**代码位置**：项目根目录 `backend/`（API）、`frontend/`（对话页 MVP）。

**说明**：Phase 1 详细任务不重复写在 [MVP-完整任务拆分清单.md](MVP-完整任务拆分清单.md) 正文中；清单文档仍保留作追溯与项目管理。

---

## Phase 2 交付与执行（关联）

| 文档 | 说明 |
|------|------|
| [Phase2-交付物与验收说明.md](Phase2-交付物与验收说明.md) | Phase 2 关闭判定、交付物索引、验收口径 |
| [Phase2-画像页信息架构.md](Phase2-画像页信息架构.md) | `P2-PM-01` 画像页 IA |
| [Phase2-QA-画像与记忆用例.md](Phase2-QA-画像与记忆用例.md) | `P2-QA-01` 用例集 |
| [Phase2-openapi.yaml](Phase2-openapi.yaml) | Phase 2 相关 HTTP 契约（OpenAPI 3） |
| [schemas/profile-snapshot.schema.json](schemas/profile-snapshot.schema.json) | 画像快照 JSON Schema |
| [schemas/plan-input-view.schema.json](schemas/plan-input-view.schema.json) | planInputView JSON Schema |

**代码位置**：`backend/`（画像管道、快照、planInputView、确认 API）；`frontend/`（对话、画像 Tab、对话内待确认卡片）。

---

## Phase 3 交付与执行（关联）

| 文档 | 说明 |
|------|------|
| [Phase3-交付物与验收说明.md](Phase3-交付物与验收说明.md) | Phase 3 关闭判定、交付物索引、验收口径 |
| [Phase3-启动检查清单.md](Phase3-启动检查清单.md) | 启动前依赖与边界检查 |
| [Phase3-方案输出规范与文案.md](Phase3-方案输出规范与文案.md) | 三档含义、免责与失败话术 |
| [Phase3-方案生成链与错误码.md](Phase3-方案生成链与错误码.md) | 输入消费、结构化输出、错误码 |
| [Phase3-QA-方案生成用例.md](Phase3-QA-方案生成用例.md) | `P3-QA-01` 用例集 |
| [Phase3-openapi.yaml](Phase3-openapi.yaml) | 方案生成与查询 HTTP 契约 |
| [schemas/plan-result.schema.json](schemas/plan-result.schema.json) | 方案结果 JSON Schema |

**代码位置**：`backend/src/planning-service.js`、`backend/src/app.js`（`/api/v1/plans/*`）、`backend/src/store.js`（`planResults`）；`frontend/`（方案页 MVP）。

---

## Phase 4 交付与执行（关联）

| 文档 | 说明 |
|------|------|
| [Phase4-交付物与验收说明.md](Phase4-交付物与验收说明.md) | Phase 4 关闭判定、验收 |
| [Phase4-报告与历史任务细化清单.md](Phase4-报告与历史任务细化清单.md) | 任务与实现索引 |
| [Phase4-QA-报告与历史用例.md](Phase4-QA-报告与历史用例.md) | QA |
| [Phase4-openapi.yaml](Phase4-openapi.yaml) | HTTP 契约 |

**代码位置**：`backend/src/report-service.js`、`/api/v1/reports/*`、`/api/v1/history`；`frontend/` 报告/历史面板。

---

## Phase 5 交付与执行（关联）

| 文档 | 说明 |
|------|------|
| [Phase5-交付物与验收说明.md](Phase5-交付物与验收说明.md) | Phase 5 验收、M4 关闭条件 |
| [Phase5-可落地任务细化清单.md](Phase5-可落地任务细化清单.md) | Epic 子任务与代码锚点 |
| [Phase5-埋点需求与事件字典.md](Phase5-埋点需求与事件字典.md) | P5-PM-01 / P5-FE-03 |
| [Phase5-上线检查清单.md](Phase5-上线检查清单.md) | P5-PM-02 |
| [Phase5-发布与模型版本说明.md](Phase5-发布与模型版本说明.md) | P5-AI-01 |
| [Phase5-QA-全链路与上线用例.md](Phase5-QA-全链路与上线用例.md) | P5-QA-01–03 |

**代码位置**：`backend/src/app.js`（`/api/v1/auth/*`、`/api/v1/analytics/events`、日志与限流）；`frontend/src/main.js`、`frontend/src/track.js`（Hash 路由与埋点）。
