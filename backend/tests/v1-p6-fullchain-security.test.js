import assert from "node:assert";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildApp } from "../src/app.js";
import { normalizeReportResultInPlace } from "../src/store.js";

function headers(token) {
  return { authorization: `Bearer ${token}` };
}

function baseDb() {
  return {
    users: [],
    threads: [],
    messages: [],
    profileMemories: [],
    conversationSummaries: [],
    profileSnapshots: [],
    semanticMemoryChunks: [],
    planResults: [],
    reportResults: [],
    analyticsEvents: [],
  };
}

test("V1-P6 SEC-01 missing Bearer returns 401 on private routes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-v1p6-sec1-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify(baseDb(), null, 2), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const paths = [
    ["GET", "/api/v1/profile"],
    ["GET", "/api/v1/plans"],
    ["GET", "/api/v1/reports"],
    ["GET", "/api/v1/history"],
  ];
  for (const [method, url] of paths) {
    const r = await app.inject({ method, url });
    assert.equal(r.statusCode, 401, `${method} ${url} expected 401 got ${r.statusCode}`);
    const b = JSON.parse(r.body);
    assert.ok(b.code);
  }
});

test("V1-P6 SEC-02 cross-user cannot read threads plans reports or delete other's threads", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-v1p6-sec2-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify(baseDb(), null, 2), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const regA = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const regB = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);

  const raw = JSON.parse(readFileSync(db, "utf8"));
  raw.users = [
    { id: regA.user_id, token: regA.token, createdAt: new Date().toISOString() },
    { id: regB.user_id, token: regB.token, createdAt: new Date().toISOString() },
  ];
  raw.threads = [
    {
      id: "th_a",
      userId: regA.user_id,
      orchestrationState: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  const now = new Date().toISOString();
  raw.profileSnapshots = [
    {
      id: "snap_a",
      userId: regA.user_id,
      version: 1,
      snapshot: { summary: "a", structuredFacts: {}, gaps: [], confirmationState: { facts: [] }, updatedAt: now },
      planInputView: null,
      createdAt: now,
    },
  ];
  raw.planResults = [
    {
      id: "plan_a",
      userId: regA.user_id,
      snapshotId: null,
      snapshotVersion: null,
      planInputSchemaVersion: "1.0",
      plan: { tiers: { reach: {}, match: {}, safety: {} } },
      createdAt: new Date().toISOString(),
    },
  ];
  raw.reportResults = [
    {
      id: "rep_a",
      userId: regA.user_id,
      planId: null,
      snapshotId: null,
      snapshotVersion: null,
      reportSchemaVersion: "2.0",
      title: "A report",
      html: '<article class="study-report"><p>secret_a_only</p></article>',
      citations: [],
      chapterCount: 7,
      wordCount: 10,
      createdAt: new Date().toISOString(),
      share: { token: null, enabled: false, createdAt: null, revokedAt: null, viewCount: 0, lastViewedAt: null },
    },
  ];
  writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");

  const tokB = regB.token;

  const tTh = await app.inject({ method: "GET", url: "/api/v1/threads/th_a", headers: headers(tokB) });
  assert.equal(tTh.statusCode, 404);

  const tDelSnap = await app.inject({
    method: "DELETE",
    url: "/api/v1/profile/snapshots/snap_a",
    headers: headers(tokB),
  });
  assert.equal(tDelSnap.statusCode, 404);

  const tPl = await app.inject({ method: "GET", url: "/api/v1/plans/plan_a", headers: headers(tokB) });
  assert.equal(tPl.statusCode, 404);

  const tRep = await app.inject({ method: "GET", url: "/api/v1/reports/rep_a", headers: headers(tokB) });
  assert.equal(tRep.statusCode, 404);

  const tDelThread = await app.inject({
    method: "DELETE",
    url: "/api/v1/threads/th_a",
    headers: headers(tokB),
  });
  assert.equal(tDelThread.statusCode, 404);

  const tHist = JSON.parse(
    (await app.inject({ method: "GET", url: "/api/v1/history", headers: headers(tokB) })).body
  );
  assert.equal(
    (tHist.reports || []).some((x) => x.report_id === "rep_a"),
    false,
    "history must not list other user's reports"
  );
});

