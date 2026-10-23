---
artifact: design-spec
version: "1.0"
created: 2026-10-23
status: draft
product: hk-study-agent
story: US-2
---

# Design: US-2 家长看到的不是过期正式版

## Goal

家长打开学生发出的同一分享链接（无需登录）时，能分清三种结果：仍是正式版（含与学生同源的逐条抓取日期）、已过期（不是正式版）、人手关闭/无效。过期与关闭文案可区分；关闭后不得因过期规则重新打开。

对照：[2026-10-22-旧报告正式版-用户故事.md](../../2026-10-22-旧报告正式版-用户故事.md) US-2；依赖 US-3 过期分流与 US-1 核对表。

## Decisions (locked)

- **Approach A：验收加固**——三态页面文案与分流沿用 US-3/现有实现；本故事以家长向验收与测试为主，不新做角标、不加「正式版」说明条、不改学生列表。
- 过期页：保持现有短句（「这份报告已过期…」）。
- 正式版页：隐私条 + `presentReportHtmlForAsOf` 即可，不加额外说明。
- 关闭页：文案不动（「分享链接已关闭或无效。」）。

## Architecture

公开路由 `GET /api/v1/public/reports/:shareToken`（已有）：

| 状态 | 判定 | 响应 |
|------|------|------|
| 关闭/无效 | `getReportByShareToken` 无行 | `renderClosedOrInvalidShareHtml()`，404 |
| 过期 | token 有效且 `!evaluateReportFreshness(...).fresh` | `renderExpiredShareHtml()`，无正文 |
| 正式版 | fresh | 隐私条 + `presentReportHtmlForAsOf`（含 `#report-fact-check`） |

不新增 MCP；不翻转 `share.enabled`；不加家长账号。

本故事实现面：补齐/整理家长向集成测（AC-1～AC-4）；若标题或可测节点不足以区分过期与关闭，仅做最小 HTML 结构加固（例如稳定 `title` / 主文案 class），**不改用户可见句子**。

## Data flow

1. 家长打开分享 URL（无登录）。
2. 无有效 token → 关闭页。
3. 现算新鲜度 → 不 fresh → 过期页。
4. fresh → 打开日过滤核对表后返回正式 HTML。
5. 人手关闭优先：关闭后再变画像/情报，仍只出关闭页。

## Error handling

| 情况 | 行为 |
|------|------|
| 未知 token | 关闭/无效页 |
| 关闭后情报/画像再变 | 仍关闭页 |
| 评测抛错 | 过期页（与 US-3 一致） |
| 正式但核对表行全超龄 | 仍可正式 HTML；表可空；不因此单独进过期页 |

## Testing

家长向（可复用 US-3 夹具，断言文案与有无正文）：

1. AC-1：过期 → 过期页；无正式正文；≠ 关闭文案。
2. AC-2：正式 → 含核对表抓取日期（`#report-fact-check` / 「抓取日期：」）。
3. AC-3：关闭 → 「已关闭或无效」；无正文。
4. AC-4：关闭后再改情报 → 仍关闭页。

自动化：`backend/tests/us2-parent-share-states.test.js`（或扩展现有公开分享测并标明 US-2）；`npm run test:us2-parent-share`。

## Out of scope

- 家长账号、学生列表/「已分享」文案、文书与代提交
- 新做过期规则、改图表、改授课边界
- 正式页「正式版」角标或额外说明条
- 改过期/关闭页可见文案（除非验收证明不可区分——本决策下不改句）

## Implementation notes (for the plan)

- 优先验证现有 `core-routes` + `report-freshness` 渲染器已满足 AC；缺口用测试钉死。
- 关闭文案子串：`已关闭或无效`；过期：`报告已过期`；正式：`抓取日期` 或 `#report-fact-check`。
- 不改 `enableReportShare` / `revokeReportShare` 语义。
