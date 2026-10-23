# US-3 报告过期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打开分享链接时现算新鲜度；画像变、引用情报变、或相对生成日超 31 个香港自然日则返回专用过期页（无正文）；人手关闭仍走关闭/无效页；不翻转 `share.enabled`。

**Architecture:** 纯函数 `evaluateReportFreshness`（复用香港日历日与 31 天语义）；公开路由在 token 有效时调用并分支过期页/正文；登录详情返回 `freshness` 但仍可看正文。Approach A：不因 stale 改 `share.enabled`。

**Tech Stack:** Node.js（ESM）、`node:test`、`node:crypto`、现有 `store` / `core-routes` / `report-routes` / US-1 `fact-check-table`。

**Spec:** [docs/superpowers/specs/2026-10-23-us3-report-expiry-design.md](../specs/2026-10-23-us3-report-expiry-design.md)

---

## File map

- Create: `backend/src/intelligence/report-freshness.js` — `factContentFingerprint`、`evaluateReportFreshness`、`renderExpiredShareHtml`、`renderClosedOrInvalidShareHtml`（关闭页文案抽成常量，与过期页对照）
- Create: `backend/tests/us3-report-expiry.test.js` — 纯函数 + 公开路由集成
- Modify: `backend/src/intelligence/fact-check-table.js` — 装配行时写入 `contentFingerprint`
- Modify: `backend/src/modules/core-routes.js` — 公开分享现算新鲜度；过期页 / 关闭页
- Modify: `backend/src/modules/report-routes.js` — `GET /api/v1/reports/:reportId` 增加 `freshness`
- Modify: `backend/package.json` — `test:us3-report-expiry`
- Do not modify: 图表 visuals、对话 Agent、采集调度、`enableReportShare` 拦 stale、US-2 家长三态视觉
- Do not add: MCP

Working directory for commands: `C:\Users\Eason Zhao\Desktop\hk-study-agent\backend` unless noted.

Commit steps：仅当操作者明确要求提交时执行；否则跳过。

---

### Task 1: `evaluateReportFreshness` 纯函数（TDD）

