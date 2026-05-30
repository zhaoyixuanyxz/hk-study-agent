import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { loadCuratedSeedsIntoStore } from "../src/intelligence/seed-loader.js";
import { loadAdmissionBenchmarksFile, loadAdmissionBenchmarksIntoStore } from "../src/intelligence/benchmark-loader.js";
import { buildIntelContextPack, rankIntelContextItems } from "../src/intelligence/intelContextPack.js";
import { searchIntelligenceItems } from "../src/intelligence/searchItems.js";
import { extractStructuredFields, buildChineseSummary } from "../src/intelligence/structured-extract.js";
import { buildMockStructuredPlan } from "../src/planning-service.js";
import { filterCitationsAgainstIntelligenceItems } from "../src/citation-utils.js";
import { seedReadyPlanInputView } from "../scripts/cq-regression-helpers.mjs";

let app;
let dbPath;
let store;
let userToken;
let userId;

const readyPiv = {
  goals: { value: { target_region: "香港", field: "数据科学", intent_degree: "授课型硕士" } },
  academic: { value: { gpa: "3.2", school_background: "内地一本" } },
  budget: { value: { budget_range: "30万港币" } },
  timeline: { value: { intake_or_season: "2026秋" } },
  riskPreference: { value: { risk_style: "balanced" } },
  readiness: { ready: true, missingRequired: [] },
};

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), "cq-d-"));
  dbPath = join(dir, "db.json");
  const { createStore } = await import("../src/store.js");
  store = createStore(dbPath);
  loadCuratedSeedsIntoStore(store, { force: true });

  app = buildApp({ dataFile: dbPath });
  await app.ready();

  const reg = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: "cq-d@test.local", password: "secret12" },
  });
  userToken = reg.json().token;
  userId = reg.json().user_id;
  process.env.DEEPSEEK_API_KEY = "";
});

after(async () => {
  await app.close();
  try {
    rmSync(join(dbPath, ".."), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  delete process.env.DEEPSEEK_API_KEY;
});

test("CQ-D admission-benchmarks.json has >=20 items with benchmarkGpa", () => {
  const { items } = loadAdmissionBenchmarksFile();
  assert.ok(items.length >= 20);
  assert.ok(items.every((x) => x.infoType === "benchmark"));
  assert.ok(items.every((x) => x.structured?.benchmarkGpa?.typical));
  const schools = new Set(items.flatMap((x) => x.schoolIds || []));
  assert.ok(schools.size >= 8);
});

test("CQ-D loadAdmissionBenchmarksIntoStore upserts published benchmark items", () => {
  const out = loadAdmissionBenchmarksIntoStore(store, { force: true });
  assert.ok(out.inserted >= 20);
  const published = store.listIntelligenceItems({ publishedOnly: true, limit: 5000 });
  const benchmarks = published.filter((x) => x.infoType === "benchmark");
  assert.ok(benchmarks.length >= 20);
});

test("CQ-D search GPA 基准 finds benchmark seeds", () => {
  const res = searchIntelligenceItems(store, { q: "GPA 基准", limit: 10, preferBenchmarks: true });
  assert.ok(res.total >= 1);
  assert.ok(res.items.some((x) => x.infoType === "benchmark"));
  assert.match(res.items[0].locale?.titleZh || "", /基准|GPA|录取/);
});

test("CQ-D buildIntelContextPack prioritizes benchmark for planInputView", () => {
  const pack = buildIntelContextPack(store, { planInputView: readyPiv, limit: 6 });
  assert.ok(pack.items.length >= 1);
  assert.equal(pack.items[0].infoType, "benchmark");
});

test("CQ-D rankIntelContextItems puts benchmark first", () => {
  const items = [
    { id: "a", infoType: "policy" },
    { id: "b", infoType: "benchmark" },
    { id: "c", infoType: "deadline" },
  ];
  const ranked = rankIntelContextItems(items, { preferBenchmarks: true });
  assert.equal(ranked[0].infoType, "benchmark");
});

test("CQ-D structured-extract benchmark infoType fields", () => {
  const text =
    "Typical admitted GPA 3.4 on 4.0 scale. IELTS 6.5 overall. Mathematics and Statistics are highly weighted. Competitive programme.";
  const structured = extractStructuredFields("benchmark", text, [], { schoolId: "hku" });
  assert.ok(structured.benchmarkGpa?.typical);
  assert.ok(Array.isArray(structured.subjectWeights));
  assert.ok(structured.competitionTag);
  const summary = buildChineseSummary("benchmark", text, structured);
  assert.match(summary, /录取参考基准|GPA/);
});

test("CQ-D mock plan citations prefer benchmark item", () => {
  const pack = buildIntelContextPack(store, { planInputView: readyPiv, limit: 8 });
  const plan = buildMockStructuredPlan(readyPiv, pack.items);
  assert.ok(plan.citations.length >= 1);
  const cited = store.getIntelligenceItem(plan.citations[0].itemId);
  assert.equal(cited?.infoType, "benchmark");
  const ok = filterCitationsAgainstIntelligenceItems(plan.citations, pack.items);
  assert.equal(ok.length, plan.citations.length);
});

test("CQ-D plan generate API returns citation with benchmark or policy/deadline", async () => {
  seedReadyPlanInputView(dbPath, userId);
  const planRes = await app.inject({
    method: "POST",
    url: "/api/v1/plans/generate",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(planRes.statusCode, 200, planRes.body);
  const plan = planRes.json().plan;
  assert.ok(Array.isArray(plan.citations));
  assert.ok(plan.citations.length >= 1);
  const item = store.getIntelligenceItem(plan.citations[0].itemId);
  assert.ok(item);
  assert.ok(["benchmark", "policy", "deadline", "admission", "tuition"].includes(item.infoType));
});

test("CQ-D GET intelligence search returns structured benchmark for API consumers", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/v1/intelligence/search?q=GPA%20%E5%9F%BA%E5%87%86&limit=5",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.total >= 1);
  const hit = body.items.find((x) => x.info_type === "benchmark" && x.structured?.benchmarkGpa);
  assert.ok(hit, "expected benchmark structured item in search API");
});
