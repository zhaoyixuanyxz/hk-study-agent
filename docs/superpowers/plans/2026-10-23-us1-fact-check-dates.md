# US-1 正式版逐条抓取日期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在正式版报告中用可持久化的核对表展示学费/截止日期及可回对的抓取日期；7 日调度门禁未过则不加表；打开时再按 31 天过滤。

**Architecture:** 纯函数装配核对表（复用 US-4 门禁与香港日历日）；报告生成时嵌入 HTML 并持久化 `factCheckRows`；详情接口按打开日过滤后返回展示用 HTML。模型章节不以散文学费/截止为正式数字源。

**Tech Stack:** Node.js（ESM）、`node:test`、现有 `report-service` / `store` / `report-routes`。

**Spec:** [docs/superpowers/specs/2026-10-23-us1-fact-check-dates-design.md](../specs/2026-10-23-us1-fact-check-dates-design.md)

---

## File map

- Create: `backend/src/intelligence/fact-check-table.js` — `isFetchedWithinDays`、`buildFactCheckTable`、`filterFactCheckRowsForAsOf`、`renderFactCheckTableHtml`
- Create: `backend/tests/us1-fact-check-dates.test.js`
- Modify: `backend/src/report-service.js` — 生成时装配并插入 `#report-fact-check`；返回 `factCheckRows`；prompt 一句约束
- Modify: `backend/src/store.js` — `appendReportResult` 持久化 `factCheckRows`
- Modify: `backend/src/modules/report-routes.js` — 生成传入 runs/items/asOf；详情返回过滤后的 html + fact_check_rows
- Modify: `backend/package.json` — `test:us1-fact-check`
- Do not modify: 图表 visuals、分享关闭语义、对话 Agent、US-3 过期
- Do not add: MCP

Working directory for commands: `C:\Users\Eason Zhao\Desktop\hk-study-agent\backend` unless noted.

Commit steps：仅当操作者明确要求提交时执行；否则跳过。

---

### Task 1: 31 天判定与核对表装配纯函数

**Files:**
- Create: `backend/src/intelligence/fact-check-table.js`
- Create: `backend/tests/us1-fact-check-dates.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isFetchedWithinDays,
  buildFactCheckTable,
  filterFactCheckRowsForAsOf,
  renderFactCheckTableHtml,
} from "../src/intelligence/fact-check-table.js";

test("isFetchedWithinDays: inclusive 31 Hong Kong calendar days", () => {
  assert.equal(isFetchedWithinDays("2026-09-22T04:00:00.000Z", "2026-10-23"), true); // 31 days span
  assert.equal(isFetchedWithinDays("2026-09-21T04:00:00.000Z", "2026-10-23"), false);
  assert.equal(isFetchedWithinDays("not-a-date", "2026-10-23"), false);
});

test("buildFactCheckTable: gate fail yields empty tableHtml and rows", () => {
  const items = [
    {
      id: "t1",
      infoType: "tuition",
      fetchedAt: "2026-10-20T04:00:00.000Z",
      locale: { summaryZh: "学费约 20 万港币" },
    },
  ];
  const runs = []; // no scheduler completed days
  const out = buildFactCheckTable({
    items,
    runs,
    asOfDate: "2026-10-23",
  });
  assert.equal(out.gatePassed, false);
  assert.deepEqual(out.rows, []);
  assert.equal(out.tableHtml, "");
});

test("buildFactCheckTable: gate pass includes tuition/deadline with fetchedAt within 31d", () => {
  const days = [
    "2026-10-17",
    "2026-10-18",
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
    "2026-10-23",
  ];
  const runs = days.map((d) => ({
    status: "completed",
    trigger: "scheduler",
    finishedAt: `${d}T04:00:00.000Z`,
  }));
  const items = [
    {
      id: "t1",
      infoType: "tuition",
      fetchedAt: "2026-10-20T04:00:00.000Z",
      locale: { summaryZh: "港大授课型硕士学费摘要" },
    },
    {
      id: "d1",
      infoType: "deadline",
      fetchedAt: "2026-10-19T04:00:00.000Z",
      locale: { titleZh: "申请截止" },
    },
    {
      id: "p1",
      infoType: "policy",
      fetchedAt: "2026-10-20T04:00:00.000Z",
      locale: { summaryZh: "政策" },
    },
    {
      id: "t2",
      infoType: "tuition",
      locale: { summaryZh: "无抓取日" },
    },
    {
      id: "t3",
      infoType: "tuition",
      fetchedAt: "2026-08-01T04:00:00.000Z",
      locale: { summaryZh: "过旧" },
    },
  ];
  const out = buildFactCheckTable({ items, runs, asOfDate: "2026-10-23" });
  assert.equal(out.gatePassed, true);
  assert.equal(out.rows.length, 2);
  assert.ok(out.rows.every((r) => r.fetchedDate && r.itemId && r.infoType));
  assert.ok(out.tableHtml.includes('id="report-fact-check"'));
  assert.ok(out.tableHtml.includes("2026-10-20"));
  assert.ok(out.tableHtml.includes("2026-10-19"));
  assert.ok(!out.tableHtml.includes("数据可能变化")); // footer disclaimer must not be the only signal
});

test("filterFactCheckRowsForAsOf drops stale rows on open day", () => {
  const rows = [
    {
      itemId: "t1",
      infoType: "tuition",
      summary: "x",
      fetchedAt: "2026-09-01T04:00:00.000Z",
      fetchedDate: "2026-09-01",
    },
    {
      itemId: "t2",
      infoType: "tuition",
      summary: "y",
      fetchedAt: "2026-10-20T04:00:00.000Z",
      fetchedDate: "2026-10-20",
    },
  ];
  const filtered = filterFactCheckRowsForAsOf(rows, "2026-10-23");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].itemId, "t2");
  const html = renderFactCheckTableHtml(filtered);
  assert.ok(html.includes("t2") || html.includes("y") || html.includes("2026-10-20"));
  assert.equal(renderFactCheckTableHtml([]), "");
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd "C:\Users\Eason Zhao\Desktop\hk-study-agent\backend"
node --test tests/us1-fact-check-dates.test.js
```

