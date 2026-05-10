import assert from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildApp } from "../src/app.js";
import { resetPlanGenerateMetrics } from "../src/plan-generation-metrics.js";

function headers(token) {
  return { authorization: `Bearer ${token}` };
}

test("register and health", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-test-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  let r = await app.inject({ method: "GET", url: "/health" });
  assert.equal(r.statusCode, 200);

  r = await app.inject({ method: "POST", url: "/api/v1/users/register" });
  assert.equal(r.statusCode, 200);
  const { token } = JSON.parse(r.body);
  assert.ok(token);

  r = await app.inject({ method: "POST", url: "/api/v1/threads", headers: headers(token) });
  assert.equal(r.statusCode, 200);
  const { thread_id } = JSON.parse(r.body);

  for (let i = 0; i < 3; i++) {
    r = await app.inject({
      method: "POST",
      url: `/api/v1/threads/${thread_id}/messages`,
      headers: { ...headers(token), "content-type": "application/json" },
      payload: JSON.stringify({ content: `第${i + 1}轮：目标香港，计算机硕士。` }),
    });
    assert.equal(r.statusCode, 200, r.body);
    const body = JSON.parse(r.body);
    assert.equal(body.assistant_message.role, "assistant");
    assert.ok(body.orchestration_state);
  }

  r = await app.inject({ method: "GET", url: `/api/v1/threads/${thread_id}`, headers: headers(token) });
  assert.equal(r.statusCode, 200);
  const thread = JSON.parse(r.body);
  assert.ok(thread.messages.length >= 6);
});

test("cross-user thread forbidden", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-test-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const t1 = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body).token;
  const t2 = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body).token;
  const tid = JSON.parse(
    (await app.inject({ method: "POST", url: "/api/v1/threads", headers: headers(t1) })).body
  ).thread_id;

  const r = await app.inject({ method: "GET", url: `/api/v1/threads/${tid}`, headers: headers(t2) });
  assert.equal(r.statusCode, 404);
});

test("missing token", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-test-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  const app = buildApp({ dataFile: db });
  const r = await app.inject({ method: "POST", url: "/api/v1/threads" });
  assert.equal(r.statusCode, 401);
});

test("phase2 profile snapshot after HK message", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-test-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const { thread_id } = JSON.parse(
    (await app.inject({ method: "POST", url: "/api/v1/threads", headers: headers(token) })).body
  );

  let r = await app.inject({
    method: "POST",
    url: `/api/v1/threads/${thread_id}/messages`,
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ content: "我想申请香港计算机硕士，本科211。" }),
  });
  assert.equal(r.statusCode, 200);

  r = await app.inject({ method: "GET", url: "/api/v1/profile/snapshot", headers: headers(token) });
  assert.equal(r.statusCode, 200);
  const body = JSON.parse(r.body);
  assert.ok(body.snapshot);
  assert.ok(body.snapshot.structuredFacts?.target_region || body.snapshot.summary);
});

test("phase2 cross-thread memory still on user profile", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-test-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const t1 = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/threads", headers: headers(token) })).body
  ).thread_id;

  await app.inject({
    method: "POST",
    url: `/api/v1/threads/${t1}/messages`,
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ content: "目标香港，计算机硕士。" }),
  });

  const t2 = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/threads", headers: headers(token) })).body
  ).thread_id;
  assert.notEqual(t1, t2);

  const r = await app.inject({ method: "GET", url: "/api/v1/profile", headers: headers(token) });
  assert.equal(r.statusCode, 200);
  const body = JSON.parse(r.body);
  assert.ok(body.snapshot?.structuredFacts?.target_region || body.memories?.length);
});

test("phase2 confirm fact upgrades snapshot", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-test-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const { thread_id } = JSON.parse(
    (await app.inject({ method: "POST", url: "/api/v1/threads", headers: headers(token) })).body
  );

  await app.inject({
    method: "POST",
    url: `/api/v1/threads/${thread_id}/messages`,
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ content: "香港计算机硕士。" }),
  });

  let r = await app.inject({
    method: "POST",
    url: "/api/v1/profile/confirmations/fact_target_region",
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ value: "香港" }),
  });
  assert.equal(r.statusCode, 200);
  const out = JSON.parse(r.body);
  assert.ok(out.snapshot?.confirmationState?.facts?.some((f) => f.key === "target_region" && f.status === "confirmed"));
});

