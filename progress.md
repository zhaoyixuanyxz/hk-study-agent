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

## 2026-05-28 — V2 迭代方案制定（Plan/Report 内容产品化）

### 交付

- 新建 [docs/v1.verson/V1-迭代路线图V2-方案报告内容产品化.md](docs/v1.verson/V1-迭代路线图V2-方案报告内容产品化.md)
- 更新 `task_plan.md` 指向 V2 四 Sprint（CQ-A → CQ-D）
- 标定当前进度：V1 主链路 95%；CQ Prompt 40%；CQ 工程/UI 15%

### 后续执行入口

| Sprint | 重点 | 状态 |
|--------|------|------|
| CQ-A | normalize fit_note、schema、plan.txt/report.txt | **完成** |
| CQ-B | Plan/Report 前端可视化（最高优先级） | **完成** |
| CQ-C | DeepSeek 10+ 回归 + QA 矩阵 | **完成** |
| CQ-D | admission-benchmarks + intel 加权 | **完成** |

## 2026-05-28 — Sprint CQ-A 完成（M-CQ1）

### 交付

- `normalizePlanResult` 透传 `fit_note`；`buildMockStructuredPlan` 三档含 HK 权重示例
- `docs/schemas/plan-result.schema.json` 扩展；新建 `report-delivery.schema.json`
- `backend/prompts/v1/plan.txt`、`report.txt`；`loadPromptText` in `promptLayer.js`
- `normalizeReportDelivery` in `report-service.js`
- `tests/v1-cq-plan-report.test.js`（8 pass）、`scripts/verify-v1-cq-a.mjs`、`npm run test:v1-cq-a`

### 测试

| 命令 | 结果 |
|------|------|
| `npm run test:v1-cq-a` | 8 pass + verify OK |
| `npm run test:v1-p6` | 73 pass / 1 skip |

### 里程碑

- [x] **M-CQ1** Week 1：Schema + normalize + 独立 Prompt 文件

## 2026-05-28 — Sprint CQ-B 完成（M-CQ2）

### 交付

- `frontend/src/lib/plan-ui.js`：fit_note、urgency bar、执行路径、citation 增强
- `frontend/src/lib/action-plan-ui.js`：30/60/90 可勾选（localStorage）、风险仪表盘、Report 页增强
- `frontend/src/pages/plan.js`、`report.js` 集成可视化
- `frontend/src/style.css`：CQ-B 组件样式 + 375px 响应式
- `backend/src/modules/report-routes.js`：GET report 返回 `citations[]`
- `backend/scripts/verify-v1-cq-b.mjs`、`npm run test:v1-cq-b`

### 测试

| 命令 | 结果 |
|------|------|
| `frontend npm test` | 30 pass |
| `frontend npm run build` | pass |
| `npm run test:v1-cq-b` | verify OK |
| `npm run test:v1-p6` | 73 pass / 1 skip |

### 里程碑

- [x] **M-CQ2** Week 2：Plan/Report 前端可视化上线

## 2026-05-28 — Sprint CQ-C 完成（M-CQ3）

### 交付

- `backend/src/content-quality.js`：plan/report 评分、禁词检测（含免责否定句过滤）、live ≥80% 阈值
- `backend/scripts/deepseek-regression-smoke.mjs`：16 mock + 10 live 用例（无 Key 时 skip live）
- `backend/scripts/content-quality-score.mjs`、`cq-regression-helpers.mjs`、`verify-v1-cq-c.mjs`
- `backend/tests/v1-cq-content-quality.test.js`（7 pass）
- `docs/v1.verson/V1-CQ-内容质量QA矩阵.md`、`V1-CQ-Sprint-QA-归档-2026-05-28.md`
- `plan.txt` / `report.txt` 输出示例调优（见 `findings.md`）

### 测试

| 命令 | 结果 |
|------|------|
| `npm run test:v1-cq-regression` | 7 单测 + 16 mock smoke + content-quality-score PASS + verify OK |
| `npm run test:v1-p6` | 73 pass / 1 skip |

### 里程碑

- [x] **M-CQ3** Week 3：DeepSeek 回归 + QA 矩阵 + 自动化守门

## 2026-05-28 — Sprint CQ-D 完成（M-CQ4）

