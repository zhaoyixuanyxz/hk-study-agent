const DIM_LABEL = {
  academic: "学术背景",
  goals: "目标方向",
  budget: "预算",
  timeline: "时间线",
  riskPreference: "风险偏好",
};

/**
 * @param {import('./types/phase2.js').ProfileSnapshotDoc | null} snapshot
 * @param {import('./types/phase2.js').PlanInputViewDoc | null} planInputView
 */
export function buildReportReadiness(snapshot, planInputView) {
  /** @type {string[]} */
  const reasons = [];
  /** @type {string[]} */
  const next_steps = [];

  const pivReady = planInputView?.readiness?.ready === true;
  const missingDim = planInputView?.readiness?.missingRequired || [];
  const gaps = snapshot?.gaps || [];
  const facts = snapshot?.confirmationState?.facts || [];
  const conflicts = facts.filter((f) => f.status === "conflict");
  const pending = facts.filter((f) => f.status === "pending");

  if (!pivReady) {
    reasons.push("方案输入维度尚未齐备，报告不宜作为最终决策稿。");
    if (missingDim.length) {
      reasons.push(`缺维度：${missingDim.map((d) => DIM_LABEL[d] || d).join("、")}`);
    }
  }

  if (Array.isArray(gaps) && gaps.length) {
    reasons.push(`顾问仍标有 ${gaps.length} 条关键缺口，报告依据不完整。`);
  }

  if (conflicts.length) {
    reasons.push("存在待复核的事实冲突，需先统一后再生成高质量报告。");
  }

  if (pending.length) {
    reasons.push(`有 ${pending.length} 条关键事实仍待你确认，确认后报告更可信。`);
  }

  const ok = reasons.length === 0;

  if (!ok) {
    next_steps.push("在对话中继续补齐缺口，并在「核对档案」确认或修正关键事实。");
    if (conflicts.length) next_steps.push("对标记为「需复核」的事实统一口径后再生成报告。");
  }
  if (pivReady && !gaps.length && !conflicts.length && !pending.length) {
    next_steps.push("可前往「选校方案」生成方案，再在「完整报告」生成交付稿。");
  }
  if (!next_steps.length) {
    next_steps.push("建议先到「核对档案」检查摘要与事实状态，再生成报告。");
  }

  return { ok, reasons, next_steps };
}
