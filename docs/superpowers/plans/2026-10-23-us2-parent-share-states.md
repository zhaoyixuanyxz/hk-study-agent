# US-2 家长分享三态 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用家长向集成测钉死公开分享三态（正式版含核对表日期 / 过期页 / 关闭页），并保证关闭后不会因过期规则重新打开；不改用户可见文案。

**Architecture:** 复用 US-3 公开路由与 `renderExpiredShareHtml` / `renderClosedOrInvalidShareHtml` / `presentReportHtmlForAsOf`。本故事以测试与验收为主；仅当现有 HTML 无法用稳定选择器区分过期与关闭时，才给渲染器加不可见结构（class），句子不动。

**Tech Stack:** Node.js（ESM）、`node:test`、Fastify `inject`、现有 `buildApp` / store 夹具。

**Spec:** [docs/superpowers/specs/2026-10-23-us2-parent-share-states-design.md](../specs/2026-10-23-us2-parent-share-states-design.md)

---

## File map

- Create: `backend/tests/us2-parent-share-states.test.js` — AC-1～AC-4 家长向公开分享测
- Modify: `backend/package.json` — 增加 `test:us2-parent-share`
- Modify (仅当测试证明需要): `backend/src/intelligence/report-freshness.js` — 给过期/关闭页主文案加稳定 class（**不改可见汉字**）
- Do not modify: 学生列表、`enableReportShare` 语义、过期规则、图表、对话 Agent
- Do not add: MCP、家长账号

Working directory for commands: `C:\Users\Eason Zhao\Desktop\hk-study-agent\backend` unless noted.

Commit steps：仅当操作者明确要求提交时执行；否则跳过。

**TDD note:** 行为多半已由 US-3 实现。先写测试；若直接全绿，视为文档化验收测（GREEN without RED）。仅当断言失败再改生产代码。

---

### Task 1: 家长向四条 AC 集成测

**Files:**
- Create: `backend/tests/us2-parent-share-states.test.js`

- [ ] **Step 1: Write the tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { factContentFingerprint } from "../src/intelligence/fact-check-table.js";

const TOKEN = "share_tok_us2";

function seedSharedReport(dbPath, { userId, snapshotId, createdAt, factCheckRows, html, share }) {
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
  const now = createdAt || new Date().toISOString();
  raw.reportResults = [
    {
      id: "rep_us2",
      userId,
      planId: null,
      snapshotId,
      snapshotVersion: 1,
      reportSchemaVersion: "1.0",
      title: "US2家长报告",
      html:
        html ||
        '<article class="study-report"><p>正式正文PARENT</p><section id="report-fact-check"></section></article>',
      chapterCount: 7,
      wordCount: 10,
      factCheckRows: factCheckRows || [],
      createdAt: now,
      share: share || {
        token: TOKEN,
        enabled: true,
        createdAt: now,
        revokedAt: null,
        viewCount: 0,
        lastViewedAt: null,
      },
    },
  ];
  writeFileSync(dbPath, JSON.stringify(raw, null, 2), "utf8");
}

async function registerUser(app) {
  return JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
}

function freshFactRow() {
  const summary = "港大授课型硕士学费摘要";
  const fetchedAt = new Date().toISOString();
  return {
    itemId: "t_us2",
    infoType: "tuition",
    summary,
    fetchedAt,
    fetchedDate: fetchedAt.slice(0, 10),
    contentFingerprint: factContentFingerprint(summary),
  };
}

test("US-2 AC-1: expired share is not formal for parent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-us2-ac1-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app0 = buildApp({ dataFile: db });
  const { user_id: userId } = await registerUser(app0);
  const row = freshFactRow();
  seedSharedReport(db, {
    userId,
    snapshotId: "snap_us2",
    createdAt: new Date().toISOString(),
    factCheckRows: [row],
    html: '<article class="study-report"><p>正式正文PARENT</p></article>',
  });
  const raw = JSON.parse(readFileSync(db, "utf8"));
  raw.intelligenceItems.find((i) => i.id === "t_us2").fetchedAt = new Date(
    Date.now() + 60_000
  ).toISOString();
  writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");
  const app = buildApp({ dataFile: db });
  const res = await app.inject({ method: "GET", url: `/api/v1/public/reports/${TOKEN}` });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /报告已过期/);
  assert.doesNotMatch(res.body, /正式正文PARENT/);
  assert.doesNotMatch(res.body, /已关闭或无效/);
  assert.doesNotMatch(res.body, /id=["']report-fact-check["']/);
});

test("US-2 AC-2: formal share shows same fact-check dates without login", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-us2-ac2-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app0 = buildApp({ dataFile: db });
  const { user_id: userId } = await registerUser(app0);
  const row = freshFactRow();
  seedSharedReport(db, {
    userId,
    snapshotId: "snap_us2",
    createdAt: new Date().toISOString(),
    factCheckRows: [row],
    html: '<article class="study-report"><p>正式正文PARENT</p></article>',
  });
  const app = buildApp({ dataFile: db });
  const res = await app.inject({ method: "GET", url: `/api/v1/public/reports/${TOKEN}` });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /正式正文PARENT/);
  assert.match(res.body, /id=["']report-fact-check["']/);
  assert.match(res.body, /抓取日期：/);
  assert.doesNotMatch(res.body, /报告已过期/);
  assert.doesNotMatch(res.body, /已关闭或无效/);
});