### 交付

- `backend/data/intelligence/admission-benchmarks.json`：24 条港八大热门项目 benchmark（GPA/语言/科目权重/竞争度）
- `backend/src/intelligence/benchmark-loader.js`：种子加载；`seed-loader.js` 集成
- `intelContextPack.js`：plan/report 生成时 benchmark 注入 + 置顶；`searchItems.js` 检索加权
- `structured-extract.js`：`benchmarkGpa`、`subjectWeights[]`、`competitionTag` 扩展
- `planning-service.js`：mock citations 优先绑定 benchmark
- `frontend/src/pages/intelligence.js`：情报卡片「参考基准」展示
- `docs/v1.verson/V1-Intelligence技术附录.md`：benchmark 数据模型说明
- `tests/v1-cq-benchmark.test.js`（9 pass）、`scripts/verify-v1-cq-d.mjs`、`npm run test:v1-cq-d`

### 测试

| 命令 | 结果 |
|------|------|
| `npm run test:v1-cq-d` | 9 pass + verify OK |
| `npm run test:v1-p6` | 73 pass / 1 skip |
| `frontend npm test && npm run build` | 30 pass + build OK |

### 里程碑

- [x] **M-CQ4** Week 4：Benchmark 数据 + Intel 加权 — **V2 迭代工程闭环完成**

## 2026-05-30 — V3 详细任务清单制定

### 交付

- [docs/v1.verson/V1-迭代路线图V3-详细任务清单.md](docs/v1.verson/V1-迭代路线图V3-详细任务清单.md)：5 阶段、70 子任务、进度看板
- [docs/v1.verson/V1-迭代路线图V3-情报引用可视化与聊天边界.md](docs/v1.verson/V1-迭代路线图V3-情报引用可视化与聊天边界.md)：V3 路线摘要
- `task_plan.md` 切换为 V3 为主入口

## 2026-05-30 — V3-INTEL 完成（M-V3-INTEL）

### 交付

- `backend/src/intelligence/url-preflight.js`：`probeUrl` / `runFeedPreflight` / `.intel-preflight-last.json`
- `POST/GET .../admin/preflight-urls` + `preflight-last`；`collect` 返回 `skipped_preflight` / `items_skipped_quality`
- `store.upsertIntelligenceItemCrawl`：质量降级不覆盖 + 保留 `approved`/`auto_published` 审核元数据
- `real-crawler.js`：跳过 preflight 失败 feed
- Admin UI：「检测链接」「安全采集」+ 探活摘要；用户 Tab「刷新列表」
- `npm run test:v1-intel-safe-merge`；`V1-Intelligence技术附录.md` V3 运维章节

### 测试

| 命令 | 结果 |
|------|------|
| `npm run test:v1-intel-safe-merge` | 7 pass + verify OK |
| `npm run test:v1-p6` | 73 pass / 1 skip |
| `frontend npm test` | 33 pass |

### 里程碑

- [x] **M-V3-INTEL** 管理员安全情报刷新

### V3 进度标定

| 阶段 | 进度 |
|------|------|
| V3-0 基线审计 | 100% |
| V3-INTEL | **100%** |
| V3-CHAT | **100%** |
| V3-KB / VIS / QA | 0%（下一阶段） |

## 2026-05-30 — V3-CHAT 完成（M-V3-CHAT）

### 交付

- `backend/src/chat-scope.js` + `data/chat-scope-rules.json`：`assessChatScope` / 可配置规则
- Prompt：`system.txt`、`collection.txt`、`advisor.txt`；`plan.txt` / `report.txt` 授课型硕士锚定
- `agent.js` / `chat-routes.js`：超范围 `scope_redirect`，跳过 phase2 建档
- `extraction.js`：越界空抽取 + `sanitizeExtractionForHkMaster`
- `tests/v1-chat-scope.test.js`（25 pass）、`verify-v1-chat-scope.mjs`、`npm run test:v1-chat-scope`
- `deepseek-regression-smoke` +2 mock（18/18）；QA 矩阵「范围合规」维度

### 测试

| 命令 | 结果 |
|------|------|
| `npm run test:v1-chat-scope` | 25 pass + verify OK |
| `npm run test:v1-cq-regression` | 18 mock smoke PASS |
| `npm run test:v1-p6` | 73 pass / 1 skip |

