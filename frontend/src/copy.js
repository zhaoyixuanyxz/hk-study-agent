import { t } from "./i18n/index.js";

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
  if (!state) return t("flow.fallback");
  const key = `flow.${state}`;
  const labeled = t(key);
  return labeled === key ? t("flow.fallback") : labeled;
}

/**
 * @param {string | undefined | null} key
 */
export function formatFactLabel(key) {
  if (!key) return t("fact.fallback");
  const catalogKey = `fact.${key}`;
  const labeled = t(catalogKey);
  if (labeled !== catalogKey) return labeled;
  return toTitleWords(key) || t("fact.fallback");
}

/**
 * @param {string[] | undefined | null} dims
 */
export function formatMissingDimensions(dims) {
  if (!Array.isArray(dims) || !dims.length) return [];
  return dims.map((x) => {
    const catalogKey = `dim.${x}`;
    const labeled = t(catalogKey);
    return labeled !== catalogKey ? labeled : toTitleWords(x);
  });
}

/**
 * @param {{ ready?: boolean, missingRequired?: string[] } | null | undefined} readiness
 */
export function formatReadinessCopy(readiness) {
  const ready = readiness?.ready === true;
  const missing = formatMissingDimensions(readiness?.missingRequired || []);
  if (ready) {
    return {
      title: t("readiness.ready_title"),
      hint: t("readiness.ready_hint"),
      missing: [],
    };
  }
  return {
    title: t("readiness.gap_title"),
    hint: t("readiness.gap_hint"),
    missing,
  };
}

/**
 * @param {{ id?: string, orchestration_state?: string, locale?: string } | null | undefined} thread
 */
export function formatThreadMeta(thread) {
  const id = String(thread?.id || "");
  const shortId = id ? `${id.slice(0, 8)}…` : t("thread.pending_id");
  const locLabel = thread?.locale === "en" ? t("lang.english") : t("lang.chinese");
  return t("thread.meta", {
    id: shortId,
    lang: locLabel,
    stage: formatFlowState(thread?.orchestration_state),
  });
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
  if (u === "tight") return t("urgency.tight_line");
  if (u === "relaxed") return t("urgency.relaxed_line");
  if (u === "normal") return t("urgency.normal_line");
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
      label: t("urgency.tight"),
      line: formatTimelineUrgencyLine(u),
      barWidth: "100%",
      barClass: "urgency-bar--tight",
    };
  }
  if (u === "relaxed") {
    return {
      level: "relaxed",
      label: t("urgency.relaxed"),
      line: formatTimelineUrgencyLine(u),
      barWidth: "33%",
      barClass: "urgency-bar--relaxed",
    };
  }
  if (u === "normal") {
    return {
      level: "normal",
      label: t("urgency.normal"),
      line: formatTimelineUrgencyLine(u),
      barWidth: "66%",
      barClass: "urgency-bar--normal",
    };
  }
  return null;
}

/** Plan 页引用区空态说明 */
export function formatPlanCitationsHint() {
  return t("plan.citations_hint");
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