Expected: FAIL（模块不存在）

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/intelligence/fact-check-table.js`:

```js
import { hongKongCalendarDate } from "./collection-trigger.js";
import { checkSevenDaySchedulerGate } from "./collection-gate.js";

function escapeHtmlText(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

/** Inclusive calendar-day distance: asOf - fetched, in whole days. */
export function calendarDaysBetween(fetchedYmd, asOfYmd) {
  const a = parseYmd(fetchedYmd);
  const b = parseYmd(asOfYmd);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const t0 = Date.UTC(a.y, a.mo - 1, a.d);
  const t1 = Date.UTC(b.y, b.mo - 1, b.d);
  return Math.round((t1 - t0) / 86400000);
}

/**
 * @param {string} fetchedAtIso
 * @param {string} asOfDate YYYY-MM-DD HKT
 * @param {number} [maxDays=31]
 */
export function isFetchedWithinDays(fetchedAtIso, asOfDate, maxDays = 31) {
  let fetchedDate;
  try {
    fetchedDate = hongKongCalendarDate(fetchedAtIso);
  } catch {
    return false;
  }
  const delta = calendarDaysBetween(fetchedDate, asOfDate);
  return delta >= 0 && delta <= maxDays;
}

function itemSummary(item) {
  const loc = item && item.locale && typeof item.locale === "object" ? item.locale : {};
  return String(loc.summaryZh || loc.titleZh || item.title || item.id || "").slice(0, 500);
}

/**
 * @param {{ itemId: string, infoType: string, summary: string, fetchedAt: string, fetchedDate: string }[]} rows
 */
export function renderFactCheckTableHtml(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const body = rows
    .map((r) => {
      const typeZh = r.infoType === "deadline" ? "截止日期" : "学费";
      return `<tr data-item-id="${escapeHtmlText(r.itemId)}"><td>${escapeHtmlText(typeZh)}</td><td>${escapeHtmlText(r.summary)}</td><td class="fact-fetched-date">抓取日期：${escapeHtmlText(r.fetchedDate)}</td></tr>`;
    })
    .join("");
  return `<section class="report-chapter" id="report-fact-check"><h2>学费与截止日期核对</h2><table class="fact-check-table"><thead><tr><th>类型</th><th>内容</th><th>抓取日期</th></tr></thead><tbody>${body}</tbody></table></section>`;
}

/**
 * @param {{ itemId: string, infoType: string, summary: string, fetchedAt: string, fetchedDate: string }[]} rows
 * @param {string} asOfDate
 */
export function filterFactCheckRowsForAsOf(rows, asOfDate) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r && r.fetchedAt && isFetchedWithinDays(r.fetchedAt, asOfDate, 31));
}

