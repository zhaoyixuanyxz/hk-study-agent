import test from "node:test";
import assert from "node:assert/strict";
import {
  formatFactLabel,
  formatFlowState,
  formatPlanCitationsHint,
  formatReadinessCopy,
  formatThreadMeta,
  formatTruthStatusLabel,
  formatMissingDimensions,
  formatSourceHintLabel,
  formatTimelineUrgencyLine,
  truthStatusTagClass,
} from "./copy.js";

test("formatFlowState maps known states into plain Chinese", () => {
  assert.equal(formatFlowState("gap_probing"), "顾问正在补齐关键档案信息");
  assert.equal(formatFlowState("fact_confirmation"), "请确认档案中的关键事实");
  assert.equal(formatFlowState("profile_ready"), "档案已就绪，可进入方案阶段");
});

test("formatFlowState has safe fallback for unknown values", () => {
  assert.equal(formatFlowState("unknown_state"), "顾问处理中");
});

test("formatFactLabel maps known keys and formats unknown keys", () => {
  assert.equal(formatFactLabel("target_region"), "目标地区");
  assert.equal(formatFactLabel("first-generation"), "First Generation");
});

test("formatMissingDimensions converts dimension ids into readable labels", () => {
  assert.deepEqual(formatMissingDimensions(["goals", "riskPreference", "other_dim"]), [
    "申请目标",
    "风险偏好",
    "Other Dim",
  ]);
});

test("formatReadinessCopy returns friendly summary text", () => {
  assert.deepEqual(formatReadinessCopy({ ready: true, missingRequired: [] }), {
    title: "方案条件已满足",
    hint: "核心信息已齐全，建议立即生成顾问方案并查看梯度建议。",
    missing: [],
  });
  assert.deepEqual(formatReadinessCopy({ ready: false, missingRequired: ["goals"] }), {
    title: "建议先补齐关键项",
    hint: "补全以下信息后再生成方案，匹配度与可执行性会更高。",
    missing: ["申请目标"],
  });
});

test("formatThreadMeta hides internal state wording", () => {
  assert.equal(
    formatThreadMeta({ id: "abcd1234efgh", orchestration_state: "explore" }),
    "咨询会话 abcd1234… · 当前阶段：顾问正在梳理你的背景与目标"
  );
});

test("V1-P2 truth status labels and tag classes", () => {
  assert.equal(formatTruthStatusLabel("user_confirmed"), "用户已确认");
  assert.equal(formatTruthStatusLabel("inferred"), "系统推断");
  assert.equal(truthStatusTagClass("inferred"), "tag-inferred");
});

test("V1-P2 source hints and plan citation placeholder", () => {
  assert.equal(formatSourceHintLabel("dialogue_extraction"), "对话抽取");
  assert.ok(formatPlanCitationsHint().length > 10);
});

test("V1-P2 timeline urgency lines", () => {
  assert.ok(formatTimelineUrgencyLine("tight").includes("偏紧"));
  assert.equal(formatTimelineUrgencyLine("unknown"), "");
});
