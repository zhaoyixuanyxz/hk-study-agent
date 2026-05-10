import assert from "node:assert";
import { writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildApp } from "../src/app.js";
import { normalizeAgentOutput, parseJson } from "../src/agent.js";

function headers(token) {
  return { authorization: `Bearer ${token}` };
}

test("V1-P1 normalizeAgentOutput caps reply and followups, filters citations", () => {
  const o = normalizeAgentOutput({
    reply: "x".repeat(2500),
    gaps: ["预算"],
    gap_items: [],
    suggested_followups: ["a", "b", "c"],
    citations: [
      { itemId: "1", url: "not-a-url" },
      { itemId: "2", url: "https://example.com/policy" },
    ],
    readiness_for_profile: true,
  });
  assert.ok(o.reply.length <= 1100);
  assert.equal(o.suggested_followups.length, 2);
  assert.equal(o.citations.length, 1);
  assert.ok(o.citations[0].url.startsWith("https://example.com/policy"));
  assert.ok(Array.isArray(o.gap_items));
  assert.ok(o.gap_items.length >= 1);
});

test("V1-P1 normalizeAgentOutput accepts answer alias when reply missing", () => {
  const o = normalizeAgentOutput({
    answer: "hello from alias",
    gaps: [],
    gap_items: [],
    suggested_followups: [],
    citations: [],
    readiness_for_profile: false,
  });
  assert.equal(o.reply, "hello from alias");
});

test("V1-P1 normalizeAgentOutput keeps friendly fallback when no reply-like fields", () => {
  const o = normalizeAgentOutput({
    gaps: [],
    gap_items: [],
    suggested_followups: [],
    citations: [],
    readiness_for_profile: false,
  });
  assert.ok(o.reply.length > 10);
  assert.ok(/重试|可读正文/.test(o.reply));
});

test("V1-P1 parseJson prefers fenced JSON after prose (no raw fence in reply)", () => {
  const raw = `可先读这段说明。\n\n\`\`\`json
{
  "reply": "主回复仅这段",
  "gaps": ["语言成绩"],
  "gap_items": [],
  "suggested_followups": [],
  "readiness_for_profile": false,
  "citations": []
}
\`\`\`
`;
  const p = parseJson(raw);
  assert.equal(p.reply, "主回复仅这段");
  assert.equal(p.gaps[0], "语言成绩");
  const o = normalizeAgentOutput(p);
  assert.ok(!o.reply.includes("```"));
  assert.ok(!o.reply.includes('"reply"'));
});

test("V1-P1 normalizeAgentOutput strips leaked json fence inside reply string", () => {
  const o = normalizeAgentOutput({
    reply: '用户可见\n\n```json\n{"reply":"不应出现"}\n```',
    gaps: [],
    gap_items: [],
    suggested_followups: [],
    citations: [],
    readiness_for_profile: false,
  });
  assert.equal(o.reply.trim(), "用户可见");
  assert.ok(!o.reply.includes("```"));
});

test("V1-P1 parseJson balanced extract when no fences", () => {
  const raw = '前缀\n{"reply":"括号扫描","gaps":[],"gap_items":[],"suggested_followups":[],"readiness_for_profile":false,"citations":[]} 后缀';
  const p = parseJson(raw);
  assert.equal(p.reply, "括号扫描");
});

test("V1-P1 POST message returns profile_progress report_readiness gap_items citations", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-p1-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const { thread_id } = JSON.parse(
    (await app.inject({ method: "POST", url: "/api/v1/threads", headers: headers(token) })).body
  );

  const r = await app.inject({
    method: "POST",
    url: `/api/v1/threads/${thread_id}/messages`,
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ content: "本科 211 计算机，想申香港硕士，均分 82。" }),
  });
  assert.equal(r.statusCode, 200, r.body);
  const body = JSON.parse(r.body);
  assert.ok(body.profile_progress && body.profile_progress.dimensions);
  assert.equal(typeof body.profile_progress.summary_pct, "number");
  assert.ok(body.report_readiness && typeof body.report_readiness.ok === "boolean");
  assert.ok(Array.isArray(body.report_readiness.reasons));
  assert.ok(Array.isArray(body.report_readiness.next_steps));
  assert.ok(Array.isArray(body.gap_items));
  assert.ok(Array.isArray(body.citations));
  assert.ok((body.suggested_followups || []).length <= 2);

  const thread = JSON.parse(
    (await app.inject({ method: "GET", url: `/api/v1/threads/${thread_id}`, headers: headers(token) })).body
  );
  const lastAi = [...(thread.messages || [])].reverse().find((m) => m.role === "assistant");
  assert.ok(lastAi?.meta?.profile_progress);
  assert.ok(lastAi?.meta?.gap_items);
});

test("V1-P1 POST replace edits last user and removes prior assistant from thread", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-p1-replace-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const { thread_id } = JSON.parse(
    (await app.inject({ method: "POST", url: "/api/v1/threads", headers: headers(token) })).body
  );

  const r1 = await app.inject({
    method: "POST",
    url: `/api/v1/threads/${thread_id}/messages`,
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ content: "typooo 本科专业计算机" }),
  });
  assert.equal(r1.statusCode, 200, r1.body);
  const uid = JSON.parse(r1.body).user_message?.id;

  const r2 = await app.inject({
    method: "POST",
    url: `/api/v1/threads/${thread_id}/messages`,
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({
      content: "本科专业计算机，意向香港授课型硕士",
      replace_user_message_id: uid,
    }),
  });
  assert.equal(r2.statusCode, 200, r2.body);
  const j2 = JSON.parse(r2.body);
  assert.equal(j2.replacement_edit, true);

  const thread = JSON.parse(
    (await app.inject({ method: "GET", url: `/api/v1/threads/${thread_id}`, headers: headers(token) })).body
  );
  const msgs = thread.messages || [];
  assert.equal(msgs.length, 2, "should stay one user + one assistant pair");
  assert.equal(msgs[0].role, "user");
  assert.ok(String(msgs[0].content).includes("本科专业计算机"));
  assert.ok(!String(msgs[0].content).includes("typooo"));
  assert.equal(msgs[1].role, "assistant");
});

test("V1-P1 POST replace rejects when message is not tail user bubble", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-p1-replace2-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  const { thread_id } = JSON.parse(
    (await app.inject({ method: "POST", url: "/api/v1/threads", headers: headers(token) })).body
  );

  const first = await app.inject({
    method: "POST",
    url: `/api/v1/threads/${thread_id}/messages`,
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ content: "第一轮：背景简述" }),
  });
  const firstUserId = JSON.parse(first.body).user_message?.id;

  await app.inject({
    method: "POST",
    url: `/api/v1/threads/${thread_id}/messages`,
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ content: "第二轮：补充雅思 6.5" }),
  });

  const bad = await app.inject({
    method: "POST",
    url: `/api/v1/threads/${thread_id}/messages`,
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({
      content: "改第一轮",
      replace_user_message_id: firstUserId,
    }),
  });
  assert.equal(bad.statusCode, 400, bad.body);
  const j = JSON.parse(bad.body);
  assert.equal(j.code, "not_last_user_turn");
});
