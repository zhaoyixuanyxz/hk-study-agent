# US-4 调度采集与 7 日门禁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 采集批次带上 `trigger`（`scheduler` / `manual`），提供按香港时区核对的 7 日调度完成门禁，并更新生产 Runbook 上的 cron，使正常路径是服务器定时进容器跑，而不是操作者手工调试。

**Architecture:** 纯函数解析环境变量与归日；`appendIntelligenceCollectionRun` 持久化 `trigger`；ingestion / real-crawl 写批次时传入；门禁函数只读批次数组，不计手工、失败、缺字段。cron 用 `docker compose exec` 进 `api` 容器。本计划不改报告文案、不过期分享。

**Tech Stack:** Node.js（ESM）、`node:test` / `node:assert/strict`、现有 JSON `store`、Docker Compose prod。

**Spec:** [docs/superpowers/specs/2026-10-22-us4-scheduled-collection-design.md](../specs/2026-10-22-us4-scheduled-collection-design.md)

---

## File map

- Create: `backend/src/intelligence/collection-trigger.js` — `resolveCollectionTrigger(env)`、`hongKongCalendarDate(iso)`
- Create: `backend/src/intelligence/collection-gate.js` — `checkSevenDaySchedulerGate({ asOfDate, runs })`
- Create: `backend/tests/us4-scheduled-collection.test.js`
- Modify: `backend/src/store.js` — `appendIntelligenceCollectionRun` 写入 `trigger`；新增 `listIntelligenceCollectionRuns`
- Modify: `backend/src/intelligence/ingestion-service.js` — 写批次时传入 `trigger`
- Modify: `backend/src/intelligence/real-crawler.js` — 同上
- Modify: `backend/package.json` — 增加 `test:us4-collection` 脚本
- Modify: `docs/v1.verson/V1-云试点部署Runbook.md` §8 — cron 改为 compose exec + `COLLECTION_TRIGGER=scheduler` + `Asia/Hong_Kong`
- Do not modify: 报告生成、分享公开页、对话 Agent、图表、授课边界
- Do not add: MCP、进程内 cron、GitHub Actions 采集

Working directory for all commands: `C:\Users\Eason Zhao\Desktop\hk-study-agent\backend` unless noted.

---

### Task 1: `trigger` 解析与香港日历日

**Files:**
- Create: `backend/src/intelligence/collection-trigger.js`
- Create: `backend/tests/us4-scheduled-collection.test.js`（先写本任务相关用例）

- [ ] **Step 1: Write the failing test**

Create `backend/tests/us4-scheduled-collection.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCollectionTrigger,
  hongKongCalendarDate,
} from "../src/intelligence/collection-trigger.js";

test("resolveCollectionTrigger: scheduler only when env is exactly scheduler", () => {
  assert.equal(resolveCollectionTrigger({ COLLECTION_TRIGGER: "scheduler" }), "scheduler");
  assert.equal(resolveCollectionTrigger({}), "manual");
  assert.equal(resolveCollectionTrigger({ COLLECTION_TRIGGER: "manual" }), "manual");
  assert.equal(resolveCollectionTrigger({ COLLECTION_TRIGGER: "SCHEDULER" }), "manual");
  assert.equal(resolveCollectionTrigger({ COLLECTION_TRIGGER: " cron " }), "manual");
});

test("hongKongCalendarDate maps UTC instant to Asia/Hong_Kong YYYY-MM-DD", () => {
  // 2026-10-21 18:00 UTC = 2026-10-22 02:00 HKT
  assert.equal(hongKongCalendarDate("2026-10-21T18:00:00.000Z"), "2026-10-22");
  // 2026-10-21 15:59 UTC = 2026-10-21 23:59 HKT
  assert.equal(hongKongCalendarDate("2026-10-21T15:59:00.000Z"), "2026-10-21");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd "C:\Users\Eason Zhao\Desktop\hk-study-agent\backend"
node --test tests/us4-scheduled-collection.test.js
```

Expected: FAIL（模块不存在或导出缺失）

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/intelligence/collection-trigger.js`:

```js
/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {"scheduler" | "manual"}
 */
export function resolveCollectionTrigger(env = process.env) {
  return String(env.COLLECTION_TRIGGER || "").trim() === "scheduler" ? "scheduler" : "manual";
}

/**
 * Map an ISO timestamp to a calendar date in Asia/Hong_Kong.
 * @param {string} iso
 * @returns {string} YYYY-MM-DD
 */