function seedReadyPlanInputView(dbPath, userId) {
  const raw = JSON.parse(readFileSync(dbPath, "utf8"));
  raw.profileSnapshots = raw.profileSnapshots || [];
  raw.planResults = raw.planResults || [];
  raw.profileSnapshots.push({
    id: "snap_test_1",
    userId,
    version: 1,
    snapshot: {
      summary: "测试快照",
      structuredFacts: {},
      gaps: [],
      confirmationState: { facts: [] },
      updatedAt: new Date().toISOString(),
    },
    planInputView: {
      schemaVersion: "1.0",
      academic: { value: { gpa: "3.5", school_background: "211" }, source: "confirmed" },
      goals: { value: { target_region: "香港", field: "计算机" }, source: "confirmed" },
      budget: { value: { budget_range: "30万港币" }, source: "confirmed" },
      timeline: { value: { intake_or_season: "2026秋" }, source: "confirmed" },
      riskPreference: { value: { risk_style: "balanced" }, source: "confirmed" },
      readiness: { ready: true, missingRequired: [] },
    },
    createdAt: new Date().toISOString(),
  });
  writeFileSync(dbPath, JSON.stringify(raw, null, 2), "utf8");
}

test("phase3 generate plan mock", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-test-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const { user_id: userId, token } = reg;
  seedReadyPlanInputView(db, userId);

  let r = await app.inject({ method: "POST", url: "/api/v1/plans/generate", headers: headers(token) });
  assert.equal(r.statusCode, 200, r.body);
  const body = JSON.parse(r.body);
  assert.equal(body.ok, true);
  assert.ok(body.plan_id);
  assert.ok(body.plan?.tiers?.reach?.summary);
  assert.ok(body.plan?.disclaimer);

  r = await app.inject({ method: "GET", url: `/api/v1/plans/${body.plan_id}`, headers: headers(token) });
  assert.equal(r.statusCode, 200);
  const detail = JSON.parse(r.body);
  assert.equal(detail.plan_id, body.plan_id);

  r = await app.inject({ method: "GET", url: "/api/v1/plans", headers: headers(token) });
  assert.equal(r.statusCode, 200);
  const list = JSON.parse(r.body);
  assert.ok(list.plans.some((p) => p.plan_id === body.plan_id));
});

test("phase3 readiness not met", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-test-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const { user_id: userId, token } = reg;
  const raw = JSON.parse(readFileSync(db, "utf8"));
  raw.profileSnapshots = [
    {
      id: "snap_nr",
      userId,
      version: 1,
      snapshot: { summary: "", structuredFacts: {}, gaps: ["缺信息"], confirmationState: { facts: [] }, updatedAt: new Date().toISOString() },
      planInputView: {
        schemaVersion: "1.0",
        academic: { value: {}, source: "inferred" },
        goals: { value: {}, source: "inferred" },
        budget: { value: {}, source: "inferred" },
        timeline: { value: {}, source: "inferred" },
        riskPreference: { value: {}, source: "inferred" },
        readiness: { ready: false, missingRequired: ["goals"] },
      },
      createdAt: new Date().toISOString(),
    },
  ];
  writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");

  const r = await app.inject({ method: "POST", url: "/api/v1/plans/generate", headers: headers(token) });
  assert.equal(r.statusCode, 400);
  const body = JSON.parse(r.body);
  assert.equal(body.code, "READINESS_NOT_MET");
});

test("phase3 cross-user plan forbidden", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-test-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  seedReadyPlanInputView(db, reg.user_id);

  const gen = JSON.parse(
    (await app.inject({ method: "POST", url: "/api/v1/plans/generate", headers: headers(reg.token) })).body
  );
  const planId = gen.plan_id;

  const t2 = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body).token;
  const r = await app.inject({ method: "GET", url: `/api/v1/plans/${planId}`, headers: headers(t2) });
  assert.equal(r.statusCode, 404);
});

