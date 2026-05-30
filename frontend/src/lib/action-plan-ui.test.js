import test from "node:test";
import assert from "node:assert/strict";
import {
  actionPlanStorageKey,
  parseRiskFromActionText,
  renderRiskDashboardHtml,
  extractRiskItemsFromReport,
} from "./action-plan-ui.js";

test("actionPlanStorageKey scopes by report id", () => {
  assert.match(actionPlanStorageKey("rep-abc123"), /^cq_action_plan_/);
  assert.notEqual(actionPlanStorageKey("a"), actionPlanStorageKey("b"));
});

test("parseRiskFromActionText detects high medium low patterns", () => {
  assert.deepEqual(parseRiskFromActionText("【提交】高风险：截止前卡点"), {
    level: "high",
    label: "截止前卡点",
  });
  assert.equal(parseRiskFromActionText("【语言】中风险：晚考卡 rolling")?.level, "medium");
  assert.equal(parseRiskFromActionText("【推荐人】低风险但需 buffer")?.level, "low");
  assert.equal(parseRiskFromActionText("普通步骤"), null);
});

test("renderRiskDashboardHtml renders risk cards", () => {
  const html = renderRiskDashboardHtml([
    { level: "high", label: "截止卡点" },
    { level: "medium", label: "语言节点" },
  ]);
  assert.match(html, /report-risk-dashboard/);
  assert.match(html, /risk-card--high/);
  assert.match(html, /截止卡点/);
});

test("renderRiskDashboardHtml empty state", () => {
  const html = renderRiskDashboardHtml([]);
  assert.match(html, /暂无结构化风险标签/);
});

test("extractRiskItemsFromReport parses action plan list items", () => {
  const root = {
    querySelector(sel) {
      if (sel === "#action-plan") {
        return {
          querySelectorAll() {
            return [{ textContent: "【核对】高优先，风险：材料不符" }, { textContent: "普通步骤" }];
          },
        };
      }
      if (sel === "#ch5") return null;
      return null;
    },
  };
  const items = extractRiskItemsFromReport(root);
  assert.ok(items.length >= 1);
  assert.equal(items[0].level, "high");
});
