import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { runIngestion } from "../src/intelligence/ingestion-service.js";
import { loadCuratedSeedsIntoStore } from "../src/intelligence/seed-loader.js";
import { buildDefaultCuratedSeeds } from "../src/intelligence/seed-loader.js";

let app;
let dbPath;
let reviewerToken;
let userToken;
const reviewerEmail = "reviewer-sprint2@test.local";

before(async () => {
  process.env.INTELLIGENCE_REVIEWER_EMAILS = reviewerEmail;
  const dir = mkdtempSync(join(tmpdir(), "intel-p7-"));
  dbPath = join(dir, "db.json");
  app = buildApp({ dataFile: dbPath });
  await app.ready();

  const regReviewer = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: reviewerEmail, password: "secret12" },
  });
  assert.equal(regReviewer.statusCode, 200);
  reviewerToken = regReviewer.json().token;

  const regUser = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: "user-sprint2@test.local", password: "secret12" },
  });
  userToken = regUser.json().token;
});

after(async () => {
  await app.close();
  if (dbPath) {
    try {
      rmSync(join(dbPath, ".."), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  delete process.env.INTELLIGENCE_REVIEWER_EMAILS;
});

test("curated seeds provide at least 50 published items", () => {
  const seeds = buildDefaultCuratedSeeds();
  assert.ok(seeds.length >= 50, `expected >=50 seeds, got ${seeds.length}`);
});

test("daily ingestion ingests at least one pending_review item (mock)", async () => {
  const { createStore } = await import("../src/store.js");
  const store = createStore(dbPath);
  loadCuratedSeedsIntoStore(store, { force: true });
  const result = await runIngestion(store, { fetchEnabled: false });
  assert.ok(result.itemsIngested >= 1, "ingestion should add >=1 item");
  const pending = store.listIntelligenceItemsByReviewStatus({ reviewStatus: "pending_review", limit: 50 });
  assert.ok(pending.length >= 1);
});

test("review status: reviewer true, normal user false", async () => {
  const r1 = await app.inject({
    method: "GET",
    url: "/api/v1/intelligence/review/status",
    headers: { Authorization: `Bearer ${reviewerToken}` },
  });
  assert.equal(r1.statusCode, 200);
  assert.equal(r1.json().can_review, true);

  const r2 = await app.inject({
    method: "GET",
    url: "/api/v1/intelligence/review/status",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.json().can_review, false);
});

test("non-reviewer cannot access review queue", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/v1/intelligence/review/queue",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(res.statusCode, 403);
});

test("approve flow: pending item becomes visible on GET /intelligence/items", async () => {
  const { createStore } = await import("../src/store.js");
  const store = createStore(dbPath);
  await runIngestion(store, { fetchEnabled: false });
  const pending = store.listIntelligenceItemsByReviewStatus({ reviewStatus: "pending_review", limit: 1 });
  assert.ok(pending.length >= 1);
  const itemId = pending[0].id;

  const decide = await app.inject({
    method: "POST",
    url: "/api/v1/intelligence/review/decide",
    headers: { Authorization: `Bearer ${reviewerToken}` },
    payload: { item_id: itemId, decision: "approve" },
  });
  assert.equal(decide.statusCode, 200);
  assert.equal(decide.json().item.review_status, "approved");

  const list = await app.inject({
    method: "GET",
    url: "/api/v1/intelligence/items",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(list.statusCode, 200);
  const ids = list.json().items.map((x) => x.item_id);
  assert.ok(ids.includes(itemId), "approved item should appear in published list");
});

test("admin workspace returns feeds sources schools for reviewer", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/v1/intelligence/admin/workspace",
    headers: { Authorization: `Bearer ${reviewerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.feeds));
  assert.ok(Array.isArray(body.sources));
  assert.ok(Array.isArray(body.schools));
  assert.ok(body.stats && typeof body.stats.pending_review === "number");
});
