# Phase 5 交付物与验收说明

**版本**：v1.0  
**阶段**：前端闭环与上线准备（Phase 5）

## 交付物索引

| 类型 | 文档 / 位置 |
|------|----------------|
| 可落地任务 | [Phase5-可落地任务细化清单.md](Phase5-可落地任务细化清单.md) |
| 埋点（P5-PM-01） | [Phase5-埋点需求与事件字典.md](Phase5-埋点需求与事件字典.md) |
| 上线检查（P5-PM-02） | [Phase5-上线检查清单.md](Phase5-上线检查清单.md) |
| 模型与发布（P5-AI-01） | [Phase5-发布与模型版本说明.md](Phase5-发布与模型版本说明.md) |
| QA | [Phase5-QA-全链路与上线用例.md](Phase5-QA-全链路与上线用例.md) |
| 账号 API | `POST /api/v1/auth/register`、`POST /api/v1/auth/login`；[`backend/src/store.js`](../backend/src/store.js)（`email`、`passwordHash`） |
| 埋点 API | `POST /api/v1/analytics/events`（需鉴权） |
| 前端 | Hash 路由 `#/chat` … `#/history`、`#/login`、`#/register`；[`frontend/src/main.js`](../frontend/src/main.js)、[`frontend/src/track.js`](../frontend/src/track.js) |

## 阶段验收

1. **账号**：用户可通过邮箱+密码注册、登录；登录后获得 `token`，可访问全部需鉴权 API；退出后清除本地 token，需重新登录。  
2. **五页路径**：Hash 路由可达对话、画像、方案、报告（含 `#/report/:id`）、历史；未登录访问业务页时进入登录/注册流。  
3. **埋点**：前端对事件字典中的核心事件调用 `track`；后端可持久化事件（`analyticsEvents`）便于统计。  
4. **观测**：生产可开日志级别；关键路径有请求记录；全局限流可配置（防滥用）。  
5. **安全**：密码以哈希存储，不以明文落盘；越权仍为 404/401。

## 关闭条件（试运行 / M4）

- [MVP-完整任务拆分清单.md](MVP-完整任务拆分清单.md) 中 Phase 5 Epic 与上述验收一致。  
- [Phase5-上线检查清单.md](Phase5-上线检查清单.md) 可打勾或通过评审。  
- QA 主链路无 P0/P1 阻塞（见 [Phase5-QA-全链路与上线用例.md](Phase5-QA-全链路与上线用例.md)）。

**Phase 5 关闭后**：MVP 主链路与试运行门禁就绪；后续迭代（异步报告、独立部署拓扑等）按范围基线变更管理。
