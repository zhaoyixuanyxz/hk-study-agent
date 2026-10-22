---
artifact: design-spec
version: "1.0"
created: 2026-10-22
status: draft
product: hk-study-agent
story: US-4
---

# Design: US-4 采集自动跑，手工调试不算

## Goal

学费和截止日期由**已跑 API 的那台服务器**上的系统定时任务触发现有采集脚本，并在批次上留下可区分「调度 / 手工」的标记。连续 7 个香港自然日都有调度完成记录之前，不改报告文案。本故事不实现逐条日期、不过期报告（那是 US-1 / US-3）。

对照：[2026-10-22-旧报告正式版-用户故事.md](../../2026-10-22-旧报告正式版-用户故事.md) US-4；任务单同一文件链的第一行。

## Architecture

- 定时装在 API 所在服务器，不装在操作者 Windows 电脑上。操作者关机不影响采集。服务器关机的那天没有批次。
- 生产数据在 Docker 卷 `app-data`。cron 用 `docker compose -f docker-compose.prod.yml exec` 进入正在跑的 `api` 容器，执行现有 `npm run intelligence:daily`，保证写入同一份数据。
- 容器内环境：`INTELLIGENCE_FETCH=1`，`COLLECTION_TRIGGER=scheduler`。时刻：每天 06:00，时区 `Asia/Hong_Kong`。
- 批次新增字段 `trigger`：`scheduler` 或 `manual`。缺字段的旧记录一律不当作调度。
- 7 日门禁：核对日为终点，向前 7 个香港自然日，每日至少一条 `trigger=scheduler` 且 `status=completed`、且把 `finishedAt`（ISO UTC）换算到 `Asia/Hong_Kong` 后落在该日的批次。本故事不把门禁接到报告生成或公开页；只提供可测的核对。

不采用：API 进程内定时（进程停就断）、GitHub Actions 直接写这份数据（还要另开入口和密钥）。

## Data flow

1. 主机 cron 到点 → `docker compose exec` → `api` 容器内 `COLLECTION_TRIGGER=scheduler INTELLIGENCE_FETCH=1 npm run intelligence:daily`。
2. `runIngestion` 结束时 `appendIntelligenceCollectionRun` 写入 `trigger`：环境变量为 `scheduler` 则 `scheduler`，否则 `manual`。`status` / `finishedAt` / `itemsIngested` / `errorMessage` 保持现有规则（失败且无入库时 `failed`）。
3. 新增只读核对函数（进程内，非 MCP）：输入核对日（香港日历），输出每日是否有合格调度完成批次，以及总门禁是否通过。`finishedAt` 按 `Asia/Hong_Kong` 归日。不计 `manual`、不计失败、不计无 `trigger` 的旧行。
4. 本故事不改报告 HTML、不改分享页。

## Error handling

- 抓取失败：仍记 `status=failed` 并带上当时的 `trigger`。失败批次不计入 7 日。不把失败日改成完成，不改报告日期。
- cron / `exec` 失败（容器未起等）：本轮不写批次；该日门禁缺一天。不在代码里自动补跑。补跑须仍是带 `COLLECTION_TRIGGER=scheduler` 的调度路径，不能用无标记的手工终端跑来补。
- 半轮失败：不从某一条 feed 接着爬；失败后整轮重跑（与架构六格一致）。

## Testing

自动化（不依赖真机 cron）：

1. `COLLECTION_TRIGGER=scheduler` → 批次 `trigger=scheduler`；未设或其它值 → `manual`。
2. 7 日核对：七天皆有调度完成 → 通过；缺一天 → 不通过；某天只有手工完成 → 不通过；某天只有失败 → 不通过；无 `trigger` 的旧记录 → 不通过。
3. 失败批次写出 `failed` 且保留 `trigger`，不记成完成。

部署：更新 [V1-云试点部署Runbook.md](../../v1.verson/V1-云试点部署Runbook.md) §8，写明 `docker compose exec`、环境变量、`Asia/Hong_Kong`。本故事不以本机真挂 cron 为完成条件；产品经理验收看核对结果与 Runbook 中可执行的调度命令。

## Out of scope

- 报告逐条抓取日期、报告过期、家长可见态（US-1 / US-3 / US-2）
- 错误预算 / SLO 数字、新增 MCP、换编排引擎
- 从半轮某一条 feed 恢复、操作者日常手工采集充当新鲜度

## Implementation notes (for the plan, not this story’s product scope)

- 改动面：`appendIntelligenceCollectionRun`（或 ingestion 调用处）写入 `trigger`；新增门禁核对模块/函数；`intelligence-daily.mjs` 透传环境变量即可；测试文件；Runbook 一行 cron。
- 不改对话 Agent、不改报告正文生成。
