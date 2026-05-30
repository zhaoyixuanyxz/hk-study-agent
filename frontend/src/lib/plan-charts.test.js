import assert from "node:assert";
import { test } from "node:test";
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
  const cfg = buildTierChartConfig({
    tierComparison: { labels: ["冲刺", "匹配", "保底"], scores: [30, 60, 80] },
  });
  assert.ok(cfg);
  assert.equal(cfg.type, "bar");
  assert.equal(cfg.data.labels.length, 3);
});

test("buildTimelineChartConfig horizontal bar", () => {
  const cfg = buildTimelineChartConfig({
    timelineMilestones: [{ label: "语言", monthsFromNow: 1 }],
  });
  assert.ok(cfg);
  assert.equal(cfg.options.indexAxis, "y");
});

test("renderPlanChartsHostHtml includes canvas ids", () => {
  const html = renderPlanChartsHostHtml();
  assert.match(html, /plan-tier-chart/);
  assert.match(html, /plan-timeline-chart/);
});
