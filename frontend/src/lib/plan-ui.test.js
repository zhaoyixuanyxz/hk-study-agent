import test from "node:test";
import assert from "node:assert/strict";
import { setUiLocale } from "../i18n/index.js";
import {
  buildPlanExecutionActions,
  renderPlanExecutionPathHtml,
  renderTierFitNoteHtml,
  renderTimelineUrgencyBarHtml,
  renderPlanCitationListHtml,
} from "./plan-ui.js";

test("renderTierFitNoteHtml outputs program fit block", () => {
  setUiLocale("zh");
  const html = renderTierFitNoteHtml("Math M1 权重较高");
  assert.match(html, /程序匹配度/);
  assert.match(html, /Math M1/);
  assert.equal(renderTierFitNoteHtml(""), "");
});

test("renderTierFitNoteHtml is English when UI is en", () => {
  setUiLocale("en");
  const html = renderTierFitNoteHtml("GPA reduces competitiveness");
  assert.match(html, /Program fit/i);
  assert.doesNotMatch(html, /程序匹配度/);
  setUiLocale("zh");
});

test("renderTimelineUrgencyBarHtml renders bar for tight urgency", () => {
  setUiLocale("zh");
  const html = renderTimelineUrgencyBarHtml("tight");
  assert.match(html, /urgency-bar--tight/);
  assert.match(html, /偏紧/);
  assert.equal(renderTimelineUrgencyBarHtml("unknown"), "");
});

test("buildPlanExecutionActions returns up to 5 actions from plan", () => {
  setUiLocale("zh");
  const actions = buildPlanExecutionActions({
    timeline_urgency: "tight",
    timeline_suggestion: "2026 秋季入学",
    budget_suggestion: "30 万",
    tiers: {
      match: { summary: "主申港校 CS", fit_note: "GPA 接近中位" },
      reach: {},
    },
    citations: [{ itemId: "x1", url: "https://example.com" }],
  });
  assert.ok(actions.length >= 3);
  assert.ok(actions.length <= 5);
  assert.ok(actions.some((a) => /截止|倒排/.test(a)));
});

test("buildPlanExecutionActions is English when UI is en", () => {
  setUiLocale("en");
  const actions = buildPlanExecutionActions({
    timeline_urgency: "tight",
    tiers: { match: { summary: "CS focus" }, reach: {} },
  });
  assert.ok(actions.some((a) => /deadline|lock|timeline/i.test(a)));
  assert.ok(!actions.some((a) => /截止/.test(a)));
  setUiLocale("zh");
});

test("renderPlanExecutionPathHtml renders ordered list", () => {
  setUiLocale("zh");
  const html = renderPlanExecutionPathHtml(["步骤 A", "步骤 B"]);
  assert.match(html, /plan-exec-path/);
  assert.match(html, /步骤 A/);
  assert.match(html, /exec-action-num/);
});

test("renderPlanExecutionPathHtml is English when UI is en", () => {
  setUiLocale("en");
  const html = renderPlanExecutionPathHtml(["Step A"]);
  assert.match(html, /Next steps|Execution/i);
  assert.doesNotMatch(html, /下一步执行路径/);
  setUiLocale("zh");
});

test("renderPlanCitationListHtml includes intel link and quote", () => {
  setUiLocale("zh");
  const html = renderPlanCitationListHtml([
    {
      itemId: "intel_1",
      url: "https://example.com/p",
      sourceTitle: "港大政策",
      quoteOrSummary: "截止日期说明",
    },
  ]);
  assert.match(html, /查看情报/);
  assert.match(html, /intel_1/);
  assert.match(html, /截止日期说明/);
});

test("renderPlanCitationListHtml shows official KB badge for ext_kb", () => {
  setUiLocale("zh");
  const html = renderPlanCitationListHtml([
    {
      itemId: "ext_kb_hku-admission",
      url: "https://admissions.hku.hk/",
      sourceTitle: "港大研究生院",
    },
  ]);
  assert.match(html, /官方知识库/);
  assert.doesNotMatch(html, /查看情报/);
});
