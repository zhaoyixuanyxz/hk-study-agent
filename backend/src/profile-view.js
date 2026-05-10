import { DIMENSION_KEYS, REQUIRED_KEYS_BY_DIM } from "./plan-input-service.js";

/** @typedef {'user_confirmed'|'pending'|'conflict'|'inferred'} TruthStatus */

const DIM_SECTION_META = {
  academic: { id: "academic", title: "学术背景", subtitle: null },
  language: { id: "language", title: "语言与标化", subtitle: null },
  goals: { id: "goals", title: "申请目标", subtitle: null },
  budget: { id: "budget", title: "预算", subtitle: null },
  timeline: { id: "timeline", title: "时间线", subtitle: null },
  riskPreference: { id: "riskPreference", title: "风险偏好", subtitle: null },
  experience: { id: "experience", title: "经历与其他洞察", subtitle: "来自对话要点摘录（非选校策略）" },
};

const MISSING_DIM_IMPACT = {
  academic: {
    plan: "缺少学术画像时，冲刺/匹配/保底的定位与可信度会明显下降。",
    report: "报告中的院校梯度依据会显得不完整，需在正文备注不确定性。",
  },
  goals: {
    plan: "缺少明确目标方向时，方案主线难以收敛，梯度叙事偏弱。",
    report: "报告结论与家长可读的行动摘要会变得泛泛而谈。",
  },
  budget: {
    plan: "预算未定会影响费用风险提示与梯度组合的合理性假设。",
    report: "报告的家庭决策段落缺少可用的区间参照。",
  },
  timeline: {
    plan: "时间线未定会影响节点复盘与下一步动作的紧迫感提示。",
    report: "报告的执行时间表可能与真实情况脱节。",
  },
  riskPreference: {
    plan: "风险偏好不明时，梯队组合可能不符合家庭承受能力。",
    report: "报告的风险措辞较难与家长达成一致表述。",
  },
};

function gapImpactPair(text) {
  const s = String(text);
  if (/预算|费用|学费/i.test(s))
    return {
      plan: "预算不明时，方案梯度与费用测算的可执行假设会变弱。",
      report: "报告的预算段落缺少可用的区间参照，结论需谨慎阅读。",
    };
  if (/时间|入学|申请季|截止/i.test(s))
    return {
      plan: "时间线不清时，紧迫感提示与下一步动作类型难以对齐真实情况。",
      report: "报告的执行时间表可能与真实节点脱节。",
    };
  if (/语言|雅思|托福|GRE|GMAT/i.test(s))
    return {
      plan: "语言与标化未定时，匹配院校与风险分层可能偏乐观或偏保守。",
      report: "报告的技能达标段落论据变薄，不确定性增高。",
    };
  if (/GPA|均分|成绩|本科/i.test(s))
    return {
      plan: "学术画像不完整时，冲刺/匹配/保底的定位可信度下降。",
      report: "报告的梯度叙事与匹配说服力受限。",
    };
  if (/目标|专业|方向|国家|地区|香港/i.test(s))
    return {
      plan: "目标方向未定时，方案主线难以收敛。",
      report: "报告结论与家长摘要容易流于泛泛而谈。",
    };
  if (/风险/i.test(s))
    return {
      plan: "风险偏好不明时，梯队组合可能与承受能力不匹配。",
      report: "报告的风险措辞难以与家长形成一致共识。",
    };
  return {
    plan: "该项缺口会削弱后续方案的梯度依据与落地假设。",
    report: "该项缺口会让交付报告的论据完整性受限。",
  };
}

/**
 * @param {string} key
 */
export function dimensionForStructuredKey(key) {
  for (const [dim, keys] of Object.entries(DIMENSION_KEYS)) {
    if ((keys || []).includes(key)) return dim;
  }
  return null;
}

/**
 * @param {Array<{ kind?: string, key?: string, value?: string, threadId?: string|null, hasConflict?: boolean }>} memories
 * @returns {Map<string, { kind: string, threadId: string|null, hasConflict: boolean }>}
 */
function memoryByKey(memories) {
  const m = new Map();
  for (const row of memories || []) {
    const key = String(row.key || "");
    if (!key) continue;
    m.set(key, {
      kind: String(row.kind || ""),
      threadId: row.threadId ?? null,
      hasConflict: Boolean(row.hasConflict),
    });
  }
  return m;
}

/**
 * @param {string|null} dim
 * @param {import('./types/phase2.js').PlanInputViewDoc|null} planInputView
 */
function blockSourceForDim(dim, planInputView) {
  if (!dim || !planInputView || typeof planInputView !== "object") return null;
  const block = planInputView[dim];
  if (!block || typeof block.source !== "string") return null;
  return /** @type {'confirmed'|'candidate'|'inferred'} */ (block.source);
}

/**
 * @param {string} key
 * @param {{ status: string }} cf - confirmationState fact row
 * @param {ReturnType<memoryByKey>} memMap
 * @param {import('./types/phase2.js').PlanInputViewDoc|null} planInputView
 * @returns {TruthStatus}
 */
export function computeTruthStatus(key, cf, memMap, planInputView) {
  const mem = memMap.get(key);
  const snapStatus = String(cf.status || "");
  if (snapStatus === "conflict" || mem?.hasConflict) return "conflict";
  if (mem?.kind === "confirmed") return "user_confirmed";
  if (snapStatus === "pending" || mem?.kind === "candidate" || mem?.kind === "preference") return "pending";

  const dim = dimensionForStructuredKey(key);
  const src = blockSourceForDim(dim, planInputView);
  if (src === "inferred") return "inferred";

  if (snapStatus === "confirmed") return "user_confirmed";
  return "pending";
}

