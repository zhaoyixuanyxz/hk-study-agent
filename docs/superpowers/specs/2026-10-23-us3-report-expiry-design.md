---
artifact: design-spec
version: "1.0"
created: 2026-10-23
status: draft
product: hk-study-agent
story: US-3
---

# Design: US-3 变更之后必须重新生成才能再发

## Goal

画像或该报告引用的学费/截止日期情报一变，或相对生成日已超 31 个香港自然日，已分享的旧正式版在**打开时**判为过期：公开链接只出过期页、不返回报告正文。人手关闭优先于新鲜度，且不得因过期规则重新打开已关闭链接。`is_latest` 只表示列表最新一份，不表示可外发。重新生成后的新报告才可再当作正式版发出。

对照：[2026-10-22-旧报告正式版-用户故事.md](../../2026-10-22-旧报告正式版-用户故事.md) US-3；依赖 US-1 的 `factCheckRows`。家长三态文案细化留给 US-2；本故事公开过期页须与「已关闭或无效」可区分。

## Decisions (locked)

- **Approach A**：打开时现算新鲜度；不因 stale 去改 `share.enabled`。
- 过期分享 → **专用过期页**，无报告正文。
- 情报变更 = 引用项当前 `fetchedAt`（及内容指纹）相对行内存储值有变，或库中找不到该项。
- 画像变更 = 报告上的 `snapshotId` 与该用户当前最新画像快照 id 不一致。
- 人手 `share.enabled === false`（或令牌已清）优先；一律走关闭/无效页，不走「重新打开」。
- 31 天：相对**报告生成日**的香港日历日；超窗则整份分享 stale（与 US-1「打开时滤核对表行」并存：过期页优先，不再展示滤后正文）。

## Architecture

新增纯函数（进程内，非 MCP）`evaluateReportFreshness`：

**输入：**

- 报告行：至少 `createdAt`、`snapshotId`、`factCheckRows`、`share`
- `now`（或打开日的 HKT `YYYY-MM-DD`）
- 当前用户最新画像快照 id（公开页由服务端按 `row.userId` 读取，不暴露给读者）
- 当前情报条目查找：`itemId` → `{ fetchedAt, contentFingerprint }`（找不到则视为变更）

**输出：**

```text
{ fresh: boolean, reason: "ok" | "share_disabled" | "profile_changed" | "intel_changed" | "age_exceeded" | "eval_error" }
```

判定顺序（短路径）：

1. `share` 未启用或无有效 token → `share_disabled`（调用方出关闭/无效页；本函数可对已取到的 active 行跳过此项，由路由先分流）。
2. 最新 `snapshotId !== report.snapshotId`（缺 `snapshotId` 的旧行：无法证明未变 → `profile_changed`）。
3. 对每条 `factCheckRows`：按 `itemId` 取当前项；缺失 → `intel_changed`；`fetchedAt` 与行内不等 → `intel_changed`；可选对 `summary`（或稳定字段）做指纹，与生成时写入的指纹不等 → `intel_changed`。
4. `hongKongCalendarDate(report.createdAt)` 距打开日 > 31 自然日 → `age_exceeded`。
5. 否则 `fresh: true, reason: "ok"`。

`factCheckRows` 为空或缺省（门禁未过的旧正式版）：跳过情报比对；仍做画像与 31 天。不因「无行」单独 stale。

公开路由 `/api/v1/public/reports/:shareToken`：

1. 令牌查不到或 `enabled !== true` → 现有「已关闭或无效」404 HTML（文案保持可区分）。
2. 否则跑 `evaluateReportFreshness`；`!fresh` → **过期页** HTML（无 `row.html`，说明已过期须由学生重新生成后再发）；`fresh` → 现有正文（含核对表；打开日仍可按 US-1 滤行展示）。
3. 评测抛错 → 记日志，按过期页处理（宁可不外发）。

登录态历史/详情：仍可返回正文供「留着看」，但须带 `freshness`（或等价字段），且**不得**把 stale 份标成可外发正式版；启用分享若针对 stale 份，打开仍走公开过期页。不改 `is_latest` 语义去冒充过期。

重新生成：现有 `appendReportResult` 新行即可；旧行保留；只有新行在 fresh 时可外发。

不新增 MCP；不改对话编排、图表、授课边界、采集调度。

## Data flow

1. 打开分享链接 → 读报告行（`factCheckRows`、`snapshotId`、`createdAt`、`share`）。
2. 人手关闭 / 无 token → 关闭或无效页，结束。
3. `evaluateReportFreshness`：画像 → 引用情报 → 31 天。
4. 任一命中 → 过期页；全过 → 正式正文 HTML。
5. 列表 `is_latest` 与打开是否正式版解耦。

## Error handling

| 情况 | 行为 |
|------|------|
| `shareToken` 不存在或已撤销 | 关闭/无效页（与过期页文案区分） |
| `factCheckRows` 空 | 只查画像 + 31 天 |
| 情报库找不到某 `itemId` | `intel_changed` → 过期页 |
| 评测抛错 | 过期页 + 日志 |
| 人手关闭 | 优先；不重新打开 |
| 时区 | 31 天边界一律 HKT 日历日（与 US-4/US-1 一致） |

## Testing

1. 人手关闭 → 关闭/无效页，无正文；之后情报再变更仍如此。
2. 仅画像变 / 仅某条 cited `fetchedAt`（或指纹）变 / 仅超 31 天 → 各自单独触发过期页。
3. 三者皆未变 → 正常正文（含事实核对表）。
4. 旧快照无 `factCheckRows` → 不因空表过期；画像 + 31 天仍生效。
5. 只改列表 `is_latest`、旧链接仍返回原正式 HTML → 失败（须仍为过期页）。
6. 重新生成后：旧 token 仍过期页；新报告在未变更时可正常分享正文。
7. `evaluateReportFreshness` 单测覆盖上述 reason；公开路由集成测覆盖过期页无 `row.html`。

## Out of scope

- US-2 家长三态文案与视觉细化（本故事只需过期页 ≠ 关闭页）
- US-4 门禁、图表、家长账号、港校外、本科/文书/代提交
- 因 stale 自动 `revoke` 或改 `share.enabled`
- 新增编排引擎 / MCP

## Implementation notes (for the plan)

- 新模块建议：`backend/src/intelligence/report-freshness.js`（或同级）+ 单测。
- 生成时：`factCheckRows` 已有 `itemId`/`fetchedAt`/`summary`；若需指纹，生成时写入 `contentFingerprint`（对 summary 等稳定字段哈希），旧行无指纹则只比 `fetchedAt`。
- 改动面：公开路由现算；可选登录详情返回 `freshness`；`enableReportShare` 可不拦 stale（打开时仍过期），避免与 Approach A 冲突。
- 复用 `hongKongCalendarDate`、`calendarDaysBetween` / 31 天语义。
- 过期页与关闭页标题/正文必须不同，便于 US-2 与验收区分。
