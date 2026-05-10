import assert from "node:assert";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildApp } from "../src/app.js";
import { computeTruthStatus } from "../src/profile-view.js";
import { normalizePlanResult } from "../src/planning-service.js";

function headers(token) {
  return { authorization: `Bearer ${token}` };
}

function memMapFrom(rows) {
  const m = new Map();
  for (const row of rows) {
    m.set(row.key, { kind: row.kind, threadId: row.threadId ?? null, hasConflict: Boolean(row.hasConflict) });
  }
  return m;
}

test("V1-P2 computeTruthStatus does not label pending/ conflict as user_confirmed", () => {
  const pivInf = {
    academic: { value: { gpa: "3.5" }, source: "inferred" },
  };
  const mPending = memMapFrom([{ key: "gpa", kind: "candidate", threadId: "t1" }]);
  assert.equal(
    computeTruthStatus("gpa", { key: "gpa", status: "pending", value: "3.5" }, mPending, pivInf),
    "pending"
  );

  const mConflict = memMapFrom([{ key: "gpa", kind: "candidate", threadId: "t1", hasConflict: true }]);
  assert.equal(
    computeTruthStatus("gpa", { key: "gpa", status: "conflict", value: "3.5" }, mConflict, pivInf),
    "conflict"
  );

  const mOk = memMapFrom([{ key: "gpa", kind: "confirmed", threadId: "t1" }]);
  assert.equal(
    computeTruthStatus("gpa", { key: "gpa", status: "confirmed", value: "3.5" }, mOk, pivInf),
    "user_confirmed"
  );
});

test("V1-P2 normalizePlanResult tolerates missing risk_note citations timeline_urgency", () => {
  const p = normalizePlanResult({
    tiers: {
      reach: { summary: "a", rationale: "b" },
      match: { summary: "a", rationale: "b" },
      safety: { summary: "a", rationale: "b" },
    },
    risk_summary: "r",
    budget_suggestion: "bu",
    timeline_suggestion: "ti",
  });
  assert.ok(p);
  assert.ok(Array.isArray(p.citations));
  assert.equal(p.citations.length, 0);
  assert.equal(p.tiers.reach.risk_note, "");
  assert.equal(p.timeline_urgency, undefined);
});

test("V1-P2 normalizePlanResult filters bad citation URLs keeps https", () => {
  const p = normalizePlanResult({
    tiers: {
      reach: { summary: "a", rationale: "b" },
      match: { summary: "a", rationale: "b" },
      safety: { summary: "a", rationale: "b" },
    },
    risk_summary: "r",
    budget_suggestion: "bu",
    timeline_suggestion: "ti",
    citations: [
      { url: "javascript:alert(1)", itemId: "bad" },
      { url: "https://example.com/p", itemId: "ok", sourceTitle: "Ex" },
    ],
  });
  assert.ok(p);
  assert.equal(p.citations.length, 1);
  assert.ok(p.citations[0].url.startsWith("https://example.com/"));
});

test("V1-P2 GET profile returns profile_view sections", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-v1p2-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const { token, user_id: userId } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  assert.ok(userId);

  const raw = JSON.parse(readFileSync(db, "utf8"));

  raw.profileSnapshots.push({
    id: "snap_v1p2",
    userId,
    version: 1,
    snapshot: {
      summary: "单元测试画像",
      structuredFacts: { gpa: "3.5", target_region: "香港" },
      gaps: ["语言成绩待补充"],
      confirmationState: {
        facts: [
          { id: "fact_gpa", key: "gpa", value: "3.5", status: "pending" },
          { id: "fact_target_region", key: "target_region", value: "香港", status: "confirmed" },
        ],
      },
      insights: ["有过互联网大厂实习"],
      updatedAt: new Date().toISOString(),
    },
    planInputView: {
      schemaVersion: "1.0",
      academic: { value: { gpa: "3.5" }, source: "candidate" },
      goals: { value: { target_region: "香港", field: "CS" }, source: "confirmed" },
      budget: { value: { budget_range: "30万港币" }, source: "confirmed" },
      timeline: { value: { intake_or_season: "2026秋" }, source: "confirmed" },
      riskPreference: { value: { risk_style: "balanced" }, source: "confirmed" },
      readiness: { ready: true, missingRequired: [] },
    },
    createdAt: new Date().toISOString(),
  });

  raw.profileMemories.push(
    {
      id: "m1",
      userId,
      kind: "candidate",
      key: "gpa",
      value: "3.5",
      threadId: "th_test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "m2",
      userId,
      kind: "confirmed",
      key: "target_region",
      value: "香港",
      threadId: "th_test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  );

  raw.threads.push({
    id: "th_test",
    userId,
    orchestrationState: "init",
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");

  const r = await app.inject({ method: "GET", url: "/api/v1/profile", headers: headers(token) });
  assert.equal(r.statusCode, 200);
  const body = JSON.parse(r.body);
  assert.ok(body.profile_view);
  assert.ok(Array.isArray(body.profile_view.sections));
  assert.ok(body.profile_view.gap_details.length >= 1);
  const gpaRows = body.profile_view.sections.flatMap((s) => s.facts || []).filter((f) => f.key === "gpa");
  assert.ok(gpaRows.length >= 1);
  assert.equal(gpaRows[0].truth_status, "pending");
  const trRows = body.profile_view.sections.flatMap((s) => s.facts || []).filter((f) => f.key === "target_region");
  assert.equal(trRows[0].truth_status, "user_confirmed");
});

test("V1-P2 GET plan detail includes report_readiness", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-v1p2-plan-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const { user_id: userId, token } = reg;

  const raw = JSON.parse(readFileSync(db, "utf8"));
  raw.profileSnapshots = [
    {
      id: "snap_plan_rr",
      userId,
      version: 1,
      snapshot: {
        summary: "x",
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
    },
  ];
  raw.planResults = [
    {
      id: "plan_rr_1",
      userId,
      snapshotId: "snap_plan_rr",
      snapshotVersion: 1,
      planInputSchemaVersion: "1.0",
      plan: normalizePlanResult({
        tiers: {
          reach: { summary: "a", rationale: "b" },
          match: { summary: "a", rationale: "b" },
          safety: { summary: "a", rationale: "b" },
        },
        risk_summary: "r",
        budget_suggestion: "bu",
        timeline_suggestion: "ti",
      }),
      createdAt: new Date().toISOString(),
    },
  ];
  writeFileSync(db, JSON.stringify(raw, null, 2), "utf8");

  const r = await app.inject({ method: "GET", url: "/api/v1/plans/plan_rr_1", headers: headers(token) });
  assert.equal(r.statusCode, 200);
  const body = JSON.parse(r.body);
  assert.ok(body.report_readiness);
  assert.equal(typeof body.report_readiness.ok, "boolean");
  assert.ok(Array.isArray(body.report_readiness.reasons));
  assert.ok(Array.isArray(body.plan.citations));
});
