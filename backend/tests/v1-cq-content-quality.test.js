import assert from "node:assert";
import { test } from "node:test";
import {
  containsForbiddenPromise,
  countActionPlanItemsFromHtml,
  meetsLivePassRatio,
  scorePlanContent,
  scoreReportContent,
  passesCombinedQaThreshold,
} from "../src/content-quality.js";
import { buildMockStructuredPlan } from "../src/planning-service.js";
import { buildMockHtmlReport } from "../src/report-service.js";

const readyPiv = {
  goals: { value: { target_region: "香港", field: "数据科学" } },
  academic: { value: { gpa: "3.2", school_background: "内地一本" } },
  budget: { value: { budget_range: "30 万" } },
  timeline: { value: { intake_or_season: "2026 秋" } },
  riskPreference: { value: { risk_style: "均衡" } },
  readiness: { ready: true, missingRequired: [] },
};

test("CQ-C containsForbiddenPromise detects admission promises", () => {
  assert.equal(containsForbiddenPromise("一定录取"), true);
  assert.equal(containsForbiddenPromise("仅供参考，不构成录取承诺"), false);
});

test("CQ-C scorePlanContent passes mock plan with fit_note and disclaimer", () => {
  const plan = buildMockStructuredPlan(readyPiv, []);
  const s = scorePlanContent(plan);
  assert.ok(s.metrics.fitNoteCount >= 3);
  assert.equal(s.metrics.forbiddenPromise, false);
  assert.equal(s.pass, true);
});

test("CQ-C scorePlanContent fails on forbidden promise", () => {
  const plan = buildMockStructuredPlan(readyPiv, []);
  plan.risk_summary = "我们保证录取港前三";
  const s = scorePlanContent(plan);
  assert.equal(s.pass, false);
  assert.ok(s.issues.includes("forbidden_admission_promise"));
});

test("CQ-C scoreReportContent passes mock report action_plan >= 6", () => {
  const plan = buildMockStructuredPlan(readyPiv, []);
  const report = buildMockHtmlReport({ summary: "测试" }, plan);
  const s = scoreReportContent({ html: report.html, citation_count: report.citations?.length || 0 });
  assert.ok(s.metrics.actionPlanItems >= 6);
  assert.ok(s.metrics.chapterCount >= 7);
  assert.equal(s.pass, true);
});

test("CQ-C countActionPlanItemsFromHtml counts li in action-plan section", () => {
  const html = `<section id="action-plan"><ol><li>A</li><li>B</li><li>C</li><li>D</li><li>E</li><li>F</li></ol></section>`;
  assert.equal(countActionPlanItemsFromHtml(html), 6);
});

test("CQ-C meetsLivePassRatio enforces 80% threshold", () => {
  assert.equal(meetsLivePassRatio(8, 10, 0.8), true);
  assert.equal(meetsLivePassRatio(7, 10, 0.8), false);
});

test("CQ-C passesCombinedQaThreshold requires both plan and report", () => {
  const structured = buildMockStructuredPlan(readyPiv, []);
  const planScore = scorePlanContent(structured);
  const rep = scoreReportContent({
    html: buildMockHtmlReport({ summary: "x" }, structured).html,
    citation_count: structured.citations?.length || 0,
  });
  assert.equal(passesCombinedQaThreshold(planScore, rep), true);
});