/**
 * @param {{ items: object[], runs: object[], asOfDate: string }} input
 */
export function buildFactCheckTable({ items, runs, asOfDate }) {
  const gate = checkSevenDaySchedulerGate({ asOfDate, runs: runs || [] });
  if (!gate.passed) {
    return { gatePassed: false, rows: [], tableHtml: "" };
  }
  const rows = [];
  for (const item of items || []) {
    if (!item || typeof item !== "object") continue;
    const infoType = String(item.infoType || "").toLowerCase();
    if (infoType !== "tuition" && infoType !== "deadline") continue;
    const fetchedAt = item.fetchedAt != null ? String(item.fetchedAt) : "";
    if (!fetchedAt || !isFetchedWithinDays(fetchedAt, asOfDate, 31)) continue;
    let fetchedDate;
    try {
      fetchedDate = hongKongCalendarDate(fetchedAt);
    } catch {
      continue;
    }
    rows.push({
      itemId: String(item.id || item.itemId || "").trim() || `fact_${rows.length + 1}`,
      infoType,
      summary: itemSummary(item),
      fetchedAt,
      fetchedDate,
    });
  }
  return {
    gatePassed: true,
    rows,
    tableHtml: renderFactCheckTableHtml(rows),
  };
}
```

Adjust the first boundary test if Hong Kong day math for `2026-09-22` vs `2026-10-23` is off by one: keep **inclusive ≤31** and fix the fixture dates so one case is exactly 31 and one is 32.

- [ ] **Step 4: Run test to verify it passes**

```powershell
node --test tests/us1-fact-check-dates.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**（仅当操作者明确要求）

```powershell
cd "C:\Users\Eason Zhao\Desktop\hk-study-agent"
git add backend/src/intelligence/fact-check-table.js backend/tests/us1-fact-check-dates.test.js
git commit -m "feat(us1): assemble fact-check table with fetch dates"
```

---

### Task 2: 报告生成嵌入核对表并持久化 `factCheckRows`

**Files:**
- Modify: `backend/src/report-service.js`
- Modify: `backend/src/store.js`（`appendReportResult`）
- Modify: `backend/src/modules/report-routes.js`
- Modify: `backend/tests/us1-fact-check-dates.test.js`（追加集成向单测，可用 mock 生成路径）

- [ ] **Step 1: Write the failing test**

Append to `us1-fact-check-dates.test.js` a test that imports a small helper exported from report-service, e.g. `injectFactCheckIntoReportHtml(html, tableHtml)`:

```js
import { injectFactCheckIntoReportHtml } from "../src/report-service.js";

test("injectFactCheckIntoReportHtml inserts section before closing article", () => {
  const base = `<article class="study-report"><section id="parent-summary">x</section><script type="application/json" id="report-visuals-data">{}</script></article>`;
  const table = `<section class="report-chapter" id="report-fact-check"><h2>学费与截止日期核对</h2></section>`;
  const out = injectFactCheckIntoReportHtml(base, table);
  assert.ok(out.includes('id="report-fact-check"'));
  assert.ok(out.includes('id="report-visuals-data"'));
  assert.equal(injectFactCheckIntoReportHtml(base, ""), base);
});
```

Also add store persistence test:

```js
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../src/store.js";

test("appendReportResult persists factCheckRows", () => {
  const dir = mkdtempSync(join(tmpdir(), "us1-rep-"));
  const store = createStore(join(dir, "db.json"));
  const rows = [
    {
      itemId: "t1",
      infoType: "tuition",
      summary: "fee",
      fetchedAt: "2026-10-20T04:00:00.000Z",
      fetchedDate: "2026-10-20",
    },
  ];
  const saved = store.appendReportResult({
    userId: "u1",
    planId: "p1",
    html: "<article></article>",
    factCheckRows: rows,
    wordCount: 1,
  });
  assert.equal(saved.factCheckRows.length, 1);
  assert.equal(saved.factCheckRows[0].itemId, "t1");
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
node --test tests/us1-fact-check-dates.test.js
```

Expected: FAIL on missing export / missing field

- [ ] **Step 3: Write minimal implementation**

In `report-service.js` add:

