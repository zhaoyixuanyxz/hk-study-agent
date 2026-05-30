import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { loadPromptText } from "../src/promptLayer.js";
import { buildMockStructuredPlan, normalizePlanResult } from "../src/planning-service.js";
import {
  buildDeliverySectionsHtml,
  buildMockHtmlReport,
  normalizeReportDelivery,
} from "../src/report-service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

const readyPiv = {
  goals: { value: { target_region: "香港", field: "数据科学", intent_degree: "授课型硕士" } },
  academic: { value: { gpa: "3.2", school_background: "内地一本" } },
  budget: { value: { budget_range: "30 万/年" } },
  timeline: { value: { intake_or_season: "2026 秋季" } },
  riskPreference: { value: { risk_style: "均衡" } },
  readiness: { ready: true, missingRequired: [] },
};

test("CQ-A normalizePlanResult preserves fit_note on tiers", () => {
  const p = normalizePlanResult({
    tiers: {
      reach: { summary: "a", rationale: "b", fit_note: "Math M1 权重高" },
      match: { summary: "a", rationale: "b", fit_note: "GPA 接近中位" },
      safety: { summary: "a", rationale: "b" },
    },
    risk_summary: "r",
    budget_suggestion: "bu",
    timeline_suggestion: "ti",
    timeline_urgency: "tight",
  });
  assert.ok(p);
  assert.equal(p.tiers.reach.fit_note, "Math M1 权重高");
  assert.equal(p.tiers.match.fit_note, "GPA 接近中位");
  assert.equal(p.tiers.safety.fit_note, undefined);
  assert.equal(p.timeline_urgency, "tight");
});

test("CQ-A normalizePlanResult omits empty fit_note", () => {
  const p = normalizePlanResult({
    tiers: {
      reach: { summary: "a", rationale: "b", fit_note: "  " },
      match: { summary: "a", rationale: "b" },
      safety: { summary: "a", rationale: "b" },
    },
    risk_summary: "r",
    budget_suggestion: "bu",
    timeline_suggestion: "ti",
  });
  assert.ok(p);
  assert.equal(p.tiers.reach.fit_note, undefined);
});

test("CQ-A buildMockStructuredPlan includes fit_note on all tiers", () => {
  const plan = buildMockStructuredPlan(readyPiv, []);
  for (const key of ["reach", "match", "safety"]) {
    assert.ok(plan.tiers[key].fit_note, `tier ${key} should have fit_note`);
    assert.match(plan.tiers[key].fit_note, /程序匹配度|JUPAS|历史趋势|rolling/i);
  }
  assert.equal(plan.timeline_urgency, "normal");
});

test("CQ-A buildMockStructuredPlan has at least 6 citations (V3-KB)", () => {
  const plan = buildMockStructuredPlan(readyPiv, []);
  assert.ok(plan.citations.length >= 6, `citations=${plan.citations.length}`);
});

test("CQ-A loadPromptText loads plan.txt and report.txt", () => {
  const plan = loadPromptText("plan.txt");
  const report = loadPromptText("report.txt");
  assert.ok(plan.includes("JUPAS"));
  assert.ok(plan.includes("fit_note"));
  assert.ok(report.includes("action_plan"));
  assert.ok(report.includes("parent_summary"));
});

test("CQ-A normalizeReportDelivery parses action_plan and risk_items", () => {
  const d = normalizeReportDelivery({
    parent_summary: ["结论：主申香港。", "预算：30 万区间。"],
    action_plan: {
      days_30: ["核对成绩单"],
      days_60: ["完成语言考试"],
      days_90: ["提交网申"],
    },
    risk_items: [
      { level: "high", label: "截止前卡点", detail: "rolling 名额有限" },
      { level: "invalid", label: "skip" },
      { level: "medium", label: "语言节点" },
    ],
    plain_language_notes: ["冲刺 → 录取把握较低的主攻组合"],
  });
  assert.ok(d);
  assert.equal(d.parent_summary.length, 2);
  assert.equal(d.action_plan.days_30[0], "核对成绩单");
  assert.equal(d.action_plan.days_60[0], "完成语言考试");
  assert.equal(d.action_plan.days_90[0], "提交网申");
  assert.equal(d.risk_items.length, 2);
  assert.equal(d.risk_items[0].level, "high");
  assert.equal(d.plain_language_notes.length, 1);
});

test("CQ-A buildMockHtmlReport delivery block has 30/60/90 action items", () => {
  const plan = buildMockStructuredPlan(readyPiv, []);
  const report = buildMockHtmlReport({ summary: "测试申请人" }, plan);
  assert.ok(report.html.includes('id="action-plan"'));
  assert.ok(report.html.includes("未来 30 天"));
  assert.ok(report.html.includes("第 31–60 天"));
  assert.ok(report.html.includes("第 61–90 天"));
  assert.match(report.html, /【核对|Checklist|时间线|语言/i);
  assert.ok(report.wordCount > 200);
});

test("CQ-A buildDeliverySectionsHtml renders report-risk-items when risk_items present", () => {
  const html = buildDeliverySectionsHtml(
    {
      parent_summary: ["p"],
      action_plan: { days_30: ["a"], days_60: ["b"], days_90: ["c"] },
      risk_items: [{ level: "high", label: "截止" }],
    },
    []
  );
  assert.match(html, /id="report-risk-items"/);
});

test("CQ-A buildDeliverySectionsHtml uses normalized delivery fields", () => {
  const html = buildDeliverySectionsHtml(
    {
      parent_summary: ["家长摘要一条"],
      action_plan: { days_30: ["步骤 A"], days_60: [], days_90: [] },
    },
    [{ itemId: "x1", url: "https://example.com/a", sourceTitle: "官方" }]
  );
  assert.ok(html.includes("家长决策摘要"));
  assert.ok(html.includes("步骤 A"));
  assert.ok(html.includes("https://example.com/a"));
});

test("CQ-A schema files exist and define fit_note / action_plan", () => {
  const planSchemaPath = join(repoRoot, "docs", "schemas", "plan-result.schema.json");
  const deliverySchemaPath = join(repoRoot, "docs", "schemas", "report-delivery.schema.json");
  assert.ok(existsSync(planSchemaPath));
  assert.ok(existsSync(deliverySchemaPath));
  const planSchema = JSON.parse(readFileSync(planSchemaPath, "utf8"));
  const deliverySchema = JSON.parse(readFileSync(deliverySchemaPath, "utf8"));
  assert.ok(planSchema.$defs.tier.properties.fit_note);
  assert.ok(planSchema.properties.timeline_urgency);
  assert.ok(deliverySchema.properties.action_plan.properties.days_30);
  assert.ok(deliverySchema.properties.risk_items);
});
