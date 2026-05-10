/**
 * Phase 2：画像快照与 planInputView 实现层 schema 常量与校验辅助
 * 与 docs/Phase0-画像快照与planInputView契约.md 对齐
 */

export const SNAPSHOT_SCHEMA_VERSION = "1.0";
export const PLAN_INPUT_SCHEMA_VERSION = "1.0";

/** @typedef {'confirmed' | 'candidate' | 'preference' | 'insight'} MemoryKind */

/** planInputView 维度 source（契约：confirmed / candidate / inferred） */
export const PLAN_DIMENSION_SOURCES = ["confirmed", "candidate", "inferred"];

/**
 * 空画像快照骨架
 * @returns {import('../types/phase2.js').ProfileSnapshotDoc}
 */
export function emptySnapshot() {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    summary: "",
    structuredFacts: {},
    gaps: [],
    insights: [],
    confirmationState: { facts: [] },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 空 planInputView
 * @returns {import('../types/phase2.js').PlanInputViewDoc}
 */
export function emptyPlanInputView() {
  return {
    schemaVersion: PLAN_INPUT_SCHEMA_VERSION,
    academic: { value: {}, source: "inferred" },
    goals: { value: {}, source: "inferred" },
    budget: { value: {}, source: "inferred" },
    timeline: { value: {}, source: "inferred" },
    riskPreference: { value: {}, source: "inferred" },
    readiness: { ready: false, missingRequired: [] },
  };
}

/**
 * @param {unknown} v
 */
export function isPlanSource(v) {
  return typeof v === "string" && PLAN_DIMENSION_SOURCES.includes(v);
}
