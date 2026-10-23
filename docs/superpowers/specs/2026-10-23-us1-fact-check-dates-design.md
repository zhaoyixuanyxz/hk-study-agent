---
artifact: design-spec
version: "1.0"
created: 2026-10-23
status: draft
product: hk-study-agent
story: US-1
---

# Design: US-1 正式版上的逐条抓取日期

## Goal

正式版报告用单独「核对表」展示每一条学费、截止日期及其可回对的抓取日期。7 日调度门禁未过时，报告仍可生成，但不加核对表、不写抓取日期。打开时再按 31 天过滤。不做 US-3 过期，不改图表。

对照：[2026-10-22-旧报告正式版-用户故事.md](../../2026-10-22-旧报告正式版-用户故事.md) US-1；门禁来自 US-4（`checkSevenDaySchedulerGate`）。

## Decisions (locked)

- 正式数字只来自核对表，不靠模型章节里的学费/截止散文。
- 门禁未过：能生成报告，无核对表、无抓取日装饰（AC-5）。
- 31 天：生成时与打开时都查。

## Architecture

新增纯函数模块（进程内，非 MCP）负责核对表装配：

**输入：** 情报条目列表、核对日（香港 `YYYY-MM-DD`）、采集批次列表（供门禁）。

**输出：**

- `gatePassed: boolean`
- `rows: Array<{ itemId, infoType: "tuition"|"deadline", summary, fetchedAt, fetchedDate }>`  
  `fetchedDate` = `hongKongCalendarDate(fetchedAt)`。无合法 `fetchedAt` 时该条丢弃（本故事不用批次 `finishedAt` 顶替缺字段的条目；AC-1 的「或批次日」仅在条目已有 `fetchedAt` 且需与批次对齐校验时使用同一日历日语义）。
- `tableHtml: string` — 仅当 `gatePassed && rows.length > 0` 时非空；否则 `""`。

筛选规则（门禁已通过时）：

1. `infoType` 为 `tuition` 或 `deadline`（大小写不敏感）。
2. 存在合法 `fetchedAt`；非法则丢弃（不编日期）。
3. 抓取日距核对日 ≤ 31 个自然日（含核对日）；用香港日历计算。
4. 页脚免责、院校 `publishedAt` 单独出现不算正式行。

报告生成：调用门禁 → 装配 → 若有 `tableHtml` 则插入报告 HTML 独立章节（不进入图表区块）；报告记录持久化 `factCheckRows`（与 HTML 同存）。模型 prompt 写明：学费与截止日期以核对表为准，章节勿写可当真的具体数字。

打开已存报告：用打开日香港日期过滤 `factCheckRows`；只把未超龄行渲成正式核对表给读者。原始超龄行可不删库，但不展示为正式数字。

## Data flow

1. 生成：`listIntelligenceCollectionRuns` + 当天 HKT → `checkSevenDaySchedulerGate`。
2. 门禁未过：`factCheckRows` 空 / 不写；HTML 无抓取日章节。
3. 门禁通过：从本轮可用情报（计划引用 + intel 上下文能指回的条目）筛行 → 写 `factCheckRows` + 表 HTML。
4. 落库：HTML + `factCheckRows`。
5. 打开：打开日再滤；展示只用未超龄行。

## Error handling

- 门禁未过或筛完为空：报告仍成功；不插空表壳；不用页脚冒充逐条日期。
- 无 / 非法 `fetchedAt`：该条不进正式数字。
- 打开时全部超龄：正式核对表无行；不改分享关闭；不做 US-3。
- 模型散文仍写数字：以核对表为唯一正式源；测试约束装配与 prompt，不做全文 NLP。不改图表。

## Testing

自动化：

1. 门禁未过 → 装配空，无带抓取日的表 HTML。
2. 门禁通过 + 合格条目 → 每行有可回对抓取日历日。
3. 无 `fetchedAt` 或非 tuition/deadline → 不进正式行。
4. 生成日已超 31 天 → 不进表；打开日再超龄 → 展示去掉。
5. 页脚免责不算 AC-1（正式行须在核对表节点内）。
6. 图表相关结构不被本故事改掉。

## Out of scope

- US-3 过期 / 重新生成、US-2 家长态
- 家长账号、改图表、改授课边界
- 新增 MCP、换编排引擎
- 用页脚「数据截至」代替逐条日期

## Implementation notes (for the plan)

- 复用 `hongKongCalendarDate`、`checkSevenDaySchedulerGate`、`listIntelligenceCollectionRuns`。
- 改动面：新装配模块 + 测试；`report-service`（或报告 HTML 组装处）插入表并持久化 `factCheckRows`；打开/详情路径按打开日过滤展示；prompt 一句约束。
- 不改对话 Agent、不做分享过期。