export function hongKongCalendarDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`invalid iso: ${iso}`);
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test tests/us4-scheduled-collection.test.js
```

Expected: PASS（本文件里已有用例全部绿）

- [ ] **Step 5: Commit**（仅当操作者明确要求提交时执行；否则跳过）

```powershell
cd "C:\Users\Eason Zhao\Desktop\hk-study-agent"
git add backend/src/intelligence/collection-trigger.js backend/tests/us4-scheduled-collection.test.js
git commit -m "$(cat <<'EOF'
feat(us4): resolve collection trigger and Hong Kong calendar day

EOF
)"
```

---

### Task 2: 7 日调度门禁纯函数

**Files:**
- Create: `backend/src/intelligence/collection-gate.js`
- Modify: `backend/tests/us4-scheduled-collection.test.js`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/us4-scheduled-collection.test.js`:

```js
import { checkSevenDaySchedulerGate } from "../src/intelligence/collection-gate.js";

function run(partial) {
  return {
    status: "completed",
    trigger: "scheduler",
    finishedAt: "2026-10-20T06:00:00.000Z",
    ...partial,
  };
}

test("checkSevenDaySchedulerGate passes when each of 7 HK days has scheduler completed", () => {
  const asOfDate = "2026-10-22";
  const days = [
    "2026-10-16",
    "2026-10-17",
    "2026-10-18",
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
  ];
  const runs = days.map((day) =>
    run({ finishedAt: `${day}T04:00:00.000Z` }) // 04:00Z = 12:00 HKT same calendar day
  );
  const result = checkSevenDaySchedulerGate({ asOfDate, runs });
  assert.equal(result.passed, true);
  assert.deepEqual(
    result.days.map((d) => d.date),
    days
  );
  assert.ok(result.days.every((d) => d.ok === true));
});

test("checkSevenDaySchedulerGate fails when one day missing", () => {
  const asOfDate = "2026-10-22";
  const runs = [
    run({ finishedAt: "2026-10-16T04:00:00.000Z" }),
    run({ finishedAt: "2026-10-17T04:00:00.000Z" }),
    run({ finishedAt: "2026-10-18T04:00:00.000Z" }),
    run({ finishedAt: "2026-10-19T04:00:00.000Z" }),
    run({ finishedAt: "2026-10-20T04:00:00.000Z" }),
    run({ finishedAt: "2026-10-21T04:00:00.000Z" }),
    // missing 2026-10-22
  ];
  const result = checkSevenDaySchedulerGate({ asOfDate, runs });
  assert.equal(result.passed, false);
  const d22 = result.days.find((d) => d.date === "2026-10-22");
  assert.equal(d22.ok, false);
});

test("checkSevenDaySchedulerGate ignores manual, failed, and missing trigger", () => {
  const asOfDate = "2026-10-22";
  const baseDays = [
    "2026-10-16",
    "2026-10-17",
    "2026-10-18",
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
  ];
  const runs = [
    ...baseDays.slice(0, 6).map((day) => run({ finishedAt: `${day}T04:00:00.000Z` })),
    run({ finishedAt: "2026-10-22T04:00:00.000Z", trigger: "manual" }),
    run({ finishedAt: "2026-10-22T05:00:00.000Z", status: "failed", trigger: "scheduler" }),
    { status: "completed", finishedAt: "2026-10-22T06:00:00.000Z" }, // no trigger
  ];
  const result = checkSevenDaySchedulerGate({ asOfDate, runs });
  assert.equal(result.passed, false);
  assert.equal(result.days.find((d) => d.date === "2026-10-22").ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
node --test tests/us4-scheduled-collection.test.js
```

Expected: FAIL on `collection-gate` import / missing export

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/intelligence/collection-gate.js`:

```js
import { hongKongCalendarDate } from "./collection-trigger.js";

/**
 * @param {string} asOfDate YYYY-MM-DD in Asia/Hong_Kong
 * @returns {string[]} seven dates ending at asOfDate inclusive, ascending
 */
