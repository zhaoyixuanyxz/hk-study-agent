# Phase 5：前端闭环与上线 — 可落地任务细化清单

**版本**：v1.0  
**依据**：[MVP-完整任务拆分清单.md](MVP-完整任务拆分清单.md) §Phase 5、[MVP-开发路线确认稿.md](MVP-开发路线确认稿.md)

**实现状态**：与本仓库代码同步；验收见 [Phase5-交付物与验收说明.md](Phase5-交付物与验收说明.md)。

---

## 1. Epic 与子任务对照

| Epic | 子任务 ID | 内容 | 代码 / 文档位置 |
|------|-----------|------|-----------------|
| P5-PM-01 | P5-PM-01-T1 | 事件字典与 PRD 指标映射 | [Phase5-埋点需求与事件字典.md](Phase5-埋点需求与事件字典.md) |
| P5-PM-02 | P5-PM-02-T1 | 上线检查项 | [Phase5-上线检查清单.md](Phase5-上线检查清单.md) |
| P5-AI-01 | P5-AI-01-T1 | 模型与环境版本快照 | [Phase5-发布与模型版本说明.md](Phase5-发布与模型版本说明.md) |
| P5-BE-01 | P5-BE-01-T1 | 访问与错误日志 | `backend/src/app.js`（Fastify `logger`、路由级 log） |
| P5-BE-02 | P5-BE-02-T1 | 全局/关键路径限流 | `@fastify/rate-limit`、`APP_RATE_LIMIT_MAX` 等环境变量 |
| P5-BE-auth | — | 邮箱密码注册/登录 | `POST /api/v1/auth/register`、`POST /api/v1/auth/login`；[`store.js`](../backend/src/store.js) |
| P5-BE-events | — | 埋点落库 | `POST /api/v1/analytics/events`；`analyticsEvents` |
| P5-FE-01 | P5-FE-01-T1 | 登录/注册页与 token | `#view-auth`、`frontend/src/main.js` |
| P5-FE-02 | P5-FE-02-T1 | Hash 路由五页串联 | `#/chat` … `#/history`、`#/report/:id` |
| P5-FE-03 | P5-FE-03-T1 | `track()` 接入 | `frontend/src/track.js`、`appendAnalyticsEvents` |
| P5-QA-01–03 | — | 全链路与上线用例 | [Phase5-QA-全链路与上线用例.md](Phase5-QA-全链路与上线用例.md) |

---

## 2. 推荐执行顺序

1. 文档：埋点字典、上线检查单、交付物与验收、本清单、发布说明。  
2. 后端：密码哈希用户、`/auth/*`、保留 `POST /users/register`（兼容测试）。  
3. 前端：认证视图、Hash 路由、退出清理本地状态。  
4. 埋点 API + 前端 `track`。  
5. 日志与限流。  
6. QA 文档 + 更新 [MVP-完整任务拆分清单.md](MVP-完整任务拆分清单.md)。

---

## 3. 与 Phase 4 边界

- Phase 4 已交付报告与历史；Phase 5 补齐**正式登录后可恢复会话**（同账号换浏览器需重新登录，数据在后端按用户隔离）。  
- 报告异步队列非 Phase 5 必做（属可选优化）。