test("phase3 input incomplete without snapshot", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-test-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const r = await app.inject({ method: "POST", url: "/api/v1/plans/generate", headers: headers(token) });
  assert.equal(r.statusCode, 400);
  const body = JSON.parse(r.body);
  assert.equal(body.code, "INPUT_INCOMPLETE");
});

test("phase3 plan generation metrics P3-BE-03", async () => {
  const prevMetrics = process.env.PLAN_METRICS_HTTP_TOKEN;
  process.env.PLAN_METRICS_HTTP_TOKEN = "test-metrics-token";
  resetPlanGenerateMetrics();

  const dir = mkdtempSync(join(tmpdir(), "sa-test-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  let r = await app.inject({
    method: "GET",
    url: "/api/v1/internal/plan-generation/metrics",
    headers: { "x-plan-metrics-token": "test-metrics-token" },
  });
  assert.equal(r.statusCode, 200);
  const empty = JSON.parse(r.body);
  assert.equal(empty.attempts_total, 0);

  r = await app.inject({ method: "GET", url: "/api/v1/internal/plan-generation/metrics", headers: {} });
  assert.equal(r.statusCode, 404);

  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  await app.inject({ method: "POST", url: "/api/v1/plans/generate", headers: headers(token) });

  r = await app.inject({
    method: "GET",
    url: "/api/v1/internal/plan-generation/metrics",
    headers: { "x-plan-metrics-token": "test-metrics-token" },
  });
  assert.equal(r.statusCode, 200);
  const m1 = JSON.parse(r.body);
  assert.equal(m1.attempts_total, 1);
  assert.equal(m1.failure_total, 1);
  assert.equal(m1.failure_by_code.INPUT_INCOMPLETE, 1);

  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  seedReadyPlanInputView(db, reg.user_id);
  await app.inject({ method: "POST", url: "/api/v1/plans/generate", headers: headers(reg.token) });

  r = await app.inject({
    method: "GET",
    url: "/api/v1/internal/plan-generation/metrics",
    headers: { "x-plan-metrics-token": "test-metrics-token" },
  });
  const m2 = JSON.parse(r.body);
  assert.equal(m2.attempts_total, 2);
  assert.equal(m2.success_total, 1);
  assert.equal(m2.failure_total, 1);
  assert.equal(m2.failure_by_code.INPUT_INCOMPLETE, 1);
  assert.ok(typeof m2.avg_duration_ms_success === "number");

  process.env.PLAN_METRICS_HTTP_TOKEN = prevMetrics;
});

