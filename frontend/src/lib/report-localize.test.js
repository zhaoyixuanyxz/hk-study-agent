import assert from "node:assert/strict";
import { test } from "node:test";
import { localizeReportShellHtml } from "./report-localize.js";

test("localizeReportShellHtml rewrites Chinese delivery chrome to English", () => {
  const input = `<article>
    <h2>家长决策摘要</h2>
    <p class="report-lede">以下为面向家庭决策者的结论速览（预算、风险与方向）。</p>
    <h2>风险仪表盘</h2>
    <p class="report-lede">结构化风险条目（由报告生成，非录取承诺）。</p>
    <span class="risk-level">高</span>
    <span class="risk-level">中</span>
    <span class="risk-level">低</span>
    <h2>学生行动计划（30 / 60 / 90 天）</h2>
    <h3 class="report-subh">未来 30 天</h3>
  </article>`;
  const out = localizeReportShellHtml(input, "en");
  assert.match(out, /Parent Decision Summary/);
  assert.match(out, /Risk Dashboard/);
  assert.match(out, /Student Action Plan/);
  assert.match(out, />High</);
  assert.match(out, />Medium</);
  assert.match(out, />Low</);
  assert.doesNotMatch(out, /家长决策摘要/);
  assert.doesNotMatch(out, /风险仪表盘/);
});

test("localizeReportShellHtml leaves English chrome when locale is zh", () => {
  const input = `<h2>Parent Decision Summary</h2><span class="risk-level">High</span>`;
  const out = localizeReportShellHtml(input, "zh");
  assert.match(out, /家长决策摘要/);
  assert.match(out, />高</);
});