test("V1-P6 SEC-03 public share HTML does not leak other users report secrets", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-v1p6-sec3-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify(baseDb(), null, 2), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const regA = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const regB = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);

  const shareTok = "p6_share_token_" + "x".repeat(40);
  const secretB = "V1P6_OTHER_USER_REPORT_BODY_SECRET_Z9";

  const repA = {
    id: "rep_share_a",
    userId: regA.user_id,
    planId: null,
    snapshotId: null,
    snapshotVersion: null,
    reportSchemaVersion: "2.0",
    title: "Shared A",
    html: '<article class="study-report"><p>visible to public</p></article>',
    citations: [],
    chapterCount: 7,
    wordCount: 20,
    createdAt: new Date().toISOString(),
    share: {
      token: shareTok,
      enabled: true,
      createdAt: new Date().toISOString(),
      revokedAt: null,
      viewCount: 0,
      lastViewedAt: null,
    },
  };
  normalizeReportResultInPlace(repA);

  const repB = {
    id: "rep_private_b",
    userId: regB.user_id,
    planId: null,
    snapshotId: null,
    snapshotVersion: null,
    reportSchemaVersion: "2.0",
    title: "Private B",
    html: `<article class="study-report"><p>${secretB}</p></article>`,
    citations: [],
    chapterCount: 7,
    wordCount: 20,
    createdAt: new Date().toISOString(),
    share: { token: null, enabled: false, createdAt: null, revokedAt: null, viewCount: 0, lastViewedAt: null },
  };
  normalizeReportResultInPlace(repB);

  const raw = JSON.parse(readFileSync(db, "utf8"));
  raw.users = [
    { id: regA.user_id, token: regA.token, createdAt: new Date().toISOString() },
    { id: regB.user_id, token: regB.token, createdAt: new Date().toISOString() },
  ];
  raw.reportResults = [repA, repB];
  writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");

  const pub = await app.inject({ method: "GET", url: `/api/v1/public/reports/${encodeURIComponent(shareTok)}` });
  assert.equal(pub.statusCode, 200);
  assert.ok(pub.body.includes("visible to public"));
  assert.ok(!pub.body.includes(secretB), "must not include other report body");
  assert.ok(!pub.body.includes("rep_private_b"));
  assert.ok(!pub.body.includes(regB.user_id));
  assert.ok(!pub.body.includes(regA.user_id));
});

test("V1-P6 SEC-04 plans list returns JSON (no HTML injection via content-type)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-v1p6-sec4-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify(baseDb(), null, 2), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const r = await app.inject({ method: "GET", url: "/api/v1/plans", headers: headers(reg.token) });
  assert.equal(r.statusCode, 200);
  const ct = String(r.headers["content-type"] || "");
  assert.ok(ct.includes("json"), `expected json content-type, got ${ct}`);
  const body = JSON.parse(r.body);
  assert.ok(Array.isArray(body.plans));
});

test("V1-P6 smoke register thread and plans list returns 200", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-v1p6-smoke-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify(baseDb(), null, 2), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const thrRes = await app.inject({
    method: "POST",
    url: "/api/v1/threads",
    headers: headers(reg.token),
  });
  assert.equal(thrRes.statusCode, 200, thrRes.body);
  const thr = JSON.parse(thrRes.body);
  assert.ok(thr.thread_id);

  const plans = await app.inject({ method: "GET", url: "/api/v1/plans", headers: headers(reg.token) });
  assert.equal(plans.statusCode, 200);
  const pj = JSON.parse(plans.body);
  assert.ok(Array.isArray(pj.plans));
});
