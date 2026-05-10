import { DIMENSION_KEYS } from "./plan-input-service.js";

/**
 * 合并画像事实与 planInputView 各维度，用于进度计算
 * @param {import('./types/phase2.js').ProfileSnapshotDoc | null} snapshot
 * @param {import('./types/phase2.js').PlanInputViewDoc | null} planInputView
 */
function mergedKeys(snapshot, planInputView) {
  /** @type {Record<string, string>} */
  const m = { ...(snapshot?.structuredFacts || {}) };
  for (const dim of ["academic", "goals", "budget", "timeline", "riskPreference"]) {
    const vals = planInputView?.[dim]?.value;
    if (vals && typeof vals === "object") {
      for (const [k, v] of Object.entries(vals)) {
        if (v !== undefined && v !== null && String(v).trim() !== "") m[k] = String(v);
      }
    }
  }
  return m;
}

/**
 * @param {import('./types/phase2.js').ProfileSnapshotDoc | null} snapshot
 * @param {import('./types/phase2.js').PlanInputViewDoc | null} planInputView
 */
export function buildProfileProgress(snapshot, planInputView) {
  const fact = mergedKeys(snapshot, planInputView);
  /** @type {Record<string, { complete: number, missing: string[] }>} */
  const dimensions = {};

  for (const dim of ["academic", "goals", "budget", "timeline", "riskPreference"]) {
    const keys = DIMENSION_KEYS[dim] || [];
    const missing = keys.filter((k) => !fact[k] || !String(fact[k]).trim());
    const filled = keys.length - missing.length;
    const complete = keys.length ? Math.round((filled / keys.length) * 1000) / 1000 : 0;
    dimensions[dim] = { complete, missing };
  }

  const langVal = fact.language && String(fact.language).trim();
  dimensions.language = {
    complete: langVal ? 1 : 0,
    missing: langVal ? [] : ["language"],
  };

  const weights = Object.values(dimensions).map((d) => d.complete);
  const summary_pct = weights.length ? Math.round((weights.reduce((a, b) => a + b, 0) / weights.length) * 100) : 0;

  return { dimensions, summary_pct };
}
