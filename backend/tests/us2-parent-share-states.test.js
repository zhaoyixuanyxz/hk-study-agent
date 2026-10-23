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