### 里程碑

- [x] **M-V3-CHAT** 顾问聊天香港授课型硕士边界 |

## 2026-05-30 — V3-KB 完成（M-V3-KB）

### 交付

- `backend/data/intelligence/external-kb.json`（32 条官方 URL，由 feed-urls 种子生成）
- `profile-search-hints.js`、`external-kb-loader.js`、`buildCombinedIntelContext()`（情报 + EXTERNAL_KB，≤8000 字）
- `searchItems.js` 画像加权（同校 +2、专业 +2、deadline +1）；`intelContextPack` 含 `relevance:` 行
- `citation-utils`：`filterCitationsAgainstCombinedSources`、`ext_kb_*` 白名单；引用上限 12
- `planning-service` / `report-service` mock ≥6 citations；`content-quality` 门槛 `citations_lt_6`
- Prompt：`plan.txt` / `report.txt` ≥6 引用指引；路由 plan/report/chat 使用 combined context
- `frontend/src/lib/plan-ui.js`：`ext_kb_*` 显示「官方知识库」徽章
- `tests/v1-v3-kb.test.js`（7 pass）、`verify-v1-v3-kb.mjs`、`npm run test:v1-v3-kb`

### 测试

| 命令 | 结果 |
|------|------|
| `npm run test:v1-v3-kb` | 7 pass + verify OK |
| `npm run test:v1-cq-regression` | 18 mock + content-quality-score PASS（plan 12 cites） |
| `npm run test:v1-cq-a` | 9 pass |
| `npm run test:v1-p6` | 73 pass / 1 skip |

### 里程碑

- [x] **M-V3-KB** 画像强关联引用与外链知识库 |

## 2026-05-30 — V3-VIS 完成（M-V3-VIS）

### 交付

- Schema：`plan-result.visuals`、`report-delivery.visuals`（riskMatrix、budgetBands）
- `visuals-normalize.js`：规范化 + mock 数据（禁止录取概率语义）
- Plan mock：`tierComparison` / `timelineMilestones` / `benchmarkBars`
- Report：`buildRiskItemsSectionHtml` 服务端渲染 `#report-risk-items`；mock `risk_items` + `visuals`
- 前端：Chart.js 按需加载；`plan-charts.js`、`report-charts.js`；响应式 `style.css`
- API：报告详情返回 `visuals`；HTML 内嵌 `#report-visuals-data` JSON
- `content-quality`：`visualsBonus` 指标（非硬门槛）

### 测试

| 命令 | 结果 |
|------|------|
| `npm run test:v1-v3-vis` | 7 pass + verify OK |
| `npm run test:v1-cq-regression` | 18 mock + CQ score PASS |
| `npm run test:v1-p6` | 73 pass / 1 skip |
| `frontend npm test` | 38 pass |
| `frontend npm run build` | pass（Chart 分包） |

### 里程碑

- [x] **M-V3-VIS** 方案/报告数据可视化 |

## 2026-05-30 — V3-QA 完成 · M-V3 总验收

### 交付

- `npm run test:v1-v3`：聚合 INTEL + CHAT + KB + VIS + smoke(23) + content-quality + verify
- `scripts/verify-v1-v3.mjs`：V3 产物/路由/文档守门
- `deepseek-regression-smoke`：新增 preflight mock、citations≥6、visuals、risk_items HTML
- `content-quality-score`：V3 阈值行（citations≥6、visualsBonus）
- 文档：`V1-CQ-内容质量QA矩阵`（引用深度+可视化）、`V1-V3-Sprint-QA-归档-2026-05-30.md`、`V1-主链路QA用例` V3 节、README V3 命令

### 测试（M-V3 门禁）

| 命令 | 结果 |
|------|------|
| `npm run test:v1-v3` | 全绿（含 mock 23/23） |
| `npm run test:v1-p6` | 73 pass / 1 skip |
| `frontend npm test` | 38 pass |
| `frontend npm run build` | pass |

### 里程碑

- [x] **M-V3** V3 产品迭代总验收（自动化）  
- [ ] **人工抽检 20 条**（见 V3 归档文档，上线前签字）
