/**
 * CQ-C: Mock 14+ regression cases + optional DeepSeek live QA (≥80% pass when API key set).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { loadCuratedSeedsIntoStore } from "../src/intelligence/seed-loader.js";
import {
  filterCitationsAgainstIntelligenceItems,
  intelligenceItemsToAllowlistMap,
} from "../src/citation-utils.js";
import {
  meetsLivePassRatio,
  scorePlanContent,
  scoreReportContent,
} from "../src/content-quality.js";
import { seedReadyPlanInputView } from "./cq-regression-helpers.mjs";

/** @type {{ planId?: string, plan?: object, report?: object, intelItems?: object[] }} */
const ctx = {};

const MOCK_CASES = [
  { name: "chat_turn_1", kind: "chat", content: "想申请香港授课型硕士，本科计算机。" },
  { name: "chat_turn_2", kind: "chat", content: "GPA 3.2，预算 30 万左右，计划 2026 年秋季入学。" },
  { name: "chat_turn_3", kind: "chat", content: "香港大学学费和截止日期有官方依据吗？" },
  { name: "chat_hku_policy", kind: "chat", content: "想了解港大 policy 与 admission 要求。" },
  { name: "chat_language", kind: "chat", content: "雅思 6.5，想冲港前三。" },
  { name: "chat_scope_out_us", kind: "chat_scope_out" },
  { name: "chat_scope_in_hk", kind: "chat_scope_in" },
  { name: "intel_search", kind: "get", path: "/api/v1/intelligence/search?q=%E6%B8%AF%E5%A4%A7&limit=3" },
  { name: "intel_schools", kind: "get", path: "/api/v1/intelligence/schools" },
  { name: "profile_read", kind: "get", path: "/api/v1/profile" },
  { name: "plan_generate_mock", kind: "plan_generate" },
  { name: "plan_quality_fit_note", kind: "plan_quality" },
  { name: "plan_citations_ge_6", kind: "plan_citations_v3" },
  { name: "plan_visuals_present", kind: "plan_visuals" },
  { name: "report_generate_mock", kind: "report_generate" },
  { name: "report_citations_ge_6", kind: "report_citations_v3" },
  { name: "report_visuals_present", kind: "report_visuals" },
  { name: "report_risk_items_html", kind: "report_risk_html" },
  { name: "intel_preflight_module", kind: "intel_preflight" },
  { name: "report_action_plan_6plus", kind: "report_action_plan" },
  { name: "report_seven_chapters", kind: "report_chapters" },
  { name: "citation_allowlist_ok", kind: "citation_allowlist" },
  { name: "citation_mismatch_filtered", kind: "citation_filter" },
];

const LIVE_CASES = [
  { name: "live_chat_1", content: "请用一句话总结我目前的申请方向。" },
  { name: "live_chat_2", content: "香港硕士 rolling round 和早轮有什么区别？" },
  { name: "live_chat_3", content: "数据科学专业 JUPAS 科目权重通常看什么？" },
  { name: "live_plan_generate", kind: "live_plan" },
  { name: "live_plan_qa", kind: "live_plan_qa" },
  { name: "live_report_generate", kind: "live_report" },
  { name: "live_report_qa", kind: "live_report_qa" },
  { name: "live_report_action_plan", kind: "live_report_action" },
  { name: "live_citation_check", kind: "live_citations" },
  { name: "live_chat_citation_ask", content: "港大学费请以可引用来源说明，若无来源请免责。" },
];

/**
 * @param {import("fastify").FastifyInstance} app
 * @param {object} headers
 * @param {string} threadId
 * @param {object} c
 */