test("phase3 metrics endpoint hidden without env", async () => {
  const prev = process.env.PLAN_METRICS_HTTP_TOKEN;
  delete process.env.PLAN_METRICS_HTTP_TOKEN;
  const dir = mkdtempSync(join(tmpdir(), "sa-test-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  const app = buildApp({ dataFile: db });
  const r = await app.inject({ method: "GET", url: "/api/v1/internal/plan-generation/metrics" });
  assert.equal(r.statusCode, 404);
  process.env.PLAN_METRICS_HTTP_TOKEN = prev;
});

test("phase4 generate report mock — P3 blocks and list fields", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-test-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const { user_id: userId, token } = reg;
  seedReadyPlanInputView(db, userId);

  let r = await app.inject({ method: "POST", url: "/api/v1/plans/generate", headers: headers(token) });
  assert.equal(r.statusCode, 200, r.body);
  const planBody = JSON.parse(r.body);
  const planId = planBody.plan_id;

  r = await app.inject({
    method: "POST",
    url: "/api/v1/reports/generate",
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ plan_id: planId }),
  });
  assert.equal(r.statusCode, 200, r.body);
  const rep = JSON.parse(r.body);
  assert.equal(rep.ok, true);
  assert.ok(rep.report_id);
  assert.ok(rep.html);
  assert.ok(rep.word_count >= 200);
  assert.ok(rep.html.includes('id="parent-summary"'));
  assert.ok(rep.html.includes('id="action-plan"'));
  assert.ok(rep.html.includes('id="report-citations"'));
  assert.ok(rep.html.includes("report-chapter"));
  assert.ok(typeof rep.citation_count === "number");

  r = await app.inject({ method: "GET", url: "/api/v1/reports", headers: headers(token) });
  assert.equal(r.statusCode, 200);
  const list = JSON.parse(r.body);
  const row = list.reports.find((x) => x.report_id === rep.report_id);
  assert.ok(row);
  assert.ok(typeof row.citation_count === "number");
  assert.ok(["none", "active", "revoked"].includes(row.share_status));
  assert.equal(row.is_latest, true);

  r = await app.inject({ method: "GET", url: `/api/v1/reports/${rep.report_id}`, headers: headers(token) });
  assert.equal(r.statusCode, 200);
  const detail = JSON.parse(r.body);
  assert.equal(detail.report_id, rep.report_id);
  assert.ok(detail.html);

  r = await app.inject({ method: "GET", url: "/api/v1/history", headers: headers(token) });
  assert.equal(r.statusCode, 200);
  const hist = JSON.parse(r.body);
  assert.ok(Array.isArray(hist.threads));
  assert.ok(Array.isArray(hist.profile_snapshots));
  assert.ok(Array.isArray(hist.plans));
  assert.ok(Array.isArray(hist.reports));
  assert.ok(hist.plans.some((p) => p.plan_id === planId));
  assert.ok(hist.reports.some((x) => x.report_id === rep.report_id));
  const hr = hist.reports.find((x) => x.report_id === rep.report_id);
  assert.ok(hr);
  assert.ok(typeof hr.citation_count === "number");
  assert.equal(hr.plan_id, planId);
});

test("phase4 report forbidden cross-user", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-test-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  seedReadyPlanInputView(db, reg.user_id);
  await app.inject({ method: "POST", url: "/api/v1/plans/generate", headers: headers(reg.token) });
  const gen = JSON.parse(
    (await app.inject({
      method: "POST",
      url: "/api/v1/reports/generate",
      headers: { ...headers(reg.token), "content-type": "application/json" },
      payload: JSON.stringify({}),
    })).body
  );
  const reportId = gen.report_id;

  const t2 = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body).token;
  let r = await app.inject({ method: "GET", url: `/api/v1/reports/${reportId}`, headers: headers(t2) });
  assert.equal(r.statusCode, 404);

  r = await app.inject({ method: "GET", url: "/api/v1/history", headers: headers(t2) });
  assert.equal(r.statusCode, 200);
  const hist = JSON.parse(r.body);
  assert.ok(!hist.reports.some((x) => x.report_id === reportId));
});

test("phase4 no plan report fails", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-test-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const { user_id: userId, token } = reg;
  const raw = JSON.parse(readFileSync(db, "utf8"));
  raw.profileSnapshots = [
    {
      id: "snap_only",
      userId,
      version: 1,
      snapshot: {
        summary: "仅快照",
        gaps: [],
        structuredFacts: {},
        confirmationState: { facts: [] },
        updatedAt: new Date().toISOString(),
      },
      planInputView: {
        schemaVersion: "1.0",
        readiness: { ready: true, missingRequired: [] },
        goals: { value: { target_region: "香港" }, source: "confirmed" },
        academic: { value: {}, source: "confirmed" },
        budget: { value: {}, source: "confirmed" },
        timeline: { value: {}, source: "confirmed" },
        riskPreference: { value: {}, source: "confirmed" },
      },
      createdAt: new Date().toISOString(),
    },
  ];
  writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");

  const r = await app.inject({
    method: "POST",
    url: "/api/v1/reports/generate",
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({}),
  });
  assert.equal(r.statusCode, 400);
  const body = JSON.parse(r.body);
  assert.equal(body.code, "NO_PLAN");
});