/**
 * @param {TruthStatus} st
 * @param {{ kind: string, threadId: string|null, hasConflict: boolean }|undefined} mem
 */
export function computeSourceHint(st, mem) {
  if (st === "conflict") return "conflict_review";
  if (st === "inferred") return "system_inference";
  if (st === "user_confirmed") return "user_confirmation";
  if (mem?.kind === "candidate" || mem?.kind === "preference") return "dialogue_extraction";
  if (mem?.threadId) return "dialogue_extraction";
  return "dialogue_extraction";
}

/**
 * @param {import('./types/phase2.js').ProfileSnapshotDoc|null} snapshot
 * @param {Array<{ kind?: string, key?: string, value?: string, threadId?: string|null, hasConflict?: boolean }>} memories
 * @param {import('./types/phase2.js').PlanInputViewDoc|null} planInputView
 */
export function buildProfileViewModel(snapshot, memories, planInputView) {
  const facts = snapshot?.confirmationState?.facts || [];
  const memMap = memoryByKey(memories);

  /** @type {Record<string, { gap: string, impacts: { plan: string, report: string } } }>} */
  const gapRows = {};
  for (const g of snapshot?.gaps || []) {
    const gap = String(g || "").trim();
    if (!gap) continue;
    gapRows[gap] = {
      gap,
      impacts: gapImpactPair(gap),
    };
  }

  const missing = planInputView?.readiness?.missingRequired || [];
  for (const dim of missing) {
    const pack = MISSING_DIM_IMPACT[dim];
    if (!pack) continue;
    const label = DIM_SECTION_META[dim]?.title || dim;
    const syntheticGap = `维度「${label}」尚未满足方案生成门槛`;
    gapRows[syntheticGap] = {
      gap: syntheticGap,
      impacts: { plan: pack.plan, report: pack.report },
    };
  }

  const gap_details = Object.values(gapRows);

  /** @type {Record<string, Array<{ key: string, value: string, truth_status: TruthStatus, source_hint: string }>>} */
  const buckets = {
    academic_core: [],
    language: [],
    goals: [],
    budget: [],
    timeline: [],
    riskPreference: [],
  };

  const LANG_KEYS = new Set(["language"]);

  for (const cf of facts) {
    const key = String(cf.key || "");
    if (!key) continue;
    const truth_status = computeTruthStatus(key, cf, memMap, planInputView);
    const mem = memMap.get(key);
    const source_hint = computeSourceHint(truth_status, mem);
    const row = { key, value: String(cf.value || ""), truth_status, source_hint };

    const dim = dimensionForStructuredKey(key);
    if (LANG_KEYS.has(key)) buckets.language.push(row);
    else if (dim === "goals") buckets.goals.push(row);
    else if (dim === "budget") buckets.budget.push(row);
    else if (dim === "timeline") buckets.timeline.push(row);
    else if (dim === "riskPreference") buckets.riskPreference.push(row);
    else if (dim === "academic") buckets.academic_core.push(row);
    else buckets.academic_core.push(row);
  }

  /** @type {typeof buckets.academic_core} */
  const insightsList = [];
  const insightMems = (memories || []).filter((m) => m.kind === "insight");
  const covered = new Set(facts.map((f) => f.key));
  let idx = 0;
  for (const im of insightMems) {
    const k = String(im.key || "");
    if (!k || covered.has(k)) continue;
    insightsList.push({
      key: k || `insight_${idx}`,
      value: String(im.value || ""),
      truth_status: /** @type {TruthStatus} */ ("inferred"),
      source_hint: "dialogue_insight",
    });
    idx += 1;
    if (insightsList.length > 16) break;
  }

  const insightsFromSnap = Array.isArray(snapshot?.insights) ? snapshot.insights : [];
  for (const line of insightsFromSnap) {
    const text = String(line || "").trim();
    if (!text) continue;
    insightsList.push({
      key: `snapshot_insight_${insightsList.length}`,
      value: text,
      truth_status: /** @type {TruthStatus} */ ("inferred"),
      source_hint: "snapshot_summary_insight",
    });
    if (insightsList.length > 24) break;
  }

  /** @type {Array<{ id: string, title: string, subtitle?: string|null, facts: typeof buckets.academic_core }>} */
  const sections = [];

  const academicFacts = [...buckets.academic_core];
  sections.push({
    ...DIM_SECTION_META.academic,
    facts: academicFacts,
  });
  sections.push({
    ...DIM_SECTION_META.language,
    facts: buckets.language,
  });

  sections.push({
    ...DIM_SECTION_META.goals,
    facts: buckets.goals,
  });

  sections.push({
    ...DIM_SECTION_META.experience,
    facts: insightsList,
  });

  sections.push({
    ...DIM_SECTION_META.budget,
    facts: buckets.budget,
  });
  sections.push({
    ...DIM_SECTION_META.timeline,
    facts: buckets.timeline,
  });
  sections.push({
    ...DIM_SECTION_META.riskPreference,
    facts: buckets.riskPreference,
  });

  const readiness_capsule = {
    plan_gate_ready: planInputView?.readiness?.ready === true,
    missing_dimensions: Array.isArray(missing) ? [...missing] : [],
    required_coverage: Object.keys(REQUIRED_KEYS_BY_DIM),
  };

  return {
    schemaVersion: "1.0-p2",
    sections,
    gap_details,
    readiness_capsule,
  };
}
