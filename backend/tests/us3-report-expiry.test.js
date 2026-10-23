import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { factContentFingerprint, itemSummary } from "../src/intelligence/fact-check-table.js";
import { evaluateReportFreshness } from "../src/intelligence/report-freshness.js";

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

function readReportShareViewCount(dbPath, reportId = "rep_us3") {
  const raw = JSON.parse(readFileSync(dbPath, "utf8"));
  const report = raw.reportResults.find((r) => r.id === reportId);
  return report?.share?.viewCount ?? 0;
}

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

test("evaluateReportFreshness: long summary uses same itemSummary slice as generate", () => {
  const longSummary = "港".repeat(600);
  const item = {
    id: "t1",
    locale: { summaryZh: longSummary },
    fetchedAt: "2026-10-18T04:00:00.000Z",
  };
  const summary = itemSummary(item);
  assert.equal(summary.length, 500);
  const report = {
    ...baseReport,
    factCheckRows: [
      {
        itemId: "t1",
        infoType: "tuition",
        summary,
        fetchedAt: "2026-10-18T04:00:00.000Z",
        fetchedDate: "2026-10-18",
        contentFingerprint: factContentFingerprint(summary),
      },
    ],
  };
  const out = evaluateReportFreshness({
    report,
    latestSnapshotId: "snap_a",
    asOfDate: "2026-10-23",
    getItem: () => ({
      fetchedAt: item.fetchedAt,
      contentFingerprint: factContentFingerprint(itemSummary(item)),
    }),
  });
  assert.deepEqual(out, { fresh: true, reason: "ok" });
});

test("public share: long summary (>500) stays fresh when intel unchanged", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-us3-longsum-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });
  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const longSummary = "学".repeat(600);
  const summaryStored = itemSummary({ locale: { summaryZh: longSummary } });
  const fp = factContentFingerprint(summaryStored);
  seedSharedReport(db, {
    userId: reg.user_id,
    snapshotId: "snap_a",
    createdAt: "2026-10-20T04:00:00.000Z",
    factCheckRows: [
      {
        itemId: "t1",
        infoType: "tuition",
        summary: summaryStored,
        fetchedAt: "2026-10-18T04:00:00.000Z",
        fetchedDate: "2026-10-18",
        contentFingerprint: fp,
      },
    ],
  });
  const raw = JSON.parse(readFileSync(db, "utf8"));
  raw.intelligenceItems.find((i) => i.id === "t1").locale.summaryZh = longSummary;
  writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");
  const app2 = buildApp({ dataFile: db });
  const res = await app2.inject({ method: "GET", url: "/api/v1/public/reports/share_tok_us3" });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /正式正文SECRET/);
  assert.doesNotMatch(res.body, /报告已过期/);
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
  assert.equal(readReportShareViewCount(db), 1);
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
  assert.equal(readReportShareViewCount(db), 0);
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
  assert.equal(readReportShareViewCount(db), 0);
});

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
