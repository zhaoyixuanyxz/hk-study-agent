import assert from "node:assert";
import { test } from "node:test";
import { setUiLocale } from "../i18n/index.js";
import {
  buildTierChartConfig,
  buildTimelineChartConfig,
  hasPlanVisuals,
  renderPlanChartsHostHtml,
} from "./plan-charts.js";

test("hasPlanVisuals detects tierComparison", () => {
  assert.equal(hasPlanVisuals({ tierComparison: { labels: ["a"], scores: [1] } }), true);
  assert.equal(hasPlanVisuals(null), false);
});

test("buildTierChartConfig returns bar chart", () => {
  setUiLocale("zh");
  const cfg = buildTierChartConfig({
    tierComparison: { labels: ["冲刺", "匹配", "保底"], scores: [30, 60, 80] },
  });
  assert.ok(cfg);
  assert.equal(cfg.type, "bar");
  assert.equal(cfg.data.labels.length, 3);
  assert.match(cfg.options.plugins.title.text, /梯度相对可行性/);
});

test("buildTierChartConfig titles are English when UI is en", () => {
  setUiLocale("en");
  const cfg = buildTierChartConfig({
    tierComparison: { labels: ["Reach", "Match", "Safety"], scores: [30, 60, 80] },
  });
  assert.ok(cfg);
  assert.match(cfg.options.plugins.title.text, /Tier|feasibility/i);
  assert.match(cfg.options.scales.y.title.text, /Index|Score/i);
  assert.match(cfg.data.datasets[0].label, /feasibility|relative/i);
  setUiLocale("zh");
});

test("buildTimelineChartConfig horizontal bar", () => {
  setUiLocale("zh");
  const cfg = buildTimelineChartConfig({
    timelineMilestones: [{ label: "语言", monthsFromNow: 1 }],
  });
  assert.ok(cfg);
  assert.equal(cfg.options.indexAxis, "y");
});

test("renderPlanChartsHostHtml includes canvas ids", () => {
  setUiLocale("zh");
  const html = renderPlanChartsHostHtml();
  assert.match(html, /plan-tier-chart/);
  assert.match(html, /plan-timeline-chart/);
  assert.match(html, /方案可视化/);
});

test("renderPlanChartsHostHtml is English when UI is en", () => {
  setUiLocale("en");
  const html = renderPlanChartsHostHtml();
  assert.match(html, /Plan visuals|Visualization/i);
  assert.doesNotMatch(html, /方案可视化/);
  setUiLocale("zh");
});