test("phase5 auth register login and analytics events", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-test-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  const app = buildApp({ dataFile: db });

  let r = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ email: "user@test.local", password: "secret12" }),
  });
  assert.equal(r.statusCode, 200, r.body);
  const reg = JSON.parse(r.body);
  assert.ok(reg.token);

  r = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ email: "user@test.local", password: "otherpwd00" }),
  });
  assert.equal(r.statusCode, 409);

  r = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ email: "user@test.local", password: "wrongpwd" }),
  });
  assert.equal(r.statusCode, 401);

  r = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ email: "user@test.local", password: "secret12" }),
  });
  assert.equal(r.statusCode, 200);
  const login = JSON.parse(r.body);
  assert.ok(login.token);

  r = await app.inject({
    method: "POST",
    url: "/api/v1/analytics/events",
    headers: { ...headers(login.token), "content-type": "application/json" },
    payload: JSON.stringify({ events: [{ name: "nav_click", props: { to: "chat" } }] }),
  });
  assert.equal(r.statusCode, 200);
  const ev = JSON.parse(r.body);
  assert.equal(ev.ok, true);
  assert.equal(ev.accepted, 1);
});

test("thread pin delete and history list", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-thread-mgmt-"));
  const dbPath = join(dir, "db.json");
  writeFileSync(dbPath, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: dbPath });

  let r = await app.inject({ method: "POST", url: "/api/v1/users/register" });
  const { token, user_id: userId } = JSON.parse(r.body);
  r = await app.inject({ method: "POST", url: "/api/v1/threads", headers: headers(token) });
  const t1 = JSON.parse(r.body).thread_id;
  r = await app.inject({ method: "POST", url: "/api/v1/threads", headers: headers(token) });
  const t2 = JSON.parse(r.body).thread_id;

  const now = new Date().toISOString();
  const rawSeed = JSON.parse(readFileSync(dbPath, "utf8"));
  rawSeed.profileSnapshots = [
    {
      id: "snap_legacy",
      userId,
      version: 1,
      snapshot: { summary: "legacy", structuredFacts: {}, gaps: [], confirmationState: { facts: [] }, updatedAt: now },
      planInputView: null,
      createdAt: now,
    },
    {
      id: "snap_t2",
      userId,
      threadId: t2,
      version: 2,
      snapshot: { summary: "t2", structuredFacts: {}, gaps: [], confirmationState: { facts: [] }, updatedAt: now },
      planInputView: { schemaVersion: "1.0", readiness: { ready: true, missingRequired: [] } },
      createdAt: now,
    },
  ];
  rawSeed.planResults = [
    {
      id: "plan_t2",
      userId,
      snapshotId: "snap_t2",
      snapshotVersion: 2,
      planInputSchemaVersion: "1.0",
      plan: { tiers: {} },
      createdAt: now,
    },
  ];
  rawSeed.reportResults = [
    {
      id: "rep_t2",
      userId,
      planId: "plan_t2",
      snapshotId: "snap_t2",
      snapshotVersion: 2,
      title: "",
      html: "<p>x</p>",
      citations: [],
      chapterCount: 7,
      wordCount: 1,
      createdAt: now,
      share: { token: null, enabled: false, createdAt: null, revokedAt: null, viewCount: 0, lastViewedAt: null },
    },
  ];
  rawSeed.profileMemories = [
    {
      id: "mem_t2",
      userId,
      kind: "candidate",
      key: "gpa",
      value: "3",
      threadId: t2,
      createdAt: now,
      updatedAt: now,
    },
  ];
  rawSeed.semanticMemoryChunks = [
    {
      id: "chunk_t2",
      userId,
      threadId: t2,
      text: "hi",
      words: ["hi"],
      createdAt: now,
    },
  ];
  rawSeed.conversationSummaries = [
    {
      id: "sum_t2",
      userId,
      threadId: t2,
      summary: "s",
      createdAt: now,
      updatedAt: now,
    },
  ];
  writeFileSync(dbPath, JSON.stringify(rawSeed, null, 2), "utf8");

  r = await app.inject({
    method: "PATCH",
    url: `/api/v1/threads/${t2}`,
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ pinned: true }),
  });
  assert.equal(r.statusCode, 200);
  const pBody = JSON.parse(r.body);
  assert.equal(pBody.pinned, true);

  r = await app.inject({ method: "GET", url: "/api/v1/history", headers: headers(token) });
  const hist = JSON.parse(r.body);
  assert.equal(hist.threads[0].thread_id, t2);
  assert.equal(hist.threads[0].pinned, true);

  r = await app.inject({
    method: "PATCH",
    url: `/api/v1/threads/${t1}`,
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ pinned: true }),
  });
  assert.equal(r.statusCode, 200);
  r = await app.inject({ method: "GET", url: "/api/v1/history", headers: headers(token) });
  const h2 = JSON.parse(r.body);
  const pinnedIds = h2.threads.filter((x) => x.pinned).map((x) => x.thread_id);
  assert.ok(pinnedIds.includes(t1));
  assert.ok(pinnedIds.includes(t2));

  r = await app.inject({
    method: "DELETE",
    url: `/api/v1/threads/${t1}`,
    headers: headers(token),
  });
  assert.equal(r.statusCode, 200);
  r = await app.inject({ method: "GET", url: `/api/v1/threads/${t1}`, headers: headers(token) });
  assert.equal(r.statusCode, 404);

  const beforeT2Delete = JSON.parse(readFileSync(dbPath, "utf8"));
  // 删除空会话（t1）也会追加一条聚合快照以对齐摘要/画像；因此 delete_t1 后快照数已由 2 增至 3
  assert.equal(beforeT2Delete.profileSnapshots?.length ?? 0, 3);
  assert.equal(beforeT2Delete.planResults?.length ?? 0, 1);
  assert.equal(beforeT2Delete.reportResults?.length ?? 0, 1);

  r = await app.inject({ method: "DELETE", url: `/api/v1/threads/${t2}`, headers: headers(token) });
  assert.equal(r.statusCode, 200);
  const rawAfter = JSON.parse(readFileSync(dbPath, "utf8"));
  assert.equal(rawAfter.profileSnapshots?.length ?? 0, 3);
  assert.ok(rawAfter.profileSnapshots.some((s) => s.id === "snap_legacy"));
  const latest = rawAfter.profileSnapshots.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  )[0];
  assert.equal(latest.threadId, null);
  assert.equal((latest.snapshot?.confirmationState?.facts || []).length, 0);
  assert.equal(rawAfter.planResults?.length ?? 0, 0);
  assert.equal(rawAfter.reportResults?.length ?? 0, 0);
  assert.equal(rawAfter.profileMemories?.length ?? 0, 0);
  assert.equal(rawAfter.semanticMemoryChunks?.length ?? 0, 0);
  assert.equal(rawAfter.conversationSummaries?.length ?? 0, 0);

  r = await app.inject({ method: "POST", url: "/api/v1/users/register" });
  const tokB = JSON.parse(r.body).token;
  r = await app.inject({ method: "POST", url: "/api/v1/threads", headers: headers(token) });
  const tOther = JSON.parse(r.body).thread_id;
  r = await app.inject({ method: "DELETE", url: `/api/v1/threads/${tOther}`, headers: headers(tokB) });
  assert.equal(r.statusCode, 404);
});

