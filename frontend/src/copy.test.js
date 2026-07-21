import test from "node:test";
import assert from "node:assert/strict";
import { setUiLocale } from "./i18n/index.js";
import {
  formatFactLabel,
  formatFlowState,
  formatPlanCitationsHint,
  INTEL_USER_REFRESH_LABEL,
  formatAdminCollectResult,
  formatAdminPreflightSummary,
  formatReadinessCopy,
  formatThreadMeta,
  formatTruthStatusLabel,
  formatMissingDimensions,
  formatSourceHintLabel,
  formatTimelineUrgencyLine,
  timelineUrgencyMeta,
  truthStatusTagClass,
} from "./copy.js";

test("formatFlowState maps known states into plain Chinese", () => {
  setUiLocale("zh");
  assert.equal(formatFlowState("gap_probing"), "顾问正在补齐关键档案信息");
  assert.equal(formatFlowState("fact_confirmation"), "请确认档案中的关键事实");
  assert.equal(formatFlowState("profile_ready"), "档案已就绪，可进入方案阶段");
});

test("formatFlowState is English when UI locale is en", () => {
  setUiLocale("en");
  assert.match(formatFlowState("explore"), /background|goals/i);
  assert.match(formatFlowState("gap_probing"), /gap|profile/i);
  setUiLocale("zh");
});

test("formatFlowState has safe fallback for unknown values", () => {
  setUiLocale("zh");
  assert.equal(formatFlowState("unknown_state"), "顾问处理中");
  setUiLocale("en");
  assert.equal(formatFlowState("unknown_state"), "Advisor working");
  setUiLocale("zh");
});

test("formatFactLabel maps known keys and formats unknown keys", () => {
  setUiLocale("zh");
  assert.equal(formatFactLabel("target_region"), "目标地区");
  assert.equal(formatFactLabel("first-generation"), "First Generation");
});

test("formatMissingDimensions converts dimension ids into readable labels", () => {
  setUiLocale("zh");
  assert.deepEqual(formatMissingDimensions(["goals", "riskPreference", "other_dim"]), [
    "申请目标",
    "风险偏好",
    "Other Dim",
  ]);
  setUiLocale("en");
  assert.deepEqual(formatMissingDimensions(["goals", "riskPreference"]), [
    "Application goals",
    "Risk preference",
  ]);
  setUiLocale("zh");
});

test("formatReadinessCopy returns friendly summary text", () => {
  setUiLocale("zh");
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

test("formatReadinessCopy is English when UI locale is en", () => {
  setUiLocale("en");
  const ready = formatReadinessCopy({ ready: true, missingRequired: [] });
  assert.match(ready.title, /ready|plan/i);
  const gap = formatReadinessCopy({ ready: false, missingRequired: ["goals"] });
  assert.match(gap.title, /gap|fill/i);
  assert.deepEqual(gap.missing, ["Application goals"]);
  setUiLocale("zh");
});

test("formatThreadMeta hides internal state wording", () => {
  setUiLocale("zh");
  assert.equal(
    formatThreadMeta({ id: "abcd1234efgh", orchestration_state: "explore" }),
    "咨询会话 abcd1234… · 语言：中文 · 当前阶段：顾问正在梳理你的背景与目标"
  );
});

test("formatThreadMeta shows English language name when thread locale=en under zh UI", () => {
  setUiLocale("zh");
  assert.equal(
    formatThreadMeta({ id: "abcd1234efgh", orchestration_state: "explore", locale: "en" }),
    "咨询会话 abcd1234… · 语言：English · 当前阶段：顾问正在梳理你的背景与目标"
  );
});

test("formatThreadMeta uses English shell when UI locale is en", () => {
  setUiLocale("en");
  const s = formatThreadMeta({ id: "abcd1234efgh", orchestration_state: "explore", locale: "en" });
  assert.match(s, /Session/i);
  assert.match(s, /Language/i);
  assert.match(s, /English/i);
  setUiLocale("zh");
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
  setUiLocale("zh");
  assert.ok(formatTimelineUrgencyLine("tight").includes("偏紧"));
  assert.equal(formatTimelineUrgencyLine("unknown"), "");
});

test("CQ-B timelineUrgencyMeta maps levels to bar classes", () => {
  setUiLocale("zh");
  const tight = timelineUrgencyMeta("tight");
  assert.ok(tight);
  assert.equal(tight.barClass, "urgency-bar--tight");
  assert.equal(tight.label, "偏紧");
  assert.equal(timelineUrgencyMeta("bogus"), null);
});

test("V3-INTEL user refresh label avoids implying crawl", () => {
  assert.equal(INTEL_USER_REFRESH_LABEL, "刷新列表");
});

test("V3-INTEL admin collect result copy includes skip counts", () => {
  const line = formatAdminCollectResult({
    items_ingested: 2,
    items_updated: 1,
    skipped_preflight: 3,
    items_skipped_quality: 1,
    errors: ["x"],
  });
  assert.match(line, /新增 2/);
  assert.match(line, /跳过坏链 3/);
  assert.match(line, /质量保护跳过 1/);
});

test("V3-INTEL preflight summary copy", () => {
  assert.match(formatAdminPreflightSummary({ ran_at: "2026-01-01", total: 10, ok_count: 8, failed_count: 2 }), /失败 2/);
  assert.equal(formatAdminPreflightSummary({ empty: true }), "尚未执行链接检测。");
});
