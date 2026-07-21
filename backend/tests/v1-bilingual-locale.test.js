import assert from "node:assert";
import { test } from "node:test";
import {
  normalizeLocale,
  buildOutputLocaleBlock,
  resolveThreadLocale,
} from "../src/output-locale.js";

test("normalizeLocale accepts zh/en and defaults unknown to zh", () => {
  assert.equal(normalizeLocale("en"), "en");
  assert.equal(normalizeLocale("zh"), "zh");
  assert.equal(normalizeLocale("EN"), "en");
  assert.equal(normalizeLocale(undefined), "zh");
  assert.equal(normalizeLocale("fr"), "zh");
});

test("buildOutputLocaleBlock en mentions English and JSON user-facing fields", () => {
  const block = buildOutputLocaleBlock("en");
  assert.match(block, /\[OUTPUT_LOCALE\]/);
  assert.match(block, /locale=en/);
  assert.match(block, /English/i);
  assert.match(block, /plain_language_notes/);
});

test("buildOutputLocaleBlock zh asks for Simplified Chinese", () => {
  const block = buildOutputLocaleBlock("zh");
  assert.match(block, /locale=zh/);
  assert.match(block, /简体中文/);
});

test("resolveThreadLocale falls back to zh when missing", () => {
  assert.equal(resolveThreadLocale(null), "zh");
  assert.equal(resolveThreadLocale({}), "zh");
  assert.equal(resolveThreadLocale({ locale: "en" }), "en");
});

import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";

function headers(token) {
  return { authorization: `Bearer ${token}` };
}

async function boot() {
  const dir = mkdtempSync(join(tmpdir(), "sa-locale-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  return buildApp({ dataFile: db });
}

test("POST /threads accepts locale=en and GET returns it", async () => {
  const app = await boot();
  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  let r = await app.inject({
    method: "POST",
    url: "/api/v1/threads",
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ locale: "en" }),
  });
  assert.equal(r.statusCode, 200, r.body);
  const created = JSON.parse(r.body);
  assert.equal(created.locale, "en");
  r = await app.inject({
    method: "GET",
    url: `/api/v1/threads/${created.thread_id}`,
    headers: headers(token),
  });
  assert.equal(r.statusCode, 200);
  assert.equal(JSON.parse(r.body).locale, "en");
});

test("POST /threads defaults locale to zh", async () => {
  const app = await boot();
  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const r = await app.inject({ method: "POST", url: "/api/v1/threads", headers: headers(token) });
  assert.equal(JSON.parse(r.body).locale, "zh");
});

test("PATCH cannot change locale (409)", async () => {
  const app = await boot();
  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const { thread_id } = JSON.parse(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/threads",
        headers: { ...headers(token), "content-type": "application/json" },
        payload: JSON.stringify({ locale: "zh" }),
      })
    ).body
  );
  const r = await app.inject({
    method: "PATCH",
    url: `/api/v1/threads/${thread_id}`,
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ locale: "en" }),
  });
  assert.equal(r.statusCode, 409);
  assert.equal(JSON.parse(r.body).code, "locale_locked");
});

test("history lists locale", async () => {
  const app = await boot();
  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  await app.inject({
    method: "POST",
    url: "/api/v1/threads",
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ locale: "en" }),
  });
  const r = await app.inject({ method: "GET", url: "/api/v1/history", headers: headers(token) });
  assert.equal(r.statusCode, 200);
  const body = JSON.parse(r.body);
  assert.equal(body.threads[0].locale, "en");
});