test("delete last thread drops user plans when no profile memories remain", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-thread-loose-plan-"));
  const dbPath = join(dir, "db.json");
  writeFileSync(dbPath, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: dbPath });

  let r = await app.inject({ method: "POST", url: "/api/v1/users/register" });
  const { token, user_id: userId } = JSON.parse(r.body);
  r = await app.inject({ method: "POST", url: "/api/v1/threads", headers: headers(token) });
  const t1 = JSON.parse(r.body).thread_id;

  const now = new Date().toISOString();
  const raw = JSON.parse(readFileSync(dbPath, "utf8"));
  raw.profileMemories = [
    {
      id: "m1",
      userId,
      kind: "confirmed",
      key: "gpa",
      value: "3",
      threadId: t1,
      createdAt: now,
      updatedAt: now,
    },
  ];
  raw.profileSnapshots = [
    {
      id: "snap_loose",
      userId,
      threadId: null,
      version: 1,
      snapshot: {
        summary: "x",
        structuredFacts: {},
        gaps: [],
        confirmationState: { facts: [] },
        updatedAt: now,
      },
      planInputView: null,
      createdAt: now,
    },
  ];
  raw.planResults = [
    {
      id: "plan_loose",
      userId,
      snapshotId: "snap_loose",
      snapshotVersion: 1,
      planInputSchemaVersion: "1.0",
      plan: { tiers: {} },
      createdAt: now,
    },
  ];
  writeFileSync(dbPath, JSON.stringify(raw, null, 2), "utf8");

  r = await app.inject({ method: "DELETE", url: `/api/v1/threads/${t1}`, headers: headers(token) });
  assert.equal(r.statusCode, 200);

  const after = JSON.parse(readFileSync(dbPath, "utf8"));
  assert.equal((after.planResults || []).filter((p) => p.userId === userId).length, 0);
  assert.equal((after.reportResults || []).filter((x) => x.userId === userId).length, 0);
});

