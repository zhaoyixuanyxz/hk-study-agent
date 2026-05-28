import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, ensureIntelligenceCollections, INTELLIGENCE_COLLECTION_KEYS } from "../src/store.js";
import { loadSourcesRegistry, loadSchoolsRegistry } from "../src/intelligence/source-registry.js";
import { normalizeIntelligenceItem, computeDedupeHash } from "../src/intelligence/normalization-service.js";
import { createKnowledgeStore } from "../src/intelligence/knowledge-store.js";

test("ensureIntelligenceCollections initializes all intelligence arrays", () => {
  const db = { users: [] };
  ensureIntelligenceCollections(db);
  for (const k of INTELLIGENCE_COLLECTION_KEYS) {
    assert.ok(Array.isArray(db[k]), `${k} should be array`);
  }
});

test("static intelligence registries load sources and schools", () => {
  const { sources } = loadSourcesRegistry();
  const { schools } = loadSchoolsRegistry();
  assert.ok(sources.length >= 3, "sources.json should list multiple sources");
  assert.equal(schools.length, 8, "schools.json should list HK eight");
});

test("knowledge store syncs sources and upserts published item", () => {
  const dir = mkdtempSync(join(tmpdir(), "intel-s1-"));
  const dbPath = join(dir, "db.json");
  const store = createStore(dbPath);
  const ks = createKnowledgeStore(store);

  const sync = ks.syncSourcesFromRegistry();
  assert.ok(sync.inserted + sync.updated >= 3);

  const item = ks.upsertItem({
    sourceId: "hku-official",
    canonicalUrl: "https://www.hku.hk/admissions/test-sprint1",
    locale: { titleZh: "测试情报条目", summaryZh: "Sprint1 验收用摘要" },
    schoolIds: ["hku"],
    infoType: "policy",
    publishedAt: "2026-05-01T00:00:00.000Z",
  });
  assert.ok(item.id);
  assert.equal(item.reviewStatus, "auto_published");

  const listed = ks.listPublishedItems({ schoolId: "hku", limit: 10 });
  assert.ok(listed.some((x) => x.id === item.id));

  const run = ks.appendCollectionRun({ status: "completed", itemsIngested: 1 });
  assert.equal(run.itemsIngested, 1);

  rmSync(dir, { recursive: true, force: true });
});

test("normalizeIntelligenceItem dedupeHash is stable", () => {
  const a = normalizeIntelligenceItem({
    sourceId: "hku-official",
    canonicalUrl: "https://example.com/a",
    locale: { titleZh: "标题" },
  });
  const b = computeDedupeHash("https://example.com/a", "标题");
  assert.equal(a.dedupeHash, b);
});

test("pending_review for media source tier", () => {
  const item = normalizeIntelligenceItem({
    sourceId: "hkb-media",
    canonicalUrl: "https://www.hkcd.com/edu/sample",
    locale: { titleZh: "媒体待审" },
  });
  assert.equal(item.reviewStatus, "pending_review");
});