test("US-2 AC-3: revoked share stays closed for parent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-us2-ac3-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app0 = buildApp({ dataFile: db });
  const { user_id: userId } = await registerUser(app0);
  seedSharedReport(db, {
    userId,
    snapshotId: "snap_us2",
    createdAt: new Date().toISOString(),
    factCheckRows: [],
    share: {
      token: null,
      enabled: false,
      createdAt: new Date().toISOString(),
      revokedAt: new Date().toISOString(),
      viewCount: 0,
      lastViewedAt: null,
    },
  });
  const app = buildApp({ dataFile: db });
  const res = await app.inject({ method: "GET", url: `/api/v1/public/reports/${TOKEN}` });
  assert.equal(res.statusCode, 404);
  assert.match(res.body, /已关闭或无效/);
  assert.doesNotMatch(res.body, /正式正文PARENT/);
  assert.doesNotMatch(res.body, /报告已过期/);
});

test("US-2 AC-4: revoked stays closed after intel would have expired", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-us2-ac4-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app0 = buildApp({ dataFile: db });
  const { user_id: userId } = await registerUser(app0);
  const row = freshFactRow();
  seedSharedReport(db, {
    userId,
    snapshotId: "snap_us2",
    createdAt: new Date().toISOString(),
    factCheckRows: [row],
  });
  const raw = JSON.parse(readFileSync(db, "utf8"));
  raw.reportResults[0].share = {
    token: null,
    enabled: false,
    createdAt: new Date().toISOString(),
    revokedAt: new Date().toISOString(),
    viewCount: 0,
    lastViewedAt: null,
  };
  raw.intelligenceItems.find((i) => i.id === "t_us2").fetchedAt = new Date(
    Date.now() + 60_000
  ).toISOString();
  writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");
  const app = buildApp({ dataFile: db });
  const res = await app.inject({ method: "GET", url: `/api/v1/public/reports/${TOKEN}` });
  assert.equal(res.statusCode, 404);
  assert.match(res.body, /已关闭或无效/);
  assert.doesNotMatch(res.body, /报告已过期/);
  assert.doesNotMatch(res.body, /正式正文PARENT/);
});
```

- [ ] **Step 2: Run tests**

Run: `node --test tests/us2-parent-share-states.test.js`

Expected: **PASS**（US-3 已实现分流）。若 AC-2 因核对表未注入失败：确认 `seed` 的 `factCheckRows` 在 31 天内且 `presentReportHtmlForAsOf` 会重建 `#report-fact-check`——必要时把 `html` 设为无表壳的 article，让呈现层注入表。

- [ ] **Step 3: Only if a test fails on distinguishability**

若过期与关闭文案无法用现有子串区分（不应发生），在 `report-freshness.js` 给 `<p>` 加 class，例如 `class="share-expired"` / `class="share-closed"`，**汉字句子一字不动**。然后重跑测试并把断言改为也匹配 class。

- [ ] **Step 4: Commit**（仅操作者要求时）

```bash
git add backend/tests/us2-parent-share-states.test.js
git commit -m "test(us2): parent-facing share three-state acceptance"
```

---

### Task 2: npm script

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Add script** next to `test:us3-report-expiry`:

```json
"test:us2-parent-share": "node --test tests/us2-parent-share-states.test.js"
```

- [ ] **Step 2: Run**

```bash
npm run test:us2-parent-share
npm run test:us3-report-expiry
```

Expected: both PASS

- [ ] **Step 3: Commit**（仅操作者要求时）

```bash
git add backend/package.json
git commit -m "chore(us2): add test:us2-parent-share script"
```

---

### Task 3: 自检（对照 spec，不写新功能）

- [ ] **Step 1: Spec coverage**

| Spec / AC | Task |
|-----------|------|
| AC-1 过期非正式版 | 1 |
| AC-2 正式版核对表日期、无需登录 | 1 |
| AC-3 关闭无效 | 1 |
| AC-4 关闭后不因过期重开 | 1 |
| 文案不动 / 无角标 / 无列表改动 | 1–2（无生产文案 diff） |
| npm script | 2 |

- [ ] **Step 2:** 确认未改 visuals、对话 Agent、采集 cron、学生列表

- [ ] **Step 3:** 交产品经理对照 US-2 Given/When/Then；全部行交回后由项目经理合并

---

## Self-review (plan author)

1. **Spec coverage:** 四条 AC 均有测试任务；Approach A 不强制改生产代码。
2. **Placeholders:** 无 TBD。
3. **Consistency:** token `share_tok_us2`、报告 id `rep_us2`；关闭断言与 US-3 一致用「已关闭或无效」/「报告已过期」。
