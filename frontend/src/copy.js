const FLOW_STATE_LABELS = {
  init: "顾问正在建立会话上下文",
  explore: "顾问正在梳理你的背景与目标",
  gap_probing: "顾问正在补齐关键档案信息",
  fact_confirmation: "请确认档案中的关键事实",
  profile_ready: "档案已就绪，可进入方案阶段",
};

const FACT_KEY_LABELS = {
  target_region: "目标地区",
  field: "专业方向",
  intent_degree: "申请学位",
  gpa: "成绩水平",
  school_background: "院校背景",
  budget_range: "预算范围",
  intake_or_season: "入学时间",
  risk_style: "风险偏好",
  language_score: "语言成绩",
  language: "语言成绩",
  internship: "实习经历",
  research: "科研经历",
};

const DIMENSION_LABELS = {
  academic: "学术背景",
  goals: "申请目标",
  budget: "预算信息",
  timeline: "时间规划",
  riskPreference: "风险偏好",
};

/**
 * @param {string | undefined | null} raw
 */
export function toTitleWords(raw) {
  if (!raw) return "";
  return String(raw)
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(" ");
}

/**
 * @param {string | undefined | null} state
 */
export function formatFlowState(state) {
  if (!state) return "顾问处理中";
  return FLOW_STATE_LABELS[state] || "顾问处理中";
}

/**
 * @param {string | undefined | null} key
 */
export function formatFactLabel(key) {
  if (!key) return "信息字段";
  return FACT_KEY_LABELS[key] || toTitleWords(key) || "信息字段";
}

/**
 * @param {string[] | undefined | null} dims
 */
export function formatMissingDimensions(dims) {
  if (!Array.isArray(dims) || !dims.length) return [];
  return dims.map((x) => DIMENSION_LABELS[x] || toTitleWords(x));
}

/**
 * @param {{ ready?: boolean, missingRequired?: string[] } | null | undefined} readiness
 */
export function formatReadinessCopy(readiness) {
  const ready = readiness?.ready === true;
  const missing = formatMissingDimensions(readiness?.missingRequired || []);
  if (ready) {
    return {
      title: "方案条件已满足",
      hint: "核心信息已齐全，建议立即生成顾问方案并查看梯度建议。",
      missing: [],
    };
  }
  return {
    title: "建议先补齐关键项",
    hint: "补全以下信息后再生成方案，匹配度与可执行性会更高。",
    missing,
  };
}

/**
 * @param {{ id?: string, orchestration_state?: string }} thread
 */
export function formatThreadMeta(thread) {
  const id = String(thread?.id || "");
  const shortId = id ? `${id.slice(0, 8)}…` : "待创建";
  return `咨询会话 ${shortId} · 当前阶段：${formatFlowState(thread?.orchestration_state)}`;
}

/**
 * Profile「四态」展示文案（API truth_status）
 * @param {string | undefined | null} st
 */
export function formatTruthStatusLabel(st) {
  if (st === "user_confirmed") return "用户已确认";
  if (st === "pending") return "待确认";
  if (st === "conflict") return "冲突·需复核";
  if (st === "inferred") return "系统推断";
  return "—";
}

/**
 * @param {string | undefined | null} st
 */
export function truthStatusTagClass(st) {
  if (st === "user_confirmed") return "tag-confirmed";
  if (st === "pending") return "tag-pending";
  if (st === "conflict") return "tag-conflict";
  if (st === "inferred") return "tag-inferred";
  return "tag-pending";
}

/**
 * @param {string | undefined | null} hint
 */
export function formatSourceHintLabel(hint) {
  const m = {
    dialogue_extraction: "对话抽取",
    user_confirmation: "用户确认入档",
    system_inference: "系统推断",
    conflict_review: "冲突复核",
    dialogue_insight: "对话要点",
    snapshot_summary_insight: "摘要摘录",
  };
  return m[hint] || "";
}

/**
 * @param {string | undefined | null} u
 */
export function formatTimelineUrgencyLine(u) {
  if (u === "tight") return "节奏评估：偏紧——建议尽快锁定节点与材料清单，并预留补件时间。";
  if (u === "relaxed") return "节奏评估：相对从容——仍建议按官网轮次倒排，避免临近截止扎堆。";
  if (u === "normal") return "节奏评估：中等——建议按里程碑推进并定期复盘进度。";
  return "";
}

/**
 * @param {string | undefined | null} u
 * @returns {{ level: string, label: string, line: string, barWidth: string, barClass: string } | null}
 */
export function timelineUrgencyMeta(u) {
  if (u === "tight") {
    return {
      level: "tight",
      label: "偏紧",
      line: formatTimelineUrgencyLine(u),
      barWidth: "100%",
      barClass: "urgency-bar--tight",
    };
  }
  if (u === "relaxed") {
    return {
      level: "relaxed",
      label: "从容",
      line: formatTimelineUrgencyLine(u),
      barWidth: "33%",
      barClass: "urgency-bar--relaxed",
    };
  }
  if (u === "normal") {
    return {
      level: "normal",
      label: "中等",
      line: formatTimelineUrgencyLine(u),
      barWidth: "66%",
      barClass: "urgency-bar--normal",
    };
  }
  return null;
}

/** Plan 页引用区空态说明 */
export function formatPlanCitationsHint() {
  return "此处仅展示方案中显式给出的可追溯外链；若无条目，表示当前结论主要依据档案内信息与通用规划逻辑。";
}

/** 用户情报 Tab：仅重新加载已上线列表，不触发后台爬取 */
export const INTEL_USER_REFRESH_LABEL = "刷新列表";

/**
 * @param {{ items_ingested?: number, items_updated?: number, skipped_preflight?: number, items_skipped_quality?: number, errors?: string[] }} r
 */
export function formatAdminCollectResult(r) {
  const ingested = Number(r?.items_ingested ?? 0);
  const updated = Number(r?.items_updated ?? 0);
  const skippedPf = Number(r?.skipped_preflight ?? 0);
  const skippedQ = Number(r?.items_skipped_quality ?? 0);
  const errN = Array.isArray(r?.errors) ? r.errors.length : 0;
  return `采集完成：新增 ${ingested}，更新 ${updated}；跳过坏链 ${skippedPf}，质量保护跳过 ${skippedQ}${errN ? `；错误 ${errN} 条` : ""}`;
}

/**
 * @param {{ ran_at?: string, total?: number, failed_count?: number, ok_count?: number }} s
 */
export function formatAdminPreflightSummary(s) {
  if (!s?.ran_at) return "尚未执行链接检测。";
  return `上次检测 ${s.ran_at}：共 ${s.total ?? 0} 条，可用 ${s.ok_count ?? 0}，失败 ${s.failed_count ?? 0}`;
}

