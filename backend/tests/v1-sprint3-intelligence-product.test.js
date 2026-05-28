import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { loadCuratedSeedsIntoStore } from "../src/intelligence/seed-loader.js";
import { searchIntelligenceItems } from "../src/intelligence/searchItems.js";
import { getSchoolDetail, listSchoolCards } from "../src/intelligence/schoolDashboard.js";

let app;
let dbPath;
let userToken;
let reviewerToken;
const reviewerEmail = "reviewer-s3@test.local";

before(async () => {
  process.env.INTELLIGENCE_REVIEWER_EMAILS = reviewerEmail;
  const dir = mkdtempSync(join(tmpdir(), "intel-s3-"));
  dbPath = join(dir, "db.json");
  app = buildApp({ dataFile: dbPath });
  await app.ready();

  const { createStore } = await import("../src/store.js");
  loadCuratedSeedsIntoStore(createStore(dbPath), { force: true });

  const regUser = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: "user-s3@test.local", password: "secret12" },
  });
  userToken = regUser.json().token;

  const regRev = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: reviewerEmail, password: "secret12" },
  });
  reviewerToken = regRev.json().token;
});

after(async () => {
  await app.close();
  try {
    rmSync(join(dbPath, ".."), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  delete process.env.INTELLIGENCE_REVIEWER_EMAILS;
});

test("searchIntelligenceItems finds published items by keyword", async () => {
  const { createStore } = await import("../src/store.js");
  const store = createStore(dbPath);
  const r = searchIntelligenceItems(store, { q: "香港大学", limit: 10 });
  assert.ok(r.total >= 1);
  assert.ok(r.items.every((x) => x.reviewStatus === "approved" || x.reviewStatus === "auto_published"));
});

test("GET /intelligence/search returns published matches for user", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/v1/intelligence/search?q=%E6%B8%AF%E5%A4%A7&limit=5",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().total >= 1);
  assert.ok(Array.isArray(res.json().items));
});

test("GET /intelligence/schools lists eight schools with counts", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/v1/intelligence/schools",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().schools.length, 8);
  assert.ok(res.json().schools.some((s) => s.school_id === "hku" && s.item_count >= 1));
});

test("GET /intelligence/schools/:id returns detail and timeline", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/v1/intelligence/schools/hku",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().school.school_id, "hku");
  assert.ok(res.json().overview.item_count >= 1);
  assert.ok(Array.isArray(res.json().latest_items));
  assert.ok(Array.isArray(res.json().timeline));
});

test("GET /intelligence/schools/:slug accepts slug alias", async () => {
  const { createStore } = await import("../src/store.js");
  const store = createStore(dbPath);
  const detail = getSchoolDetail(store, "cuhk");
  assert.ok(detail);
  assert.equal(detail.school.slug, "cuhk");
});

test("listSchoolCards aggregates item_count", async () => {
  const { createStore } = await import("../src/store.js");
  const cards = listSchoolCards(createStore(dbPath));
  assert.equal(cards.length, 8);
  assert.ok(cards.reduce((n, c) => n + c.item_count, 0) >= 50);
});

test("non-reviewer GET admin/workspace returns 403", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/v1/intelligence/admin/workspace",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(res.statusCode, 403);
});

test("user search with info_type filter", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/v1/intelligence/search?info_type=deadline&limit=20",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().items.every((x) => x.info_type === "deadline"));
});