**Files:**
- Create: `backend/src/intelligence/report-freshness.js`
- Create: `backend/tests/us3-report-expiry.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  factContentFingerprint,
  evaluateReportFreshness,
} from "../src/intelligence/report-freshness.js";

const baseReport = {
  createdAt: "2026-10-20T04:00:00.000Z",
  snapshotId: "snap_a",
  factCheckRows: [
    {
      itemId: "t1",
      infoType: "tuition",
      summary: "学费摘要",
      fetchedAt: "2026-10-18T04:00:00.000Z",
      fetchedDate: "2026-10-18",
      contentFingerprint: factContentFingerprint("学费摘要"),
    },
  ],
  share: { enabled: true, token: "tok" },
};

test("evaluateReportFreshness: ok when profile, intel, age unchanged", () => {
  const out = evaluateReportFreshness({
    report: baseReport,
    latestSnapshotId: "snap_a",
    asOfDate: "2026-10-23",
    getItem: (id) =>
      id === "t1"
        ? {
            fetchedAt: "2026-10-18T04:00:00.000Z",
            contentFingerprint: factContentFingerprint("学费摘要"),
          }
        : null,
  });
  assert.deepEqual(out, { fresh: true, reason: "ok" });
});

test("evaluateReportFreshness: profile_changed when latest snapshot differs", () => {
  const out = evaluateReportFreshness({
    report: baseReport,
    latestSnapshotId: "snap_b",
    asOfDate: "2026-10-23",
    getItem: () => ({
      fetchedAt: "2026-10-18T04:00:00.000Z",
      contentFingerprint: factContentFingerprint("学费摘要"),
    }),
  });
  assert.equal(out.fresh, false);
  assert.equal(out.reason, "profile_changed");
});

test("evaluateReportFreshness: missing snapshotId => profile_changed", () => {
  const out = evaluateReportFreshness({
    report: { ...baseReport, snapshotId: null },
    latestSnapshotId: "snap_a",
    asOfDate: "2026-10-23",
    getItem: () => null,
  });
  assert.equal(out.reason, "profile_changed");
});

test("evaluateReportFreshness: intel_changed when fetchedAt differs", () => {
  const out = evaluateReportFreshness({
    report: baseReport,
    latestSnapshotId: "snap_a",
    asOfDate: "2026-10-23",
    getItem: () => ({
      fetchedAt: "2026-10-22T04:00:00.000Z",
      contentFingerprint: factContentFingerprint("学费摘要"),
    }),
  });
  assert.equal(out.reason, "intel_changed");
});

test("evaluateReportFreshness: intel_changed when item missing", () => {
  const out = evaluateReportFreshness({
    report: baseReport,
    latestSnapshotId: "snap_a",
    asOfDate: "2026-10-23",
    getItem: () => null,
  });
  assert.equal(out.reason, "intel_changed");
});

test("evaluateReportFreshness: intel_changed when fingerprint differs", () => {
  const out = evaluateReportFreshness({
    report: baseReport,
    latestSnapshotId: "snap_a",
    asOfDate: "2026-10-23",
    getItem: () => ({
      fetchedAt: "2026-10-18T04:00:00.000Z",
      contentFingerprint: factContentFingerprint("学费已改"),
    }),
  });
  assert.equal(out.reason, "intel_changed");
});

test("evaluateReportFreshness: empty factCheckRows skips intel; still ok if profile+age ok", () => {
  const out = evaluateReportFreshness({
    report: { ...baseReport, factCheckRows: [] },
    latestSnapshotId: "snap_a",
    asOfDate: "2026-10-23",
    getItem: () => null,
  });
  assert.deepEqual(out, { fresh: true, reason: "ok" });
});

test("evaluateReportFreshness: age_exceeded when createdAt more than 31 HKT days before asOf", () => {
  const out = evaluateReportFreshness({
    report: { ...baseReport, createdAt: "2026-09-21T04:00:00.000Z", factCheckRows: [] },
    latestSnapshotId: "snap_a",
    asOfDate: "2026-10-23",
    getItem: () => null,
  });
  assert.equal(out.reason, "age_exceeded");
});

test("evaluateReportFreshness: share_disabled when checkShare and enabled false", () => {
  const out = evaluateReportFreshness({
    report: { ...baseReport, share: { enabled: false, token: null } },
    latestSnapshotId: "snap_a",
    asOfDate: "2026-10-23",
    getItem: () => null,
    checkShare: true,
  });
  assert.equal(out.reason, "share_disabled");
});

test("evaluateReportFreshness: rows without contentFingerprint only compare fetchedAt", () => {
  const report = {
    ...baseReport,
    factCheckRows: [
      {
        itemId: "t1",
        fetchedAt: "2026-10-18T04:00:00.000Z",
        summary: "学费摘要",
      },
    ],
  };
  const out = evaluateReportFreshness({
    report,
    latestSnapshotId: "snap_a",
    asOfDate: "2026-10-23",
    getItem: () => ({ fetchedAt: "2026-10-18T04:00:00.000Z" }),
  });
  assert.deepEqual(out, { fresh: true, reason: "ok" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/us3-report-expiry.test.js`

Expected: FAIL（模块不存在或导不出）

- [ ] **Step 3: Minimal implementation**

Create `backend/src/intelligence/report-freshness.js`:

