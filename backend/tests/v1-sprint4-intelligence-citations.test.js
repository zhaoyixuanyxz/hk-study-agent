import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { loadCuratedSeedsIntoStore } from "../src/intelligence/seed-loader.js";
import { buildIntelContextPack } from "../src/intelligence/intelContextPack.js";
import {
  filterCitationsAgainstIntelligenceItems,
  filterCitationsAgainstCombinedSources,
  intelligenceItemsToAllowlistMap,
  normalizeCitations,
} from "../src/citation-utils.js";
import { selectExternalKbForProfile } from "../src/intelligence/external-kb-loader.js";
import { normalizeAgentOutput } from "../src/agent.js";
import { buildMockStructuredPlan } from "../src/planning-service.js";
import { generateHtmlReport } from "../src/report-service.js";

let app;
let dbPath;
let userToken;
let store;

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), "intel-s4-"));
  dbPath = join(dir, "db.json");
  const { createStore } = await import("../src/store.js");
  store = createStore(dbPath);
  loadCuratedSeedsIntoStore(store, { force: true });

  app = buildApp({ dataFile: dbPath });
  await app.ready();

  const reg = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: "user-s4@test.local", password: "secret12" },
  });
  userToken = reg.json().token;
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

test("intelligenceItemsToAllowlistMap and filter reject mismatched url", () => {
  const items = [
    {
      id: "intel-1",
      canonicalUrl: "https://seed.study-agent.local/hku/tuition/2026",
      locale: { titleZh: "港大学费" },
      publishedAt: "2026-04-15T08:00:00.000Z",
    },
  ];
  const map = intelligenceItemsToAllowlistMap(items);
  assert.equal(map.size, 1);
  const filtered = filterCitationsAgainstIntelligenceItems(
    [
      { itemId: "intel-1", url: "https://evil.example/bad" },
      { itemId: "intel-1", url: "https://seed.study-agent.local/hku/tuition/2026" },
      { itemId: "unknown", url: "https://seed.study-agent.local/hku/tuition/2026" },
    ],
    items
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].url, "https://seed.study-agent.local/hku/tuition/2026");
  assert.equal(filtered[0].sourceTitle, "港大学费");
});

test("buildIntelContextPack returns published HKU items for tuition query", () => {
  const pack = buildIntelContextPack(store, { userMessage: "香港大学 学费 政策", limit: 5 });
  assert.ok(pack.items.length >= 1);
  assert.ok(pack.text.includes("itemId="));
  assert.ok(pack.items.some((x) => x.schoolIds?.includes("hku")));
});

test("normalizeAgentOutput adds policy disclaimer when no citations", () => {
  const out = normalizeAgentOutput({
    reply: "港大授课型硕士的学费与截止日期请以官网为准。",
    gaps: [],
    gap_items: [],
    suggested_followups: [],
    readiness_for_profile: false,
    citations: [],
  });
  assert.ok(/官网|不作为事实依据|可追溯/.test(out.reply));
});

test("POST message returns allowlisted citations for policy-style question", async () => {
  const threadRes = await app.inject({
    method: "POST",
    url: "/api/v1/threads",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const threadId = threadRes.json().thread_id;

  const msgRes = await app.inject({
    method: "POST",
    url: `/api/v1/threads/${threadId}/messages`,
    headers: {
      Authorization: `Bearer ${userToken}`,
      "content-type": "application/json",
    },
    payload: { content: "想了解香港大学的学费和申请截止日期，有官方依据吗？" },
  });
  assert.equal(msgRes.statusCode, 200, msgRes.body);
  const body = msgRes.json();
  assert.ok(Array.isArray(body.citations));
  if (body.citations.length) {
    const cite = body.citations[0];
    assert.ok(cite.itemId);
    assert.ok(cite.url.startsWith("https://"));
    const item = store.getIntelligenceItem(cite.itemId);
    assert.ok(item);
    assert.equal(
      new URL(cite.url).href.replace(/\/$/, ""),
      new URL(item.canonicalUrl).href.replace(/\/$/, "")
    );
  }
});

test("mock plan includes citationRefs aligned with intelligence allowlist", () => {
  const pack = buildIntelContextPack(store, { userMessage: "香港 硕士 deadline", limit: 4 });
  const plan = buildMockStructuredPlan(
    {
      goals: { value: { target_region: "香港", field: "CS" } },
      academic: { value: { gpa: "3.2", school_background: "211" } },
      budget: { value: { budget_range: "30-40万" } },
      timeline: { value: { intake_or_season: "2026 Fall" } },
      riskPreference: { value: { risk_style: "均衡" } },
      readiness: { ready: true, missingRequired: [] },
    },
    pack.items
  );
  assert.ok(Array.isArray(plan.citations));
  assert.ok(Array.isArray(plan.citationRefs));
  assert.ok(plan.citations.length >= 6);
  const piv = {
    goals: { value: { target_region: "香港", field: "CS" } },
    academic: { value: { gpa: "3.2", school_background: "211" } },
    budget: { value: { budget_range: "30-40万" } },
    timeline: { value: { intake_or_season: "2026 Fall" } },
    riskPreference: { value: { risk_style: "均衡" } },
    readiness: { ready: true, missingRequired: [] },
  };
  const ext = selectExternalKbForProfile({ planInputView: piv, limit: 8 });
  const ok = filterCitationsAgainstCombinedSources(plan.citations, pack.items, ext);
  assert.equal(ok.length, plan.citations.length);
  assert.equal(plan.citationRefs[0].itemId, plan.citations[0].itemId);
});

test("mock report merges plan citations through intelligence filter", async () => {
  const pack = buildIntelContextPack(store, { userMessage: "香港大学 deadline", limit: 3 });
  const plan = buildMockStructuredPlan(
    {
      goals: { value: { target_region: "香港" } },
      academic: { value: { gpa: "3.0" } },
      budget: { value: { budget_range: "25万" } },
      timeline: { value: { intake_or_season: "2026" } },
      riskPreference: { value: { risk_style: "稳健" } },
      readiness: { ready: true, missingRequired: [] },
    },
    pack.items
  );
  const gen = await generateHtmlReport({ summary: "测试" }, plan, {
    useMock: true,
    intelItems: pack.items,
    intelContextText: pack.text,
  });
  assert.equal(gen.ok, true);
  const cites = gen.report.citations || [];
  for (const c of cites) {
    const filtered = filterCitationsAgainstIntelligenceItems([c], pack.items);
    assert.equal(filtered.length, 1);
  }
});
