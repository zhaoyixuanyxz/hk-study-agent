# V1 迭代进度日志

## 2026-05-28 — Sprint 5–6 完成（M3）

### Sprint 5 结构检查

- 后端 `app.js` 1023 行 → 拆至 `src/modules/*`（103 行入口）
- 前端 `main.js` 2021 行 → `api/client.js` + `pages/*` + `shell/*`（227 行入口）

### Sprint 5 交付

- `modules/context.js`、`core-routes.js`、`chat-routes.js`、`profile-routes.js`、`plan-routes.js`、`report-routes.js`、`history-routes.js`、`intelligence/router.js`
- `frontend/src/api/client.js`、`pages/{chat,profile,plan,report,history,intelligence}.js`、`shell/{navigation,router}.js`
- `tests/v1-sprint5-modular.test.js`、`verify-v1-sprint5.mjs`

### Sprint 6 交付

- `lib/loading.js` + `style.css` skeleton / `overflow-x` / 375px 媒体查询
- `docs/v1.verson/V1-Sprint6-QA-归档-2026-05-28.md`
- `scripts/deepseek-regression-smoke.mjs`（12 Mock 用例）
- `tests/v1-sprint6-quality.test.js`、`verify-v1-sprint6.mjs`

### 测试

| 命令 | 结果 |
|------|------|
| `npm run test:v1-sprint5` | 3 pass |
| `npm run test:v1-sprint6` | 3 pass + 12 smoke |
| `npm run test:v1-p6` | 67 pass / 1 skip |
| `frontend npm test` | 13 pass |
| `frontend npm run build` | pass |

### 里程碑

- [x] **M3** Week 6：AI 引用（Sprint 4）+ 模块化（Sprint 5）+ 质量/UX（Sprint 6）

## 2026-05-28 — Sprint 7 完成（M4）

### Sprint 7 交付

- `deploy/Dockerfile.backend`、`deploy/Dockerfile.frontend`、`deploy/nginx/*`
- `docker-compose.prod.yml`、`.env.production.example`
- `backend/scripts/backup-data.mjs`、`production-smoke.mjs`
- `docs/v1.verson/V1-云试点部署Runbook.md`、技术附录、范围冻结

### 测试

| 命令 | 结果 |
|------|------|
| `npm run test:v1-sprint7` | 3 pass + verify + production-smoke |
| `npm run test:v1-p6` | 70 pass / 1 skip |

### 里程碑

- [x] **M4** Week 8：Docker + 备份 + 生产冒烟脚本

### 待用户运维

- 公网域名、HTTPS 证书、`CORS_ORIGINS`、`DEEPSEEK_API_KEY`、审核员邮箱

## 2026-05-28 — 情报真爬 + 结构化

### 交付

- `real-crawler.js` + `crawl-registry.js`（港八大×7类）
- `structured` / `contentHash` / `contentText` / raw snapshots
- `npm run intelligence:sync-feeds` + 更新 `intelligence:daily`
- 前端情报卡片展示结构化字段与正文摘要

### 测试

| 命令 | 结果 |
|------|------|
| `npm run test:v1-real-crawl` | 6 pass |
| `npm run test:v1-p6` | 73 pass / 1 skip |

## 2026-05-28 — Sprint 4 完成

见上文。