export function sevenHongKongDaysEndingOn(asOfDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(asOfDate || "").trim());
  if (!m) throw new RangeError(`asOfDate must be YYYY-MM-DD, got ${asOfDate}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // Anchor noon UTC on that civil date so ±1 day stays on intended calendar when formatting back… 
  // Better: treat asOfDate as HKT civil date by constructing UTC noon of that Y-M-D then walk.
  const anchor = new Date(Date.UTC(y, mo - 1, d, 4, 0, 0)); // 04:00Z ≈ 12:00 HKT
  const out = [];
  for (let i = 6; i >= 0; i -= 1) {
    const t = new Date(anchor.getTime() - i * 24 * 60 * 60 * 1000);
    out.push(hongKongCalendarDate(t.toISOString()));
  }
  return out;
}

/**
 * @param {{ asOfDate: string, runs: Array<{ status?: string, trigger?: string, finishedAt?: string }> }} input
 * @returns {{ passed: boolean, days: Array<{ date: string, ok: boolean }> }}
 */
export function checkSevenDaySchedulerGate({ asOfDate, runs }) {
  const days = sevenHongKongDaysEndingOn(asOfDate);
  const okByDay = new Set();
  for (const r of runs || []) {
    if (!r || r.status !== "completed") continue;
    if (r.trigger !== "scheduler") continue;
    if (!r.finishedAt) continue;
    let day;
    try {
      day = hongKongCalendarDate(r.finishedAt);
    } catch {
      continue;
    }
    okByDay.add(day);
  }
  const dayRows = days.map((date) => ({ date, ok: okByDay.has(date) }));
  return { passed: dayRows.every((d) => d.ok), days: dayRows };
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
node --test tests/us4-scheduled-collection.test.js
```

Expected: PASS

If `sevenHongKongDaysEndingOn` drifts across DST (HK has no DST) or edge dates, fix by iterating civil dates in HKT via `hongKongCalendarDate` on successive UTC midnights until the seven labels match the expected list in the first test.

- [ ] **Step 5: Commit**（仅当操作者明确要求提交时）

```powershell
cd "C:\Users\Eason Zhao\Desktop\hk-study-agent"
git add backend/src/intelligence/collection-gate.js backend/tests/us4-scheduled-collection.test.js
git commit -m "$(cat <<'EOF'
feat(us4): seven-day scheduler collection gate

EOF
)"
```

---

### Task 3: Store 持久化 `trigger` 并列出批次

**Files:**
- Modify: `backend/src/store.js`（`appendIntelligenceCollectionRun` 与新增 `listIntelligenceCollectionRuns`）
- Modify: `backend/tests/us4-scheduled-collection.test.js`

- [ ] **Step 1: Write the failing test**

Append:

```js
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../src/store.js";
import { resolveCollectionTrigger } from "../src/intelligence/collection-trigger.js";

test("appendIntelligenceCollectionRun persists trigger scheduler or manual", () => {
  const dir = mkdtempSync(join(tmpdir(), "us4-store-"));
  const store = createStore(join(dir, "db.json"));
  const a = store.appendIntelligenceCollectionRun({
    status: "completed",
    itemsIngested: 1,
    trigger: "scheduler",
    startedAt: "2026-10-22T06:00:00.000Z",
    finishedAt: "2026-10-22T06:05:00.000Z",
  });
  assert.equal(a.trigger, "scheduler");
  const b = store.appendIntelligenceCollectionRun({
    status: "failed",
    itemsIngested: 0,
    trigger: "manual",
    errorMessage: "boom",
    startedAt: "2026-10-22T07:00:00.000Z",
    finishedAt: "2026-10-22T07:01:00.000Z",
  });
  assert.equal(b.trigger, "manual");
  assert.equal(b.status, "failed");
  const listed = store.listIntelligenceCollectionRuns({ limit: 10 });
  assert.ok(listed.some((r) => r.id === a.id && r.trigger === "scheduler"));
  assert.ok(listed.some((r) => r.id === b.id && r.trigger === "manual"));
  rmSync(dir, { recursive: true, force: true });
});

test("appendIntelligenceCollectionRun defaults missing trigger to manual", () => {
  const dir = mkdtempSync(join(tmpdir(), "us4-store2-"));
  const store = createStore(join(dir, "db.json"));
  const row = store.appendIntelligenceCollectionRun({
    status: "completed",
    itemsIngested: 0,
  });
  assert.equal(row.trigger, "manual");
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
node --test tests/us4-scheduled-collection.test.js
```

Expected: FAIL（`trigger` 未写入或 `listIntelligenceCollectionRuns` 不存在）

- [ ] **Step 3: Write minimal implementation**

In `backend/src/store.js`, change `appendIntelligenceCollectionRun` row construction to:

```js
const triggerRaw = run.trigger != null ? String(run.trigger).trim() : "";
const trigger = triggerRaw === "scheduler" ? "scheduler" : "manual";
const row = {
  id,
  status: String(run.status || "completed").slice(0, 40),
  trigger,
  itemsIngested: Number(run.itemsIngested) || 0,
  errorMessage: run.errorMessage != null ? String(run.errorMessage).slice(0, 500) : null,
  startedAt: String(run.startedAt || now),
  finishedAt: String(run.finishedAt || now),
  createdAt: now,
};
```

Add after that method (same `createStore` return object):

```js
/**
 * @param {{ limit?: number }} [opts]
 */
listIntelligenceCollectionRuns(opts = {}) {
  const db = load();
  ensureIntelligenceCollections(db);
  const limit = Math.min(5000, Math.max(1, Number(opts.limit) || 500));
  return db.intelligenceCollectionRuns
    .slice()
    .sort((a, b) => new Date(b.finishedAt || 0) - new Date(a.finishedAt || 0))
    .slice(0, limit);
},
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
node --test tests/us4-scheduled-collection.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**（仅当操作者明确要求提交时）

```powershell
cd "C:\Users\Eason Zhao\Desktop\hk-study-agent"
git add backend/src/store.js backend/tests/us4-scheduled-collection.test.js
git commit -m "$(cat <<'EOF'
feat(us4): persist collection run trigger field

EOF
)"
```

---

### Task 4: Ingestion 与 real-crawl 写入 `trigger`

**Files:**
- Modify: `backend/src/intelligence/ingestion-service.js`
- Modify: `backend/src/intelligence/real-crawler.js`
- Modify: `backend/tests/us4-scheduled-collection.test.js`

- [ ] **Step 1: Write the failing test**

Append a test that stubs env and exercises `runIngestion` with fetch disabled（现有 mock 路径，不打外网）:

```js
test("runIngestion records trigger from COLLECTION_TRIGGER", async () => {
  const dir = mkdtempSync(join(tmpdir(), "us4-ing-"));
  const store = createStore(join(dir, "db.json"));
  const prev = process.env.COLLECTION_TRIGGER;
  process.env.COLLECTION_TRIGGER = "scheduler";
  process.env.INTELLIGENCE_FETCH = "0";
  try {
    const { runIngestion } = await import("../src/intelligence/ingestion-service.js");
    const result = await runIngestion(store, {});
    assert.equal(result.run.trigger, "scheduler");
  } finally {
    if (prev === undefined) delete process.env.COLLECTION_TRIGGER;
    else process.env.COLLECTION_TRIGGER = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runIngestion records manual when COLLECTION_TRIGGER unset", async () => {
  const dir = mkdtempSync(join(tmpdir(), "us4-ing2-"));
  const store = createStore(join(dir, "db.json"));
  const prev = process.env.COLLECTION_TRIGGER;
  delete process.env.COLLECTION_TRIGGER;
  process.env.INTELLIGENCE_FETCH = "0";
  try {
    const { runIngestion } = await import("../src/intelligence/ingestion-service.js");
    const result = await runIngestion(store, {});
    assert.equal(result.run.trigger, "manual");
  } finally {
    if (prev !== undefined) process.env.COLLECTION_TRIGGER = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
node --test tests/us4-scheduled-collection.test.js
```

Expected: FAIL（`result.run.trigger` 为 `undefined`）

- [ ] **Step 3: Write minimal implementation**

In `backend/src/intelligence/ingestion-service.js`, add import:

```js
import { resolveCollectionTrigger } from "./collection-trigger.js";
```

Change the `ks.appendCollectionRun({...})` call to include:

```js
trigger: resolveCollectionTrigger(process.env),
```

In `backend/src/intelligence/real-crawler.js`, same import and same `trigger:` field on `ks.appendCollectionRun`.

- [ ] **Step 4: Run test to verify it passes**

```powershell
node --test tests/us4-scheduled-collection.test.js
```

Expected: PASS

Also smoke existing foundation test still green:

```powershell
node --test tests/v1-sprint1-intelligence-foundation.test.js
```

Expected: PASS（旧调用不传 `trigger` 时 store 默认 `manual`）

- [ ] **Step 5: Commit**（仅当操作者明确要求提交时）

```powershell
cd "C:\Users\Eason Zhao\Desktop\hk-study-agent"
git add backend/src/intelligence/ingestion-service.js backend/src/intelligence/real-crawler.js backend/tests/us4-scheduled-collection.test.js
git commit -m "$(cat <<'EOF'
feat(us4): write collection trigger from env on ingest

EOF
)"
```

---

### Task 5: npm 脚本与 Runbook cron

**Files:**
- Modify: `backend/package.json`
- Modify: `docs/v1.verson/V1-云试点部署Runbook.md`

- [ ] **Step 1: Add test script**

In `backend/package.json` `scripts`, add:

```json
"test:us4-collection": "node --test tests/us4-scheduled-collection.test.js"
```

- [ ] **Step 2: Run the script**

```powershell
npm run test:us4-collection
```

Expected: PASS

- [ ] **Step 3: Update Runbook §8**

Replace the cron block in `docs/v1.verson/V1-云试点部署Runbook.md` §8 with:

```markdown
## 8. 情报每日采集（cron）

装在 **API 所在服务器**（不要装在操作者 Windows 本机）。时区 `Asia/Hong_Kong`。正常路径是调度器触发；操作者在终端无 `COLLECTION_TRIGGER=scheduler` 的手工跑记为 `manual`，不计入 7 日门禁。

在放置 `docker-compose.prod.yml` 的仓库根目录执行（把 `/path/to/repo` 换成真实路径）：

```bash
CRON_TZ=Asia/Hong_Kong
0 6 * * * cd /path/to/repo && docker compose -f docker-compose.prod.yml exec -T -e INTELLIGENCE_FETCH=1 -e INTELLIGENCE_FETCH_MAX=56 -e COLLECTION_TRIGGER=scheduler api npm run intelligence:daily >> /var/log/intel-daily.log 2>&1
```

说明：

- 必须进正在跑的 `api` 容器，才能写到卷 `app-data` 里的同一份数据。
- `COLLECTION_TRIGGER=scheduler` 不可省略，否则批次记为 `manual`。
- 容器未启动时本轮不写批次，该日门禁缺一天；不要用无标记的手工跑冒充调度。

首次部署前仍执行 `npm run intelligence:sync-feeds`（或容器内等价命令）生成 `backend/data/intelligence/*.json`。
```

Keep the fenced code block nesting valid in the actual file（外层用缩进或调整标题层级，避免 Markdown 嵌套 fence 断裂）。推荐最终文件形态：§8 下一段说明 + 单独一个 bash fence，不要再套一层 markdown fence。

- [ ] **Step 4: Commit**（仅当操作者明确要求提交时）

```powershell
cd "C:\Users\Eason Zhao\Desktop\hk-study-agent"
git add backend/package.json docs/v1.verson/V1-云试点部署Runbook.md
git commit -m "$(cat <<'EOF'
docs(us4): schedule collection via compose exec with trigger

EOF
)"
```

---

### Task 6: 验收自检（对照 US-4 AC）

- [ ] **Step 1: 跑全套 US-4 测试**

```powershell
cd "C:\Users\Eason Zhao\Desktop\hk-study-agent\backend"
npm run test:us4-collection
```

Expected: PASS

- [ ] **Step 2: 手工对照 AC（不真挂 cron）**

| AC | 怎样看 |
|----|--------|
| AC-1 | Runbook 命令含 `COLLECTION_TRIGGER=scheduler`；测试证明该 env 写入 `trigger=scheduler` |
| AC-2 | 失败批次测试 / store 测试：`status=failed` 且带 `trigger` |
| AC-3 | `checkSevenDaySchedulerGate` 缺一天 → `passed=false` |
| AC-4 | 仅 `manual` 的那天 → 该日 `ok=false`，门禁不通过 |

- [ ] **Step 3: 停在软件实现收口前**

本计划完成后，按路由：用户故事行须经产品经理对照 Given/When/Then 验收，再回项目经理登记。不要自行开 US-1。

---

## Spec coverage (self-review)

| Spec 要求 | Task |
|-----------|------|
| 服务器 cron + compose exec + 同一卷 | Task 5 |
| `COLLECTION_TRIGGER=scheduler` / 默认 manual | Task 1, 3, 4 |
| `finishedAt` 按 `Asia/Hong_Kong` 归日 | Task 1, 2 |
| 7 日门禁不计手工/失败/缺字段 | Task 2 |
| 失败仍写 failed + trigger | Task 3, 4 |
| 不改报告文案 / 不接公开页 | 全计划 Do not modify |
| 测试不依赖真机 cron | Task 1–4 |
| Runbook 更新 | Task 5 |

无 TBD。函数名全程：`resolveCollectionTrigger`、`hongKongCalendarDate`、`checkSevenDaySchedulerGate`、`listIntelligenceCollectionRuns`。
