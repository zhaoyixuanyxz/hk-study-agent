import assert from "node:assert";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createStore } from "../src/store.js";
import { loadCuratedSeedsIntoStore } from "../src/intelligence/seed-loader.js";
import { extractProfileSearchHints } from "../src/intelligence/profile-search-hints.js";
import {
  externalKbCitationId,
  loadExternalKb,
  selectExternalKbForProfile,
} from "../src/intelligence/external-kb-loader.js";
import {
  buildCombinedIntelContext,
  buildIntelSearchQuery,
  buildIntelContextPack,
} from "../src/intelligence/intelContextPack.js";
import { searchIntelligenceItems } from "../src/intelligence/searchItems.js";
import { filterCitationsAgainstCombinedSources } from "../src/citation-utils.js";
import { buildMockStructuredPlan } from "../src/planning-service.js";
import { scorePlanContent as cqScorePlan } from "../src/content-quality.js";

const pivCs = {
  goals: { value: { field: "数据科学", target_schools: ["hkust"] } },
  academic: { value: { gpa: "3.4", language: "IELTS 6.5" } },
  timeline: { value: { intake_or_season: "2026 秋季" } },
  readiness: { ready: true, missingRequired: [] },
};

const pivFin = {
  goals: { value: { field: "金融", target_schools: ["cuhk"] } },
  academic: { value: { gpa: "3.0" } },
  timeline: { value: { intake_or_season: "2027 春季" } },
  readiness: { ready: true, missingRequired: [] },
};

function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), "v3-kb-"));
  const dbPath = join(dir, "db.json");
  writeFileSync(dbPath, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  const store = createStore(dbPath);
  loadCuratedSeedsIntoStore(store, { force: true });
  return store;
}

test("V3-KB extractProfileSearchQuery includes field and schools", () => {
  const q = buildIntelSearchQuery({ planInputView: pivCs });
  assert.match(q, /数据科学/);
  assert.match(q, /hkust|2026/i);
});

test("V3-KB external-kb has at least 20 official entries", () => {
  const kb = loadExternalKb();
  assert.ok(kb.entries.length >= 20);
  assert.ok(kb.entries.every((e) => e.trustTier === "official" && String(e.url).startsWith("http")));
});

test("V3-KB profile-weighted search differs by field/school", () => {
  const store = tempStore();
  const q = buildIntelSearchQuery({ planInputView: pivCs });
  const a = searchIntelligenceItems(store, { q, limit: 8, profileHints: extractProfileSearchHints({ planInputView: pivCs }) });
  const b = searchIntelligenceItems(store, { q: buildIntelSearchQuery({ planInputView: pivFin }), limit: 8, profileHints: extractProfileSearchHints({ planInputView: pivFin }) });
  const idsA = new Set(a.items.map((x) => x.id));
  const idsB = new Set(b.items.map((x) => x.id));
  const overlap = [...idsA].filter((id) => idsB.has(id)).length;
  assert.ok(idsA.size >= 1 && idsB.size >= 1);
  assert.ok(overlap < Math.min(idsA.size, idsB.size), "Top sets should differ between profiles");
});

test("V3-KB combined context includes relevance and external kb", () => {
  const store = tempStore();
  const pack = buildCombinedIntelContext(store, { planInputView: pivCs, forPlanOrReport: true });
  assert.ok(pack.text.includes("relevance:"));
  assert.ok(pack.text.includes("EXTERNAL_KB"));
  assert.ok(pack.extKbEntries.length >= 1);
  assert.ok(pack.text.length <= 8000);
});

test("V3-KB ext_kb citations pass allowlist", () => {
  const ext = selectExternalKbForProfile({ planInputView: pivCs, limit: 6 });
  const id = externalKbCitationId(ext[0]);
  const filtered = filterCitationsAgainstCombinedSources(
    [{ itemId: id, url: ext[0].url, sourceTitle: ext[0].title }],
    [],
    ext
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].itemId, id);
});

test("V3-KB mock plan has at least 6 citations", () => {
  const store = tempStore();
  const pack = buildCombinedIntelContext(store, { planInputView: pivCs, forPlanOrReport: true });
  const plan = buildMockStructuredPlan(pivCs, pack.items, pack.extKbEntries);
  assert.ok(Array.isArray(plan.citations));
  assert.ok(plan.citations.length >= 6, `expected >=6 citations, got ${plan.citations.length}`);
  const score = cqScorePlan(plan);
  assert.equal(score.pass, true, score.issues.join(","));
});

test("V3-KB intel pack limit 12 for plan", () => {
  const store = tempStore();
  const pack = buildIntelContextPack(store, { planInputView: pivCs, forPlanOrReport: true, limit: 12 });
  assert.ok(pack.items.length <= 12);
  assert.ok(pack.text.includes("relevance:"));
});
