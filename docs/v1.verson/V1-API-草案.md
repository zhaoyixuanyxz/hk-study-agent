# V1 API 草案

**版本**：v1.0  
**基础路径**：`/api/v1`（与 MVP 一致）  
**鉴权约定**：私有接口默认 `Authorization: Bearer <token>`；公开分享等特殊路径见下文。

---

## 1. 已有接口（MVP，V1 继续沿用）

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/health` | 无 | 健康检查 |
| POST | `/api/v1/users/register` | 无 | 匿名快速注册 |
| POST | `/api/v1/auth/register` | 无 | 邮箱注册 |
| POST | `/api/v1/auth/login` | 无 | 邮箱登录 |
| POST | `/api/v1/analytics/events` | Bearer | 埋点上报 |
| POST | `/api/v1/threads` | Bearer | 创建会话 |
| PATCH | `/api/v1/threads/:threadId` | Bearer | body `{ "pinned": boolean }` 置顶/取消置顶 |
| DELETE | `/api/v1/threads/:threadId` | Bearer | 删除该会话及本会话产生的数据：消息、thread 摘要、`threadId` 相同的 profile 记忆与语义块、带该 `threadId` 的画像快照，以及引用这些快照的方案与报告；不可恢复。若本次删除触及上述建档数据，会追加一条 `threadId` 为空的**聚合快照**，使 `GET /profile` 内嵌 facts 与剩余记忆一致（纯空会话删除不产生） |
| GET | `/api/v1/threads/:threadId` | Bearer | 会话详情 |
| GET | `/api/v1/threads/:threadId/messages` | Bearer | 消息列表 |
| POST | `/api/v1/threads/:threadId/messages` | Bearer | 发送消息 |
| GET | `/api/v1/profile` | Bearer | Profile 载荷 |
| GET | `/api/v1/profile/snapshot` | Bearer | 画像快照 |
| GET | `/api/v1/profile/plan-input` | Bearer | Plan 输入视图 |
| GET | `/api/v1/profile/memories` | Bearer | 语义记忆摘要 |
| POST | `/api/v1/profile/confirmations/:factId` | Bearer | 事实确认 |
| POST | `/api/v1/plans/generate` | Bearer | 生成方案 |
| GET | `/api/v1/plans` | Bearer | 方案列表 |
| GET | `/api/v1/plans/:planId` | Bearer | 方案详情 |
| POST | `/api/v1/reports/generate` | Bearer | 生成报告 |
| GET | `/api/v1/reports` | Bearer | 报告列表 |
| GET | `/api/v1/reports/:reportId` | Bearer | 报告详情（HTML Payload） |
| GET | `/api/v1/history` | Bearer | 历史聚合 |
| GET | `/api/v1/internal/plan-generation/metrics` | Bearer / 后续可收紧 | 内部指标 |

**Breaking 风险提示**：`/api/v1/reports/:reportId` 若扩展 `share`、`pdf` 子资源时，应保持旧 GET 语义或版本化 `/api/v2`。

---

## 2. V1 已实现：报告交付（P3）

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/v1/reports/:reportId/pdf` | Bearer | PDF 流；`PDF_DISABLED=1` 时返回 501 |
| POST | `/api/v1/reports/:reportId/share` | Bearer | 开启分享，返回 `share_token`、`url_path` |
| DELETE | `/api/v1/reports/:reportId/share` | Bearer | 关闭分享 |
| GET | `/api/v1/public/reports/:shareToken` | 无 | HTML 报告快照 + 隐私提示，不含 `userId` 等私有字段 |

---