```js
import { createHash } from "node:crypto";
import { hongKongCalendarDate } from "./collection-trigger.js";
import { calendarDaysBetween } from "./fact-check-table.js";

export function factContentFingerprint(summary) {
  return createHash("sha256").update(String(summary ?? ""), "utf8").digest("hex");
}

/**
 * @param {{
 *   report: object,
 *   latestSnapshotId: string | null | undefined,
 *   asOfDate: string,
 *   getItem: (itemId: string) => ({ fetchedAt?: string, contentFingerprint?: string } | null),
 *   checkShare?: boolean,
 * }} input
 * @returns {{ fresh: boolean, reason: "ok"|"share_disabled"|"profile_changed"|"intel_changed"|"age_exceeded"|"eval_error" }}
 */
export function evaluateReportFreshness(input) {
  try {
    const report = input.report && typeof input.report === "object" ? input.report : {};
    if (input.checkShare) {
      const sh = report.share && typeof report.share === "object" ? report.share : {};
      if (!sh.enabled || !sh.token) {
        return { fresh: false, reason: "share_disabled" };
      }
    }

    const snapId = report.snapshotId != null ? String(report.snapshotId).trim() : "";
    const latest = input.latestSnapshotId != null ? String(input.latestSnapshotId).trim() : "";
    if (!snapId || snapId !== latest) {
      return { fresh: false, reason: "profile_changed" };
    }

    const rows = Array.isArray(report.factCheckRows) ? report.factCheckRows : [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const itemId = String(row.itemId || "").trim();
      if (!itemId) {
        return { fresh: false, reason: "intel_changed" };
      }
      const current = input.getItem(itemId);
      if (!current || typeof current !== "object") {
        return { fresh: false, reason: "intel_changed" };
      }
      const storedFetched = String(row.fetchedAt || "");
      const curFetched = String(current.fetchedAt || "");
      if (!storedFetched || storedFetched !== curFetched) {
        return { fresh: false, reason: "intel_changed" };
      }
      const storedFp = row.contentFingerprint != null ? String(row.contentFingerprint) : "";
      if (storedFp) {
        const curFp =
          current.contentFingerprint != null
            ? String(current.contentFingerprint)
            : factContentFingerprint(current.summary ?? row.summary ?? "");
        if (storedFp !== curFp) {
          return { fresh: false, reason: "intel_changed" };
        }
      }
    }

    let createdYmd;
    try {
      createdYmd = hongKongCalendarDate(String(report.createdAt || ""));
    } catch {
      return { fresh: false, reason: "age_exceeded" };
    }
    const age = calendarDaysBetween(createdYmd, String(input.asOfDate || ""));
    if (!(age >= 0 && age <= 31)) {
      return { fresh: false, reason: "age_exceeded" };
    }

    return { fresh: true, reason: "ok" };
  } catch {
    return { fresh: false, reason: "eval_error" };
  }
}

export function renderClosedOrInvalidShareHtml() {
  return "<!DOCTYPE html><html lang=\"zh-Hans\"><head><meta charset=\"utf-8\"/><title>报告不可用</title></head><body><p>分享链接已关闭或无效。</p></body></html>";
}

export function renderExpiredShareHtml() {
  return "<!DOCTYPE html><html lang=\"zh-Hans\"><head><meta charset=\"utf-8\"/><title>报告已过期</title></head><body><p>这份报告已过期，不能再当作正式版转发。请学生重新生成后再分享。</p></body></html>";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/us3-report-expiry.test.js`

Expected: PASS（本 Task 内全部纯函数用例）

- [ ] **Step 5: Commit**（仅操作者要求时）

```bash
git add backend/src/intelligence/report-freshness.js backend/tests/us3-report-expiry.test.js
git commit -m "feat(us3): add evaluateReportFreshness pure function"
```

---

### Task 2: 生成时写入 `contentFingerprint`

**Files:**
- Modify: `backend/src/intelligence/fact-check-table.js`
- Modify: `backend/tests/us1-fact-check-dates.test.js`（若断言行形状，补上 fingerprint；保持原用例通过）

- [ ] **Step 1: Update `buildFactCheckTable` row push**

In `fact-check-table.js`, import and set fingerprint:

```js
import { factContentFingerprint } from "./report-freshness.js";
// ...
const summary = itemSummary(item);
rows.push({
  itemId: String(item.id || item.itemId || "").trim() || `fact_${rows.length + 1}`,
  infoType,
  summary,
  fetchedAt,
  fetchedDate,
  contentFingerprint: factContentFingerprint(summary),
});
```

Avoid circular import：若 `report-freshness.js` 已 import `calendarDaysBetween` from `fact-check-table.js`，则把 `factContentFingerprint` 放到 `fact-check-table.js`（或新建 `fact-fingerprint.js` 双方引用）。**锁定做法：** 把 `factContentFingerprint` 定义在 `fact-check-table.js` 并 export；`report-freshness.js` 从该文件 import `calendarDaysBetween` 与 `factContentFingerprint`，删除 `report-freshness` 内的 fingerprint 实现。同步改 Task 1 测试的 import 来源为：

