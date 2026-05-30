import { describe, it } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import {
  assessChatScope,
  buildScopeRedirectAgentOutput,
  sanitizeExtractionForHkMaster,
} from "../src/chat-scope.js";
import { normalizeAgentOutput } from "../src/agent.js";
import { runProfileExtraction } from "../src/extraction.js";

const OUT_OF_SCOPE = [
  ["美国硕士", "我想去美国读计算机硕士，GPA 3.5"],
  ["英国留学", "计划申请英国伦敦大学硕士项目"],
  ["加拿大", "想去加拿大读研，有推荐学校吗"],
  ["新加坡", "新加坡国立大学硕士怎么申请"],
  ["PhD", "我想申请香港大学的 PhD 博士项目"],
  ["博士", "毕业后想读博，有导师推荐吗"],
  ["副学士", "我是副学士毕业，想升读学士"],
  ["exclude_hk", "我不考虑香港学校了，只看澳洲"],
  ["US only", "USA masters application for CS"],
  ["UK masters", "UK taught programme in finance"],
  ["研究型硕士", "想申请港科大研究型硕士 MPhil"],
  ["本科only", "只想申请香港本科 JUPAS，不要硕士"],
];

const IN_SCOPE = [
  ["hk_master", "想申请香港授课型硕士，本科计算机"],
  ["hku", "目标港大 CS 授课硕士，雅思 6.5"],
  ["hkust", "港科大商科 master 申请季 2026 fall"],
  ["general", "GPA 3.2，预算 30 万，计划 2026 年秋季入学香港"],
  ["greeting", "你好，想咨询留学"],
  ["hk_policy", "香港大学学费和截止日期有官方依据吗"],
  ["taught", "授课型硕士选校怎么梯度"],
  ["hk_multi", "香港城市大学与理工的 deadline 对比"],
];

describe("assessChatScope out-of-scope", () => {
  for (const [id, msg] of OUT_OF_SCOPE) {
    it(`rejects: ${id}`, () => {
      const r = assessChatScope({ userMessage: msg, snapshot: null });
      assert.equal(r.inScope, false, msg);
      assert.ok(r.reason);
      assert.ok(r.redirectReply?.includes("授课型硕士") || r.redirectHint?.includes("授课型硕士"));
    });
  }
});

describe("assessChatScope in-scope", () => {
  for (const [id, msg] of IN_SCOPE) {
    it(`allows: ${id}`, () => {
      const r = assessChatScope({ userMessage: msg, snapshot: null });
      assert.equal(r.inScope, true, msg);
    });
  }
});

describe("buildScopeRedirectAgentOutput", () => {
  it("sets scope_redirect on normalize", () => {
    const raw = buildScopeRedirectAgentOutput({
      redirectReply: "仅支持香港授课型硕士。",
      suggestedGaps: ["目标港校"],
    });
    const o = normalizeAgentOutput(raw);
    assert.equal(o.scope_redirect, true);
    assert.ok(o.reply.includes("香港"));
    assert.ok(o.gaps.length >= 1);
  });
});

describe("sanitizeExtractionForHkMaster", () => {
  it("removes non-HK target_region", () => {
    const out = sanitizeExtractionForHkMaster({
      confirmed: [
        { key: "target_region", value: "美国" },
        { key: "target_region", value: "香港" },
        { key: "field", value: "CS" },
      ],
      candidate: [{ key: "target_region", value: "英国" }],
      preference: [],
      insights: [],
      summary_delta: "",
    });
    assert.equal(out.confirmed.filter((x) => x.key === "target_region").length, 1);
    assert.equal(out.confirmed.find((x) => x.key === "target_region").value, "香港");
    assert.equal(out.candidate.length, 0);
  });
});

describe("runProfileExtraction skips out-of-scope mock", () => {
  it("returns empty extraction for US PhD message", async () => {
    const ex = await runProfileExtraction({
      userMessage: "我想去美国读 PhD",
      assistantReply: "超出范围",
      useMock: true,
    });
    assert.equal(ex.confirmed.length, 0);
    const regions = [...ex.confirmed, ...ex.candidate].filter((x) => x.key === "target_region");
    assert.equal(regions.length, 0);
  });
});

describe("POST /messages scope_redirect integration", () => {
  it("US masters request returns scope_redirect and does not set US region", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chat-scope-api-"));
    const dbPath = join(dir, "db.json");
    writeFileSync(dbPath, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
    process.env.DEEPSEEK_API_KEY = "";
    const app = buildApp({ dataFile: dbPath });
    await app.ready();

    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: `scope-${Date.now()}@test.local`, password: "secret12" },
    });
    const token = reg.json().token;
    const headers = { authorization: `Bearer ${token}` };

    const thread = await app.inject({
      method: "POST",
      url: "/api/v1/threads",
      headers: { ...headers, "content-type": "application/json" },
      payload: { title: "scope test" },
    });
    const threadId = thread.json().thread_id;

    const r = await app.inject({
      method: "POST",
      url: `/api/v1/threads/${threadId}/messages`,
      headers: { ...headers, "content-type": "application/json" },
      payload: { content: "我想去美国读计算机硕士，请帮我规划" },
    });
    assert.equal(r.statusCode, 200);
    const body = r.json();
    assert.equal(body.scope_redirect, true);
    assert.ok(body.assistant_message?.content?.includes("授课型硕士"));

    const { createStore } = await import("../src/store.js");
    const store = createStore(dbPath);
    const mems = store.listMemoriesByUser(reg.json().user_id);
    const regionMem = mems.find((m) => m.key === "target_region");
    if (regionMem) {
      assert.ok(!/美国|usa|英国/i.test(String(regionMem.value)));
    }

    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("HK master message does not scope_redirect", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chat-scope-api2-"));
    const dbPath = join(dir, "db.json");
    writeFileSync(dbPath, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
    process.env.DEEPSEEK_API_KEY = "";
    const app = buildApp({ dataFile: dbPath });
    await app.ready();

    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: `scope2-${Date.now()}@test.local`, password: "secret12" },
    });
    const token = reg.json().token;
    const headers = { authorization: `Bearer ${token}` };

    const thread = await app.inject({
      method: "POST",
      url: "/api/v1/threads",
      headers: { ...headers, "content-type": "application/json" },
      payload: {},
    });
    const threadId = thread.json().thread_id;

    const r = await app.inject({
      method: "POST",
      url: `/api/v1/threads/${threadId}/messages`,
      headers: { ...headers, "content-type": "application/json" },
      payload: { content: "想申请香港授课型硕士，本科计算机" },
    });
    assert.equal(r.statusCode, 200);
    assert.notEqual(r.json().scope_redirect, true);

    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
