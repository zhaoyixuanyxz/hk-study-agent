import assert from "node:assert/strict";
import { test } from "node:test";
import { setUiLocale } from "../i18n/index.js";
import { buildBudgetChartConfig, renderRiskMatrixHtml } from "./report-charts.js";

test("renderRiskMatrixHtml uses Chinese quadrant titles by default", () => {
  setUiLocale("zh");
  const html = renderRiskMatrixHtml({
    riskMatrix: { quadrants: { high_high: ["GPA risk"], high_low: [], low_high: [], low_low: [] } },
  });
  assert.match(html, /风险矩阵/);
  assert.match(html, /高影响 · 高可能/);
  assert.match(html, /GPA risk/);
});

test("renderRiskMatrixHtml is English when UI is en", () => {
  setUiLocale("en");
  const html = renderRiskMatrixHtml({
    riskMatrix: { quadrants: { high_high: ["GPA risk"], high_low: [], low_high: [], low_low: [] } },
  });
  assert.match(html, /Risk matrix/i);
  assert.match(html, /High impact/i);
  assert.doesNotMatch(html, /风险矩阵/);
  setUiLocale("zh");
});

test("buildBudgetChartConfig labels follow UI locale", () => {
  setUiLocale("en");
  const cfg = buildBudgetChartConfig({
    budgetBands: [{ label: "Tuition", minHkd: 100000, maxHkd: 200000 }],
  });
  assert.ok(cfg);
  assert.match(cfg.options.plugins.title.text, /Budget|HKD/i);
  assert.match(cfg.data.datasets[0].label, /Floor|Min|Lower/i);
  assert.match(cfg.data.datasets[1].label, /Span|Range/i);
  setUiLocale("zh");
  const zh = buildBudgetChartConfig({
    budgetBands: [{ label: "学费", minHkd: 1, maxHkd: 2 }],
  });
  assert.match(zh.options.plugins.title.text, /预算区间/);
});