```js
import { factContentFingerprint } from "../src/intelligence/fact-check-table.js";
import { evaluateReportFreshness } from "../src/intelligence/report-freshness.js";
```

- [ ] **Step 2: Run US-1 + US-3 unit tests**

Run:

```bash
npm run test:us1-fact-check
node --test tests/us3-report-expiry.test.js
```

Expected: PASS

- [ ] **Step 3: Commit**（仅操作者要求时）

```bash
git add backend/src/intelligence/fact-check-table.js backend/src/intelligence/report-freshness.js backend/tests/us1-fact-check-dates.test.js backend/tests/us3-report-expiry.test.js
git commit -m "feat(us3): persist contentFingerprint on factCheckRows"
```

---

### Task 3: 公开分享路由现算过期

**Files:**
- Modify: `backend/src/modules/core-routes.js`
- Modify: `backend/tests/us3-report-expiry.test.js`（追加集成用例）

- [ ] **Step 1: Write failing integration tests**（追加到 `us3-report-expiry.test.js`）

```js
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { factContentFingerprint } from "../src/intelligence/fact-check-table.js";

function seedSharedReport(dbPath, { userId, snapshotId, createdAt, factCheckRows, html }) {
  const raw = JSON.parse(readFileSync(dbPath, "utf8"));
  raw.profileSnapshots = raw.profileSnapshots || [];
  if (!raw.profileSnapshots.some((s) => s.id === snapshotId)) {
    raw.profileSnapshots.push({
      id: snapshotId,
      userId,
      version: 1,
      snapshot: { summary: "s" },
      createdAt: createdAt || new Date().toISOString(),
    });
  }
  raw.intelligenceItems = raw.intelligenceItems || [];
  for (const row of factCheckRows || []) {
    if (!raw.intelligenceItems.some((i) => i.id === row.itemId)) {
      raw.intelligenceItems.push({
        id: row.itemId,
        infoType: row.infoType || "tuition",
        fetchedAt: row.fetchedAt,
        locale: { summaryZh: row.summary || "" },
      });
    }
  }
  raw.reportResults = [
    {
      id: "rep_us3",
      userId,
      planId: null,
      snapshotId,
      snapshotVersion: 1,
      reportSchemaVersion: "1.0",
      title: "US3报告",
      html: html || '<article class="study-report"><p>正式正文SECRET</p></article>',
      chapterCount: 7,
      wordCount: 10,
      factCheckRows: factCheckRows || [],
      createdAt: createdAt || new Date().toISOString(),
      share: {
        token: "share_tok_us3",
        enabled: true,
        createdAt: new Date().toISOString(),
        revokedAt: null,
        viewCount: 0,
        lastViewedAt: null,
      },
    },
  ];
  writeFileSync(dbPath, JSON.stringify(raw, null, 2), "utf8");
}

test("public share: fresh report returns body", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-us3-ok-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });
  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const fp = factContentFingerprint("学费摘要");
  seedSharedReport(db, {
    userId: reg.user_id,
    snapshotId: "snap_a",
    createdAt: "2026-10-20T04:00:00.000Z",
    factCheckRows: [
      {
        itemId: "t1",
        infoType: "tuition",
        summary: "学费摘要",
        fetchedAt: "2026-10-18T04:00:00.000Z",
        fetchedDate: "2026-10-18",
        contentFingerprint: fp,
      },
    ],
  });
  // rebuild app so store reloads file if needed — inject against same app after rewrite:
  const app2 = buildApp({ dataFile: db });
  const res = await app2.inject({ method: "GET", url: "/api/v1/public/reports/share_tok_us3" });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /正式正文SECRET/);
  assert.doesNotMatch(res.body, /报告已过期/);
});

test("public share: intel change => expired page, no body", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-us3-intel-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });
  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const fp = factContentFingerprint("学费摘要");
  seedSharedReport(db, {
    userId: reg.user_id,
    snapshotId: "snap_a",
    createdAt: "2026-10-20T04:00:00.000Z",
    factCheckRows: [
      {
        itemId: "t1",
        infoType: "tuition",
        summary: "学费摘要",
        fetchedAt: "2026-10-18T04:00:00.000Z",
        fetchedDate: "2026-10-18",
        contentFingerprint: fp,
      },
    ],
  });
  const raw = JSON.parse(readFileSync(db, "utf8"));
  const item = raw.intelligenceItems.find((i) => i.id === "t1");
  item.fetchedAt = "2026-10-22T04:00:00.000Z";
  writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");
  const app2 = buildApp({ dataFile: db });
  const res = await app2.inject({ method: "GET", url: "/api/v1/public/reports/share_tok_us3" });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /报告已过期/);
  assert.doesNotMatch(res.body, /正式正文SECRET/);
  assert.doesNotMatch(res.body, /已关闭或无效/);
});

test("public share: profile change => expired page", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-us3-prof-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });
  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  seedSharedReport(db, {
    userId: reg.user_id,
    snapshotId: "snap_a",
    createdAt: "2026-10-20T04:00:00.000Z",
    factCheckRows: [],
  });
  const raw = JSON.parse(readFileSync(db, "utf8"));
  raw.profileSnapshots.push({
    id: "snap_b",
    userId: reg.user_id,
    version: 2,
    snapshot: { summary: "new" },
    createdAt: "2026-10-23T05:00:00.000Z",
  });
  writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");
  const app2 = buildApp({ dataFile: db });
  const res = await app2.inject({ method: "GET", url: "/api/v1/public/reports/share_tok_us3" });
  assert.match(res.body, /报告已过期/);
  assert.doesNotMatch(res.body, /正式正文SECRET/);
});

test("public share: revoked stays closed page even if intel would expire", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-us3-rev-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });
  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  seedSharedReport(db, {
    userId: reg.user_id,
    snapshotId: "snap_a",
    createdAt: "2026-10-20T04:00:00.000Z",
    factCheckRows: [],
  });
  const raw = JSON.parse(readFileSync(db, "utf8"));
  raw.reportResults[0].share = {
    token: null,
    enabled: false,
    createdAt: "2026-10-20T04:00:00.000Z",
    revokedAt: "2026-10-21T04:00:00.000Z",
    viewCount: 0,
    lastViewedAt: null,
  };
  writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");
  const app2 = buildApp({ dataFile: db });
  const res = await app2.inject({ method: "GET", url: "/api/v1/public/reports/share_tok_us3" });
  assert.equal(res.statusCode, 404);
  assert.match(res.body, /已关闭或无效/);
  assert.doesNotMatch(res.body, /报告已过期/);
});

test("public share: is_latest alone does not keep formal HTML after intel change", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-us3-latest-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });
  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const fp = factContentFingerprint("学费摘要");
  seedSharedReport(db, {
    userId: reg.user_id,
    snapshotId: "snap_a",
    createdAt: "2026-10-20T04:00:00.000Z",
    factCheckRows: [
      {
        itemId: "t1",
        infoType: "tuition",
        summary: "学费摘要",
        fetchedAt: "2026-10-18T04:00:00.000Z",
        fetchedDate: "2026-10-18",
        contentFingerprint: fp,
      },
    ],
  });
  const raw = JSON.parse(readFileSync(db, "utf8"));
  raw.intelligenceItems.find((i) => i.id === "t1").fetchedAt = "2026-10-22T04:00:00.000Z";
  // second newer report marked "latest" in list order — old share token unchanged
  raw.reportResults.unshift({
    id: "rep_newer",
    userId: reg.user_id,
    snapshotId: "snap_a",
    html: "<article><p>newer</p></article>",
    factCheckRows: [],
    createdAt: "2026-10-23T06:00:00.000Z",
    share: { token: null, enabled: false, createdAt: null, revokedAt: null, viewCount: 0, lastViewedAt: null },
  });
  writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");
  const app2 = buildApp({ dataFile: db });
  const res = await app2.inject({ method: "GET", url: "/api/v1/public/reports/share_tok_us3" });
  assert.match(res.body, /报告已过期/);
  assert.doesNotMatch(res.body, /正式正文SECRET/);
});
```

