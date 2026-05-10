import { emptyPlanInputView, PLAN_INPUT_SCHEMA_VERSION } from "./schemas/phase2.js";

/** MVP：每个维度至少需要一个代表性键，才视为该维度已覆盖 */
export const REQUIRED_KEYS_BY_DIM = {
  goals: ["target_region", "field"],
  academic: ["gpa", "school_background"],
  timeline: ["intake_or_season"],
  budget: ["budget_range"],
  riskPreference: ["risk_style"],
};

export const DIMENSION_KEYS = {
  academic: ["school_background", "major", "gpa", "language", "degree_level"],
  goals: ["target_region", "intent_degree", "field", "career_goal"],
  budget: ["budget_range", "currency"],
  timeline: ["intake_or_season", "apply_window"],
  riskPreference: ["risk_style", "school_tier_preference"],
};

/**
 * @param {import('./types/phase2.js').ProfileSnapshotDoc} snapshot
 * @param {Array<{ kind: string, key: string, value: string }>} memories
 */
export function buildPlanInputView(snapshot, memories) {
  const out = emptyPlanInputView();
  out.schemaVersion = PLAN_INPUT_SCHEMA_VERSION;

  const factMap = { ...snapshot.structuredFacts };
  for (const m of memories) {
    if (m.kind === "confirmed" || m.kind === "candidate" || m.kind === "preference") {
      if (factMap[m.key] === undefined || factMap[m.key] === "") factMap[m.key] = m.value;
    }
  }

  out.academic = buildBlock("academic", factMap, memories);
  out.goals = buildBlock("goals", factMap, memories);
  out.budget = buildBlock("budget", factMap, memories);
  out.timeline = buildBlock("timeline", factMap, memories);
  out.riskPreference = buildBlock("riskPreference", factMap, memories);

  out.readiness = computeReadiness(out, snapshot.gaps || []);
  return out;
}

/**
 * @param {string} dimension
 * @param {Record<string, string>} factMap
 * @param {Array<{ kind: string, key: string, value: string }>} memories
 */
function buildBlock(dimension, factMap, memories) {
  const keys = DIMENSION_KEYS[dimension] || [];
  const value = {};
  let bestSource = /** @type {'confirmed'|'candidate'|'inferred'} */ ("inferred");

  for (const k of keys) {
    const v = factMap[k];
    if (!v) continue;
    value[k] = v;
    const mem = memories.find((m) => m.key === k);
    let s = /** @type {'confirmed'|'candidate'|'inferred'} */ ("inferred");
    if (mem) {
      if (mem.kind === "confirmed") s = "confirmed";
      else if (mem.kind === "candidate") s = "candidate";
      else if (mem.kind === "preference") s = "candidate";
      else if (mem.kind === "insight") s = "inferred";
    }
    bestSource = rankSource(bestSource, s);
  }

  return { value, source: bestSource };
}

function rankSource(a, b) {
  const order = { confirmed: 3, candidate: 2, inferred: 1 };
  return order[a] >= order[b] ? a : b;
}

function computeReadiness(plan, gaps) {
  const missing = [];
  for (const [dim, requiredKeys] of Object.entries(REQUIRED_KEYS_BY_DIM)) {
    const block = plan[dim];
    const vals = block?.value || {};
    const ok = requiredKeys.some((k) => vals[k]);
    if (!ok) missing.push(dim);
  }
  const hasGaps = Array.isArray(gaps) && gaps.length > 0;
  const ready = missing.length === 0 && !hasGaps;
  return {
    ready,
    missingRequired: missing,
  };
}

/** 用于事实冲突检测等：plan 输入相关的结构化 fact key */
export const ALL_STRUCTURED_FACT_KEYS = new Set(Object.values(DIMENSION_KEYS).flat());