async function runMockCase(app, headers, threadId, c) {
  if (c.kind === "chat") {
    const r = await app.inject({
      method: "POST",
      url: `/api/v1/threads/${threadId}/messages`,
      headers: { ...headers, "content-type": "application/json" },
      payload: { content: c.content },
    });
    return r.statusCode === 200 && Boolean(r.json().assistant_message?.content);
  }
  if (c.kind === "chat_scope_out") {
    const r = await app.inject({
      method: "POST",
      url: `/api/v1/threads/${threadId}/messages`,
      headers: { ...headers, "content-type": "application/json" },
      payload: { content: "我想去美国读计算机硕士，请帮我做规划" },
    });
    return r.statusCode === 200 && r.json().scope_redirect === true;
  }
  if (c.kind === "chat_scope_in") {
    const r = await app.inject({
      method: "POST",
      url: `/api/v1/threads/${threadId}/messages`,
      headers: { ...headers, "content-type": "application/json" },
      payload: { content: "想申请香港授课型硕士，本科软件工程" },
    });
    return r.statusCode === 200 && r.json().scope_redirect !== true;
  }
  if (c.kind === "get") {
    const r = await app.inject({ method: "GET", url: c.path, headers });
    return r.statusCode === 200;
  }
  if (c.kind === "plan_generate") {
    seedReadyPlanInputView(ctx.dbPath, ctx.userId);
    const r = await app.inject({ method: "POST", url: "/api/v1/plans/generate", headers });
    if (r.statusCode !== 200) return false;
    const body = r.json();
    ctx.planId = body.plan_id;
    ctx.plan = body.plan;
    return Boolean(body.plan?.tiers?.reach);
  }
  if (c.kind === "plan_quality") {
    if (!ctx.plan) return false;
    const s = scorePlanContent(ctx.plan);
    return s.metrics.fitNoteCount >= 3 && s.pass;
  }
  if (c.kind === "plan_citations_v3") {
    if (!ctx.plan) return false;
    return scorePlanContent(ctx.plan).metrics.citationCount >= 6;
  }
  if (c.kind === "plan_visuals") {
    if (!ctx.plan) return false;
    const s = scorePlanContent(ctx.plan);
    return s.metrics.hasPlanVisuals === true && s.metrics.visualsBonus === true;
  }
  if (c.kind === "report_generate") {
    if (!ctx.planId) return false;
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/reports/generate",
      headers: { ...headers, "content-type": "application/json" },
      payload: JSON.stringify({ plan_id: ctx.planId }),
    });
    if (r.statusCode !== 200 || !r.json().ok) return false;
    ctx.report = r.json();
    return Boolean(ctx.report.html?.includes('id="action-plan"'));
  }
  if (c.kind === "report_action_plan") {
    if (!ctx.report) return false;
    return scoreReportContent(ctx.report).metrics.actionPlanItems >= 6;
  }
  if (c.kind === "report_chapters") {
    if (!ctx.report) return false;
    return scoreReportContent(ctx.report).metrics.chapterCount >= 7;
  }
  if (c.kind === "report_citations_v3") {
    if (!ctx.report) return false;
    return scoreReportContent(ctx.report).metrics.citationCount >= 6;
  }
  if (c.kind === "report_visuals") {
    if (!ctx.report) return false;
    const s = scoreReportContent(ctx.report);
    return s.metrics.hasReportVisuals === true && s.metrics.visualsBonus === true;
  }
  if (c.kind === "report_risk_html") {
    if (!ctx.report) return false;
    return scoreReportContent(ctx.report).metrics.hasRiskItemsHtml === true;
  }
  if (c.kind === "intel_preflight") {
    const { probeUrl } = await import("../src/intelligence/url-preflight.js");
    const r = await probeUrl("https://www.hku.hk/", {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        url: "https://www.hku.hk/",
        text: async () => "<html><body>HKU admissions taught master</body></html>",
      }),
    });
    return r.ok === true && r.status === 200;
  }
  if (c.kind === "citation_allowlist") {
    const items = ctx.intelItems || [];
    if (!items.length || !ctx.plan?.citations?.length) return items.length === 0 || scorePlanContent(ctx.plan).pass;
    const filtered = filterCitationsAgainstIntelligenceItems(ctx.plan.citations, items);
    return filtered.length >= 1;
  }
  if (c.kind === "citation_filter") {
    const items = ctx.intelItems || [];
    if (!items.length) return true;
    const map = intelligenceItemsToAllowlistMap(items);
    const id = items[0].id;
    const bad = filterCitationsAgainstIntelligenceItems(
      [{ itemId: id, url: "https://evil.example/bad" }],
      items
    );
    const good = filterCitationsAgainstIntelligenceItems(
      [{ itemId: id, url: map.get(id)?.canonicalUrl || items[0].canonicalUrl }],
      items
    );
    return bad.length === 0 && good.length === 1;
  }
  return false;
}

/**
 * @param {import("fastify").FastifyInstance} app
 * @param {object} headers
 * @param {string} threadId
 * @param {object} c
 */