- [ ] **Step 2: Run integration tests — expect FAIL**（公开路由仍总是返回正文）

Run: `node --test tests/us3-report-expiry.test.js`

- [ ] **Step 3: Wire `core-routes.js`**

Replace public handler body logic with:

```js
import { hongKongCalendarDate } from "../intelligence/collection-trigger.js";
import { presentReportHtmlForAsOf } from "../intelligence/fact-check-table.js";
import { factContentFingerprint } from "../intelligence/fact-check-table.js";
import {
  evaluateReportFreshness,
  renderClosedOrInvalidShareHtml,
  renderExpiredShareHtml,
} from "../intelligence/report-freshness.js";

app.get("/api/v1/public/reports/:shareToken", async (request, reply) => {
  const shareToken = String(request.params.shareToken || "").trim();
  const row = store.getReportByShareToken(shareToken);
  if (!row) {
    return reply
      .status(404)
      .type("text/html; charset=utf-8")
      .send(renderClosedOrInvalidShareHtml());
  }

  const asOfDate = hongKongCalendarDate(new Date().toISOString());
  const latest = store.getLatestProfileSnapshot(row.userId);
  let freshness;
  try {
    freshness = evaluateReportFreshness({
      report: row,
      latestSnapshotId: latest?.id || null,
      asOfDate,
      getItem: (itemId) => {
        const item = store.getIntelligenceItem(itemId);
        if (!item) return null;
        const summary =
          (item.locale && (item.locale.summaryZh || item.locale.titleZh)) || item.title || "";
        return {
          fetchedAt: item.fetchedAt,
          summary,
          contentFingerprint: factContentFingerprint(summary),
        };
      },
    });
  } catch (err) {
    request.log?.error?.(err);
    freshness = { fresh: false, reason: "eval_error" };
  }

  if (!freshness.fresh) {
    return reply.type("text/html; charset=utf-8").send(renderExpiredShareHtml());
  }

  store.incrementReportShareView(row.id);
  const presented = presentReportHtmlForAsOf({
    html: row.html,
    factCheckRows: row.factCheckRows || [],
    asOfDate,
  });
  const title = escapeHtmlAttr((row.title && String(row.title).trim()) || "留学规划报告");
  const banner = `<div class="share-privacy-banner" role="alert" style="background:#fff3cd;border:1px solid #856404;padding:12px 14px;margin-bottom:16px;font-family:system-ui,sans-serif;font-size:14px;line-height:1.55;color:#333"><strong>隐私提示：</strong>本页含个人留学申请相关信息，仅供受邀阅读；请勿转发给无关第三方。</div>`;
  const doc = `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  body { font-family: system-ui, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; margin: 16px 20px 40px; line-height: 1.55; color: #111; }
  .report-chapter { margin-bottom: 1.2rem; }
  .report-chapter h2 { font-size: 1.15rem; }
  a { color: #1565c0; }
</style>
</head>
<body>${banner}${presented.html}</body>
</html>`;
  return reply.type("text/html; charset=utf-8").send(doc);
});
```

Notes:

- 过期时**不** `incrementReportShareView`（避免把过期打开算有效浏览）；关闭页本来就无 row。
- **不要**在 stale 时改 `share.enabled`。

- [ ] **Step 4: Re-run tests**

Run: `node --test tests/us3-report-expiry.test.js`

Expected: PASS

若「fresh report」因系统「今天」与种子 `createdAt` 相差 >31 天失败：把集成用例的 `createdAt` 改成 `new Date().toISOString()`，并把情报 `fetchedAt` 设为近日内 ISO，保证相对打开日 ≤31。

- [ ] **Step 5: Commit**（仅操作者要求时）

```bash
git add backend/src/modules/core-routes.js backend/tests/us3-report-expiry.test.js
git commit -m "feat(us3): expire public share page on open-time freshness"
```

---

### Task 4: 登录详情返回 `freshness`

**Files:**
- Modify: `backend/src/modules/report-routes.js`
- Modify: `backend/tests/us3-report-expiry.test.js`

- [ ] **Step 1: Failing test — detail includes freshness**

```js
test("GET report detail includes freshness; body kept when stale", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-us3-detail-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });
  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const { user_id: userId, token } = reg;
  seedSharedReport(db, {
    userId,
    snapshotId: "snap_a",
    createdAt: new Date().toISOString(),
    factCheckRows: [],
  });
  const raw = JSON.parse(readFileSync(db, "utf8"));
  raw.profileSnapshots.push({
    id: "snap_b",
    userId,
    version: 2,
    snapshot: { summary: "new" },
    createdAt: new Date().toISOString(),
  });
  writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");
  const app2 = buildApp({ dataFile: db });
  const res = JSON.parse(
    (
      await app2.inject({
        method: "GET",
        url: "/api/v1/reports/rep_us3",
        headers: { authorization: `Bearer ${token}` },
      })
    ).body
  );
  assert.equal(res.ok, true);
  assert.equal(res.freshness.fresh, false);
  assert.equal(res.freshness.reason, "profile_changed");
  assert.match(res.html, /正式正文SECRET/);
});
```

- [ ] **Step 2: Run — expect FAIL**（无 `freshness` 字段）

- [ ] **Step 3: Patch `GET /api/v1/reports/:reportId`**

After loading `r` and computing `asOfDate` / `presented`:

```js
import { evaluateReportFreshness } from "../intelligence/report-freshness.js";
import { factContentFingerprint } from "../intelligence/fact-check-table.js";

const latest = store.getLatestProfileSnapshot(user.id);
const freshness = evaluateReportFreshness({
  report: r,
  latestSnapshotId: latest?.id || null,
  asOfDate,
  getItem: (itemId) => {
    const item = store.getIntelligenceItem(itemId);
    if (!item) return null;
    const summary =
      (item.locale && (item.locale.summaryZh || item.locale.titleZh)) || item.title || "";
    return {
      fetchedAt: item.fetchedAt,
      summary,
      contentFingerprint: factContentFingerprint(summary),
    };
  },
});

return {
  ok: true,
  // ...existing fields...
  html: presented.html,
  fact_check_rows: presented.rows,
  visuals: r.visuals || null,
  freshness,
};
```

- [ ] **Step 4: Run all US-3 tests**

Run: `node --test tests/us3-report-expiry.test.js`

Expected: PASS

- [ ] **Step 5: Commit**（仅操作者要求时）

```bash
git add backend/src/modules/report-routes.js backend/tests/us3-report-expiry.test.js
git commit -m "feat(us3): expose freshness on authenticated report detail"
```

---

### Task 5: npm script + 回归烟测

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Add script**

```json
"test:us3-report-expiry": "node --test tests/us3-report-expiry.test.js"
```

- [ ] **Step 2: Run**

```bash
npm run test:us3-report-expiry
npm run test:us1-fact-check
```

Expected: both PASS

- [ ] **Step 3: Commit**（仅操作者要求时）

```bash
git add backend/package.json
git commit -m "chore(us3): add test:us3-report-expiry script"
```

---

### Task 6: 实现自检（对照 spec，不写新功能）

- [ ] **Step 1: Spec coverage checklist**

| Spec 要求 | Task |
|-----------|------|
| Approach A 打开时现算、不改 enabled | 1, 3 |
| 过期页无正文、文案 ≠ 关闭页 | 1 (`renderExpiredShareHtml`), 3 |
| 画像 / 情报 / 31 天 | 1 |
| 空 factCheckRows 不因空表过期 | 1 |
| 人手关闭优先 | 3 revoked 用例 |
| `is_latest` 不算过期 | 3 |
| 登录可留着看 + freshness | 4 |
| contentFingerprint 生成写入、旧行仅比 fetchedAt | 1, 2 |
| 评测抛错 → 过期页 | 3 try/catch |

- [ ] **Step 2: 确认未改** visuals、对话 Agent、采集 cron、`enableReportShare` 拦 stale

- [ ] **Step 3:** 交产品经理对照 US-3 Given/When/Then；不自行开 US-2

---

## Self-review (plan author)

1. **Spec coverage:** 上表已覆盖 FR/AC 核心；重新生成「新报告可发」依赖现有 `appendReportResult`，无需新 API——集成上由「旧 token 仍过期、新行可分享」在验收手工点一次即可；自动化已覆盖旧 token 过期。
2. **Placeholders:** 无 TBD；循环依赖在 Task 2 已锁死到 `fact-check-table` 持有 fingerprint。
3. **Types:** `reason` 枚举与 spec 一致；公开路由 `checkShare` 默认 false（token 门在 `getReportByShareToken`）。
