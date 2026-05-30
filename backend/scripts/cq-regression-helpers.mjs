/**
 * CQ-C regression helpers: seed ready profile for plan/report mock paths.
 */
import { readFileSync, writeFileSync } from "node:fs";

/**
 * @param {string} dbPath
 * @param {string} userId
 */
export function seedReadyPlanInputView(dbPath, userId) {
  const raw = JSON.parse(readFileSync(dbPath, "utf8"));
  raw.profileSnapshots = raw.profileSnapshots || [];
  raw.planResults = raw.planResults || [];
  raw.profileSnapshots.push({
    id: "snap_cq_regression",
    userId,
    version: 1,
    snapshot: {
      summary: "CQ 回归测试快照：香港授课型硕士，计算机背景。",
      structuredFacts: {},
      gaps: [],
      confirmationState: { facts: [] },
      updatedAt: new Date().toISOString(),
    },
    planInputView: {
      schemaVersion: "1.0",
      academic: { value: { gpa: "3.2", school_background: "内地一本" }, source: "confirmed" },
      goals: { value: { target_region: "香港", field: "数据科学", intent_degree: "授课型硕士" }, source: "confirmed" },
      budget: { value: { budget_range: "30万港币" }, source: "confirmed" },
      timeline: { value: { intake_or_season: "2026秋" }, source: "confirmed" },
      riskPreference: { value: { risk_style: "balanced" }, source: "confirmed" },
      readiness: { ready: true, missingRequired: [] },
    },
    createdAt: new Date().toISOString(),
  });
  writeFileSync(dbPath, JSON.stringify(raw, null, 2), "utf8");
}
