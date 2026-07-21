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

test("POST /profile/full-reset with confirm:true and locale=en returns locale=en", async () => {
  const app = await boot();
  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  await app.inject({
    method: "POST",
    url: "/api/v1/threads",
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ locale: "zh" }),
  });
  const r = await app.inject({
    method: "POST",
    url: "/api/v1/profile/full-reset",
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ confirm: true, locale: "en" }),
  });
  assert.equal(r.statusCode, 200, r.body);
  const body = JSON.parse(r.body);
  assert.equal(body.ok, true);
  assert.equal(body.locale, "en");
  assert.ok(body.thread_id, "thread_id should be returned");
});

import { composeSystemPrompt } from "../src/promptLayer.js";
import { runProfileAgent } from "../src/agent.js";
import { buildMockStructuredPlan } from "../src/planning-service.js";

test("composeSystemPrompt appends OUTPUT_LOCALE for en", () => {
  const s = composeSystemPrompt("v1", { locale: "en" });
  assert.match(s, /\[OUTPUT_LOCALE\]/);
  assert.match(s, /locale=en/);
});

test("composeSystemPrompt defaults to zh locale block when no opts", () => {
  const s = composeSystemPrompt("v1");
  assert.match(s, /\[OUTPUT_LOCALE\]/);
  assert.match(s, /locale=zh/);
});

test("mock agent reply is English when locale=en", async () => {
  const out = await runProfileAgent({
    userMessage: "I want HK taught masters in CS",
    historyOpenai: [],
    useMock: true,
    locale: "en",
  });
  assert.match(out.reply, /[A-Za-z]{3,}/);
  assert.doesNotMatch(out.reply, /判断：|下一步：/);
});

test("mock agent reply is Chinese when locale=zh (default)", async () => {
  const out = await runProfileAgent({
    userMessage: "我想申请香港授课型硕士",
    historyOpenai: [],
    useMock: true,
  });
  assert.match(out.reply, /判断|下一步|信息/);
});

test("mock plan uses English labels when locale=en", () => {
  const plan = buildMockStructuredPlan({}, [], [], { locale: "en" });
  assert.equal(plan.tiers.reach.label, "Reach");
  assert.equal(plan.tiers.match.label, "Match");
  assert.equal(plan.tiers.safety.label, "Safety");
  assert.match(plan.risk_summary, /[A-Za-z]{4,}/);
  assert.doesNotMatch(plan.tiers.reach.label, /冲刺/);
});

test("mock plan uses Chinese labels by default", () => {
  const plan = buildMockStructuredPlan({}, [], []);
  assert.equal(plan.tiers.reach.label, "冲刺");
  assert.equal(plan.tiers.match.label, "匹配");
  assert.equal(plan.tiers.safety.label, "保底");
});