test("delete profile snapshot cascades plans and reports keeps other snapshots", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-snap-del-"));
  const dbPath = join(dir, "db.json");
  writeFileSync(dbPath, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: dbPath });

  let r = await app.inject({ method: "POST", url: "/api/v1/users/register" });
  const { token, user_id: userId } = JSON.parse(r.body);
  const now = new Date().toISOString();
  const raw = JSON.parse(readFileSync(dbPath, "utf8"));
  raw.profileSnapshots = [
    {
      id: "snap_del",
      userId,
      version: 1,
      snapshot: { summary: "del", structuredFacts: {}, gaps: [], confirmationState: { facts: [] }, updatedAt: now },
      planInputView: null,
      createdAt: now,
    },
    {
      id: "snap_keep",
      userId,
      version: 2,
      snapshot: { summary: "keep", structuredFacts: {}, gaps: [], confirmationState: { facts: [] }, updatedAt: now },
      planInputView: null,
      createdAt: now,
    },
  ];
  raw.planResults = [
    {
      id: "plan_on_del",
      userId,
      snapshotId: "snap_del",
      snapshotVersion: 1,
      planInputSchemaVersion: "1.0",
      plan: { tiers: {} },
      createdAt: now,
    },
    {
      id: "plan_on_keep",
      userId,
      snapshotId: "snap_keep",
      snapshotVersion: 2,
      planInputSchemaVersion: "1.0",
      plan: { tiers: {} },
      createdAt: now,
    },
  ];
  raw.reportResults = [
    {
      id: "rep_del",
      userId,
      planId: "plan_on_del",
      snapshotId: "snap_del",
      snapshotVersion: 1,
      reportSchemaVersion: "2.0",
      title: "",
      html: "<p>d</p>",
      citations: [],
      chapterCount: 7,
      wordCount: 1,
      createdAt: now,
      share: { token: null, enabled: false, createdAt: null, revokedAt: null, viewCount: 0, lastViewedAt: null },
    },
  ];
  writeFileSync(dbPath, JSON.stringify(raw, null, 2), "utf8");

  r = await app.inject({
    method: "DELETE",
    url: "/api/v1/profile/snapshots/snap_del",
    headers: headers(token),
  });
  assert.equal(r.statusCode, 200);
  const body = JSON.parse(r.body);
  assert.equal(body.ok, true);

  const after = JSON.parse(readFileSync(dbPath, "utf8"));
  const snaps = after.profileSnapshots.filter((s) => s.userId === userId);
  assert.equal(snaps.length, 1);
  assert.equal(snaps[0].id, "snap_keep");
  const plans = after.planResults.filter((p) => p.userId === userId);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].id, "plan_on_keep");
  assert.equal((after.reportResults || []).filter((x) => x.userId === userId).length, 0);

  r = await app.inject({ method: "GET", url: "/api/v1/plans/plan_on_del", headers: headers(token) });
  assert.equal(r.statusCode, 404);

  r = await app.inject({
    method: "DELETE",
    url: "/api/v1/profile/snapshots/snap_nope",
    headers: headers(token),
  });
  assert.equal(r.statusCode, 404);
});