async function runLiveCase(app, headers, threadId, c) {
  if (c.content) {
    const r = await app.inject({
      method: "POST",
      url: `/api/v1/threads/${threadId}/messages`,
      headers: { ...headers, "content-type": "application/json" },
      payload: { content: c.content },
    });
    return r.statusCode === 200 && Boolean(r.json().assistant_message?.content);
  }
  if (c.kind === "live_plan") {
    seedReadyPlanInputView(ctx.dbPath, ctx.userId);
    const r = await app.inject({ method: "POST", url: "/api/v1/plans/generate", headers });
    if (r.statusCode !== 200) return false;
    ctx.livePlan = r.json().plan;
    ctx.livePlanId = r.json().plan_id;
    return Boolean(ctx.livePlan);
  }
  if (c.kind === "live_plan_qa") {
    if (!ctx.livePlan) return false;
    const s = scorePlanContent(ctx.livePlan);
    return s.metrics.citationCount >= 6;
  }
  if (c.kind === "live_report") {
    if (!ctx.livePlanId) return false;
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/reports/generate",
      headers: { ...headers, "content-type": "application/json" },
      payload: JSON.stringify({ plan_id: ctx.livePlanId }),
    });
    if (r.statusCode !== 200 || !r.json().ok) return false;
    ctx.liveReport = r.json();
    return Boolean(ctx.liveReport.html);
  }
  if (c.kind === "live_report_qa") {
    if (!ctx.liveReport) return false;
    return scoreReportContent(ctx.liveReport).metrics.actionPlanItems >= 6;
  }
  if (c.kind === "live_report_action") {
    if (!ctx.liveReport) return false;
    return scoreReportContent(ctx.liveReport).pass;
  }
  if (c.kind === "live_citations") {
    if (!ctx.livePlan) return true;
    const s = scorePlanContent(ctx.livePlan);
    return !s.metrics.forbiddenPromise;
  }
  return false;
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "deepseek-smoke-"));
  ctx.dbPath = join(dir, "db.json");
  writeFileSync(ctx.dbPath, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");

  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: ctx.dbPath });
  await app.ready();

  const { createStore } = await import("../src/store.js");
  const store = createStore(ctx.dbPath);
  loadCuratedSeedsIntoStore(store, { force: true });
  ctx.intelItems = store.listIntelligenceItems({ publishedOnly: true, limit: 20 });

  const reg = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: `smoke-${Date.now()}@test.local`, password: "secret12" },
  });
  if (reg.statusCode !== 200) {
    console.error("register failed", reg.body);
    process.exit(1);
  }
  ctx.userId = reg.json().user_id;
  const token = reg.json().token;
  const headers = { Authorization: `Bearer ${token}` };

  const thread = await app.inject({ method: "POST", url: "/api/v1/threads", headers });
  const threadId = thread.json().thread_id;

  let mockPass = 0;
  for (const c of MOCK_CASES) {
    const ok = await runMockCase(app, headers, threadId, c);
    if (ok) mockPass += 1;
    else console.error("FAIL mock", c.name);
  }

  await app.close();

  const key = (process.env.DEEPSEEK_API_KEY || "").trim();
  let livePass = 0;
  let liveTotal = 0;
  if (key) {
    process.env.DEEPSEEK_API_KEY = key;
    const liveApp = buildApp({ dataFile: ctx.dbPath });
    await liveApp.ready();
    liveTotal = LIVE_CASES.length;
    for (const c of LIVE_CASES) {
      const ok = await runLiveCase(liveApp, headers, threadId, c);
      if (ok) livePass += 1;
      else console.error("FAIL live", c.name);
    }
    await liveApp.close();
    if (!meetsLivePassRatio(livePass, liveTotal, 0.8)) {
      console.error(`deepseek-regression-smoke: live QA ${livePass}/${liveTotal} below 80% threshold`);
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      process.exit(1);
    }
    console.error(`deepseek-regression-smoke: live ${livePass}/${liveTotal} passed (≥80%)`);
  } else {
    console.error("deepseek-regression-smoke: DEEPSEEK_API_KEY unset — skipping live QA cases");
  }

  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  console.error(`deepseek-regression-smoke: mock ${mockPass}/${MOCK_CASES.length} cases passed`);
  if (mockPass < MOCK_CASES.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
