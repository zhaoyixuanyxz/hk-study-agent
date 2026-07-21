import assert from "node:assert";
import { test } from "node:test";

import { buildMockStructuredPlan, normalizePlanResult } from "../src/planning-service.js";
import {
  buildDeliverySectionsHtml,
  buildMockHtmlReport,
  buildRiskItemsSectionHtml,
  normalizeReportDelivery,
} from "../src/report-service.js";
import {
  buildMockPlanVisuals,
  buildMockReportVisuals,
  normalizePlanVisuals,
  normalizeReportVisuals,
} from "../src/visuals-normalize.js";
import { scorePlanContent, scoreReportContent } from "../src/content-quality.js";

const readyPiv = {
  goals: { value: { target_region: "香港", field: "数据科学" } },
  academic: { value: { gpa: "3.3", school_background: "211" } },
  budget: { value: { budget_range: "30 万" } },
  timeline: { value: { intake_or_season: "2026 秋" } },
  riskPreference: { value: { risk_style: "均衡" } },
  readiness: { ready: true, missingRequired: [] },
};

test("V3-VIS normalizePlanVisuals round-trip", () => {
  const raw = buildMockPlanVisuals(readyPiv, { timeline_urgency: "tight" });
  const norm = normalizePlanVisuals(raw);
  assert.ok(norm?.tierComparison?.scores?.length === 3);
  assert.ok(norm?.timelineMilestones?.length >= 2);
});

test("V3-VIS normalizePlanVisuals rescales raw GPA bar to /4 percent index", () => {
  const norm = normalizePlanVisuals({
    benchmarkBars: [
      { label: "GPA相对位置 (/4.0)", value: 3, max: 100 },
      { label: "申请材料完整度预估", value: 70, max: 100 },
      { label: "GPA 相对位置", value: 75, max: 100 },
    ],
  });
  assert.equal(norm?.benchmarkBars?.[0]?.value, 75);
  assert.equal(norm?.benchmarkBars?.[1]?.value, 70);
  assert.equal(norm?.benchmarkBars?.[2]?.value, 75);
});

test("V3-VIS buildMockStructuredPlan includes visuals", () => {
  const plan = buildMockStructuredPlan(readyPiv, []);
  assert.ok(plan.visuals?.tierComparison);
  assert.ok(plan.visuals?.timelineMilestones?.length);
});

test("V3-VIS normalizePlanResult preserves visuals", () => {
  const plan = buildMockStructuredPlan(readyPiv, []);
  const norm = normalizePlanResult(plan);
  assert.ok(norm?.visuals?.tierComparison);
});

test("V3-VIS buildRiskItemsSectionHtml renders server block", () => {
  const html = buildRiskItemsSectionHtml([
    { level: "high", label: "截止风险", detail: "材料未齐" },
  ]);
  assert.match(html, /id="report-risk-items"/);
  assert.match(html, /data-risk-level="high"/);
  assert.match(html, /截止风险/);
});

test("V3-VIS buildDeliverySectionsHtml includes risk_items section", () => {
  const html = buildDeliverySectionsHtml(
    {
      parent_summary: ["结论"],
      action_plan: { days_30: ["a"], days_60: ["b"], days_90: ["c"] },
      risk_items: [{ level: "medium", label: "语言节点" }],
    },
    []
  );
  assert.match(html, /report-risk-items/);
});

test("V3-VIS mock report has visuals and risk_items in html", () => {
  const plan = buildMockStructuredPlan(readyPiv, []);
  const report = buildMockHtmlReport({ summary: "测试" }, plan);
  assert.ok(report.visuals?.riskMatrix || report.visuals?.budgetBands);
  assert.match(report.html, /report-risk-items/);
  assert.match(report.html, /report-visuals-data/);
  const planScore = scorePlanContent(plan);
  const repScore = scoreReportContent({
    html: report.html,
    citation_count: report.citations?.length || 0,
  });
  assert.equal(planScore.pass, true);
  assert.equal(repScore.pass, true);
  assert.equal(planScore.metrics.visualsBonus, true);
  assert.equal(repScore.metrics.visualsBonus, true);
});

test("V3-VIS normalizeReportVisuals rejects admission percent in labels", () => {
  const norm = normalizeReportVisuals(buildMockReportVisuals());
  assert.ok(norm?.budgetBands?.length >= 2);
  const delivery = normalizeReportDelivery({
    risk_items: [{ level: "low", label: "x" }],
    visuals: norm,
  });
  assert.ok(delivery?.visuals);
});