## 3. V1 已实现：Intelligence（P4–P5）

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/v1/intelligence/items` | Bearer | 列表 + 筛选；**仅返回已上线**（`auto_published` / `approved`） |
| GET | `/api/v1/intelligence/items/:itemId` | Bearer | 详情 + 时间线 + 可选原文快照；待审核/已拒绝对非审核员为 404 |
| GET | `/api/v1/intelligence/review/status` | Bearer | `{ can_review }`：当前邮箱是否在 `INTELLIGENCE_REVIEWER_EMAILS` |
| GET | `/api/v1/intelligence/review/queue` | Bearer 审核员 | `?status=pending_review`：待审核列表（含 `machine_summary_zh`） |
| POST | `/api/v1/intelligence/review/decide` | Bearer 审核员 | body：`item_id`、`decision`：`approve` \| `reject`；可选 `rejection_reason`；`approve` 时可选 `product_curated` |
| POST | `/api/v1/intelligence/admin/bootstrap-reviewer` | Bearer | 首次将当前登录邮箱写入审核名单（无 env、且无已有审核员时） |
| GET | `/api/v1/intelligence/admin/workspace` | Bearer 审核员 | `feeds`、`reviewers`、`sources`、`schools` |
| POST | `/api/v1/intelligence/admin/feeds` | Bearer 审核员 | 添加采集 URL（`url`、`source_id`、`school_ids_text`、`info_type`） |
| DELETE | `/api/v1/intelligence/admin/feeds/:feedId` | Bearer 审核员 | 删除采集行 |
| POST | `/api/v1/intelligence/admin/feeds/import-template` | Bearer 审核员 | 合并仓库 `feed-urls.json` 模板 |
| POST | `/api/v1/intelligence/admin/collect` | Bearer 审核员 | 服务端执行抓取入库（等同 `intelligence:daily`） |
| POST | `/api/v1/intelligence/admin/reviewers` | Bearer 审核员 | body：`email` |
| DELETE | `/api/v1/intelligence/admin/reviewers?email=` | Bearer 审核员 | 移除审核员邮箱 |
| GET | `/api/v1/intelligence/search` | Bearer | 关键词 + 结构化筛选 + 分页；**仅检索已上线条目** |
| POST | `/api/v1/intelligence/search/summary` | Bearer | AI 摘要；检索池同上 |
| GET | `/api/v1/intelligence/schools` | Bearer | 院校卡片列表（计数仅含已上线条目） |
| GET | `/api/v1/intelligence/schools/:schoolId` | Bearer | 院校概览 + 最新条目 + 时间线（同上） |
| GET | `/api/v1/intelligence/alerts` | Bearer | 站内提醒 |
| GET | `/api/v1/intelligence/follows` | Bearer | 关注列表 |
| POST | `/api/v1/intelligence/follows` | Bearer | 关注院校或专业向 |
| DELETE | `/api/v1/intelligence/follows/:followId` | Bearer | 取消关注 |
| POST | `/api/v1/intelligence/prefs/mark-opened` | Bearer | 记录用户已打开情报页（用于徽标） |
| POST | `/api/v1/intelligence/review/batch-decide` | Bearer 审核员 | body：`item_ids[]`、`decision`（`approve`|`reject`）；可选共用 `rejection_reason` |
| PATCH | `/api/v1/intelligence/items/:itemId/curated` | Bearer 审核员 | body：`product_curated`（仅已上线条目） |
| PUT | `/api/v1/intelligence/admin/discovery/policy` | Bearer 审核员 | 全网发现策略：`rssFeeds`、`sitemapSeeds`、`linkFollowSeeds`、`budget*`、`autoPublishNonOfficialLowRisk`、`sampleRatePct`、`respectRobotsTxt` 等 |
| POST | `/api/v1/intelligence/admin/discovery/run` | Bearer 审核员 | 异步发现批次（并发锁） |
| POST | `/api/v1/intelligence/admin/discovery/circuit/reset` | Bearer 审核员 | 重置熔断计数 |
| GET | `/api/v1/intelligence/admin/discovery/jobs/:jobId` | Bearer 审核员 | 单次任务摘要 |
| POST | `/api/v1/intelligence/admin/items/:itemId/delete` | Bearer 审核员 | 永久删除条目 |
| POST | `/api/v1/intelligence/admin/items/:itemId/refetch` | Bearer 审核员 | 重抓正文；已上线条目若快照 SHA 变化可回到 `pending_review` |
| GET | `/api/v1/intelligence/admin/metrics/discovery` | Bearer 审核员 | `?limit=`；丢弃原因等 rollup |
| GET | `/api/v1/intelligence/admin/audit-samples` | Bearer 审核员 | `?limit=`；自动上架抽检记录 |

管理员写接口在非审核员 Token 下期望 **403**。

**内部 / 运维向**：`npm run intelligence:daily` 读取 `data/intelligence/feed-urls.json` 与 `sources.json` 做 HTTP 抓取，入库为 **`pending_review`**；审核台批准后对用户端可见。详见 README 与 [V1-上线检查清单.md](V1-上线检查清单.md)。

---

## 4. V1：引用与就绪（可被 Chat / Plan / Report 共用）

| 方法 | 路径（草案） | 鉴权 | 说明 |
|------|----------------|------|------|
| GET | `/api/v1/workspace/readiness` | Bearer | 建档与报告就绪（聚合 chat-advisor readiness） |

**实现说明**：就绪信息已挂在 `POST /api/v1/threads/:id/messages` 响应（`report_readiness`、`profile_progress` 等）及 Plan/Report 相关接口；未单独暴露 `/workspace/readiness` 端点时可继续沿用字段扩展方式。

---

## 5. 状态标注汇总

| 领域 | 状态 |
|------|------|
| 认证 / 会话 / Profile / Plan 生成 | 已有 |
| 报告生成与列表详情 | 已有（HTML）；PDF / 公开分享 | **已有** |
| History | **已有聚合** |
| Intelligence | **已有**（检索、摘要、院校、关注、徽标） |
| 埋点 | `POST /api/v1/analytics/events`；事件字典见 [V1-埋点事件字典.md](V1-埋点事件字典.md) |