```js
export function injectFactCheckIntoReportHtml(html, tableHtml) {
  const table = String(tableHtml || "");
  if (!table) return String(html || "");
  const s = String(html || "");
  const marker = "</article>";
  const idx = s.lastIndexOf(marker);
  if (idx === -1) return `${s}\n${table}`;
  return `${s.slice(0, idx)}\n${table}\n${s.slice(idx)}`;
}
```

In `generateHtmlReport` (and mock path that builds the same `html` return shape):

1. Accept optional `opts.factCheck` = `{ items, runs, asOfDate }` or precomputed `{ rows, tableHtml }`.
2. Prefer calling `buildFactCheckTable` inside generate when `opts.factCheckItems` / `opts.collectionRuns` / `opts.asOfDate` provided.
3. After final `html` string is built (both mock and model paths), set:
   ```js
   const fact = buildFactCheckTable({
     items: opts.intelItems || [],
     runs: opts.collectionRuns || [],
     asOfDate: opts.asOfDate || hongKongCalendarDate(new Date().toISOString()),
   });
   html = injectFactCheckIntoReportHtml(html, fact.tableHtml);
   ```
   and include `factCheckRows: fact.rows` on the returned `report` object.

4. Add to the user/system prompt string (model path only) one sentence:
   `学费与申请截止日期的正式数字仅以报告中「学费与截止日期核对」表为准；章节正文不要写可当真的具体学费金额或截止日期数字。`

In `store.js` `appendReportResult`:

```js
factCheckRows: Array.isArray(row.factCheckRows) ? row.factCheckRows : [],
```

In `report-routes.js` POST generate handler, pass:

```js
collectionRuns: store.listIntelligenceCollectionRuns({ limit: 500 }),
asOfDate: hongKongCalendarDate(new Date().toISOString()),
// intelItems already passed as intelPack.items
```

and when saving:

```js
factCheckRows: Array.isArray(gen.report.factCheckRows) ? gen.report.factCheckRows : [],
```

Import `hongKongCalendarDate` and ensure `generateHtmlReport` receives `collectionRuns` + `asOfDate`.

- [ ] **Step 4: Run tests**

```powershell
node --test tests/us1-fact-check-dates.test.js
```

Expected: PASS

Smoke existing report test if present:

```powershell
node --test tests/v1-p3-report-history.test.js
```

Expected: PASS（旧调用不传 factCheckRows 时默认为 `[]`）

- [ ] **Step 5: Commit**（仅当操作者明确要求）

```powershell
git add backend/src/report-service.js backend/src/store.js backend/src/modules/report-routes.js backend/tests/us1-fact-check-dates.test.js
git commit -m "feat(us1): persist fact-check rows on report generate"
```

---

### Task 3: 打开报告时按打开日过滤展示

**Files:**
- Modify: `backend/src/modules/report-routes.js`（`GET /api/v1/reports/:reportId`）
- Optionally export a helper `buildReportHtmlForAsOf(report, asOfDate)` in `fact-check-table.js` or `report-service.js`
- Modify: `backend/tests/us1-fact-check-dates.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { presentReportHtmlForAsOf } from "../src/intelligence/fact-check-table.js";

test("presentReportHtmlForAsOf rebuilds fact-check section from stored rows", () => {
  const storedHtml = `<article class="study-report"><p>body</p><section class="report-chapter" id="report-fact-check">OLD</section></article>`;
  const rows = [
    {
      itemId: "t1",
      infoType: "tuition",
      summary: "fee",
      fetchedAt: "2026-09-01T04:00:00.000Z",
      fetchedDate: "2026-09-01",
    },
    {
      itemId: "t2",
      infoType: "tuition",
      summary: "fee2",
      fetchedAt: "2026-10-20T04:00:00.000Z",
      fetchedDate: "2026-10-20",
    },
  ];
  const { html, rows: visible } = presentReportHtmlForAsOf({
    html: storedHtml,
    factCheckRows: rows,
    asOfDate: "2026-10-23",
  });
  assert.equal(visible.length, 1);
  assert.ok(html.includes("2026-10-20"));
  assert.ok(!html.includes("OLD"));
});
```

- [ ] **Step 2: Run to fail**

```powershell
node --test tests/us1-fact-check-dates.test.js
```

- [ ] **Step 3: Implement**

In `fact-check-table.js`:

```js
export function stripFactCheckSection(html) {
  return String(html || "").replace(
    /<section\b[^>]*\bid=["']report-fact-check["'][^>]*>[\s\S]*?<\/section>/i,
    ""
  );
}

export function presentReportHtmlForAsOf({ html, factCheckRows, asOfDate }) {
  const visible = filterFactCheckRowsForAsOf(factCheckRows || [], asOfDate);
  const without = stripFactCheckSection(html);
  const tableHtml = renderFactCheckTableHtml(visible);
  // reuse same injection idea: if report-service exports inject, import it; else duplicate thin inject here
  const marker = "</article>";
  const s = without;
  const idx = s.lastIndexOf(marker);
  const next =
    !tableHtml
      ? s
      : idx === -1
        ? `${s}\n${tableHtml}`
        : `${s.slice(0, idx)}\n${tableHtml}\n${s.slice(idx)}`;
  return { html: next, rows: visible };
}
```

Prefer importing `injectFactCheckIntoReportHtml` from `report-service.js` into this helper **only if** it does not create a circular import. If circular, keep inject logic in `fact-check-table.js` and have `report-service` import inject from there instead (refactor Task 2 if needed: move `injectFactCheckIntoReportHtml` into `fact-check-table.js`).

**Preferred structure (avoid cycles):** put `injectFactCheckIntoReportHtml` in `fact-check-table.js` from the start; Task 2 should import it from there. If Task 2 already put it in report-service, move it in this task.

In `GET /api/v1/reports/:reportId`:

```js
import { hongKongCalendarDate } from "../intelligence/collection-trigger.js";
import { presentReportHtmlForAsOf } from "../intelligence/fact-check-table.js";

// ...
const asOfDate = hongKongCalendarDate(new Date().toISOString());
const presented = presentReportHtmlForAsOf({
  html: r.html,
  factCheckRows: r.factCheckRows || [],
  asOfDate,
});
return {
  // ...existing fields...
  html: presented.html,
  fact_check_rows: presented.rows,
};
```

Do **not** change public share HTML in this story (US-2/US-3). Login detail path is enough for US-1 AC on “学生打开这份正式版”.

- [ ] **Step 4: Run tests**

```powershell
node --test tests/us1-fact-check-dates.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**（仅当操作者明确要求）

```powershell
git add backend/src/intelligence/fact-check-table.js backend/src/modules/report-routes.js backend/src/report-service.js backend/tests/us1-fact-check-dates.test.js
git commit -m "feat(us1): filter fact-check rows when opening report"
```

---

### Task 4: npm 脚本与 AC 自检

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Add script**

```json
"test:us1-fact-check": "node --test tests/us1-fact-check-dates.test.js"
```

- [ ] **Step 2: Run**

```powershell
npm run test:us1-fact-check
```

Expected: PASS

- [ ] **Step 3: AC checklist（写进报告或任务备注，不改故事正文）**

| AC | 怎样验证 |
|----|----------|
| AC-1 | 门禁通过用例：表内每行有「抓取日期：YYYY-MM-DD」且在 `#report-fact-check` |
| AC-2 | 无单独页脚冒充；正式行只在核对表节点 |
| AC-3 | 无 `fetchedAt` 条目不出现在 rows |
| AC-4 | `isFetchedWithinDays` / open filter 用例 |
| AC-5 | 门禁失败 → `tableHtml === ""` |

- [ ] **Step 4: Commit**（仅当操作者明确要求）

```powershell
git add backend/package.json
git commit -m "test(us1): add test:us1-fact-check script"
```

---

### Task 5: 停在软件实现收口

- [ ] **Step 1:** 确认未改 visuals / share revoke / chat scope
- [ ] **Step 2:** 不自行开 US-3；交产品经理对照 US-1 Given/When/Then 验收

---

## Spec coverage (self-review)

| Spec | Task |
|------|------|
| 核对表纯函数 + 门禁 | Task 1 |
| 无 fetchedAt / 非 tuition·deadline / 31 天 | Task 1 |
| 门禁未过不加表 | Task 1–2 |
| 生成嵌入 HTML + 持久化 | Task 2 |
| prompt 约束 | Task 2 |
| 打开日再滤 | Task 3 |
| 页脚不算 AC-1 | Task 1 断言 + Task 4 |
| 不改图表 | Task 5 / Do not modify |

无 TBD。函数名：`isFetchedWithinDays`、`buildFactCheckTable`、`filterFactCheckRowsForAsOf`、`renderFactCheckTableHtml`、`presentReportHtmlForAsOf`、`injectFactCheckIntoReportHtml`（放在 `fact-check-table.js`）。
