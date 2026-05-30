import { searchIntelligenceItems } from "./searchItems.js";
import { isBenchmarkIntelItem } from "./benchmark-loader.js";
import { extractProfileSearchHints } from "./profile-search-hints.js";
import {
  formatExternalKbContextText,
  selectExternalKbForProfile,
} from "./external-kb-loader.js";

const DEFAULT_LIMIT = 6;
const PLAN_REPORT_LIMIT = 12;

/**
 * Plan/report 生成时 benchmark 条目优先于 policy/deadline。
 * @param {object[]} items
 * @param {{ preferBenchmarks?: boolean }} opts
 */
export function rankIntelContextItems(items, opts = {}) {
  if (opts.preferBenchmarks === false || !Array.isArray(items) || !items.length) return items;
  return [...items].sort((a, b) => {
    const ab = isBenchmarkIntelItem(a) ? 1 : 0;
    const bb = isBenchmarkIntelItem(b) ? 1 : 0;
    if (bb !== ab) return bb - ab;
    return 0;
  });
}

/**
 * @param {object} item
 * @param {ReturnType<typeof extractProfileSearchHints>} hints
 */
export function relevanceReasonForItem(item, hints) {
  const reasons = [];
  const schools = Array.isArray(item.schoolIds) ? item.schoolIds : [];
  if (hints.targetSchools?.some((s) => schools.includes(s))) reasons.push("目标院校匹配");
  const field = String(hints.field || "").trim();
  if (
    field &&
    Array.isArray(item.programTags) &&
    item.programTags.some((t) => String(t).toLowerCase().includes(field.toLowerCase()) || String(t).includes(field))
  ) {
    reasons.push("专业方向匹配");
  }
  if (isBenchmarkIntelItem(item)) reasons.push("verified benchmark");
  if (String(item.infoType || "").toLowerCase() === "deadline" && hints.intakeTerm) {
    reasons.push("申请季/截止相关");
  }
  if (String(item.infoType || "").toLowerCase() === "policy" || String(item.infoType || "").toLowerCase() === "tuition") {
    reasons.push("政策/费用情报");
  }
  return reasons.length ? reasons.join("；") : "已发布情报条目";
}

/**
 * 从用户消息、画像快照、planInputView 拼检索 query（含画像字段）。
 * @param {{ userMessage?: string, snapshot?: object, planInputView?: object }} opts
 */
export function buildIntelSearchQuery(opts = {}) {
  const hints = extractProfileSearchHints(opts);
  const parts = [];
  if (opts.userMessage) parts.push(String(opts.userMessage));
  if (hints.field) parts.push(hints.field);
  if (hints.intakeTerm) parts.push(hints.intakeTerm);
  if (hints.targetSchools.length) parts.push(hints.targetSchools.join(" "));
  if (hints.languageScores.length) parts.push(hints.languageScores.join(" "));
  if (hints.programTags.length) parts.push(hints.programTags.join(" "));
  if (opts.snapshot && typeof opts.snapshot === "object") {
    if (opts.snapshot.summary) parts.push(String(opts.snapshot.summary));
    parts.push(JSON.stringify(opts.snapshot).slice(0, 3000));
  }
  if (opts.planInputView && typeof opts.planInputView === "object") {
    for (const key of ["goals", "academic", "budget", "timeline", "riskPreference"]) {
      const v = opts.planInputView[key]?.value;
      if (v && typeof v === "object") parts.push(JSON.stringify(v));
    }
  }
  return parts.join(" ").slice(0, 2000);
}

/**
 * @param {object[]} items
 * @param {ReturnType<typeof extractProfileSearchHints>} [hints]
 */
export function formatIntelContextPackText(items, hints) {
  if (!Array.isArray(items) || !items.length) return "";
  const h = hints || extractProfileSearchHints({});
  const lines = items.map((it, i) => {
    const title = it.locale?.titleZh || it.title_zh || "(无标题)";
    const summary = String(it.locale?.summaryZh || "").slice(0, 280);
    const schools = Array.isArray(it.schoolIds) ? it.schoolIds.join(",") : "";
    const reason = it._relevanceReason || relevanceReasonForItem(it, h);
    return `${i + 1}. itemId=${it.id} | title=${title} | url=${it.canonicalUrl} | infoType=${it.infoType || ""} | schools=${schools} | publishedAt=${it.publishedAt || ""}\n   relevance: ${reason}\n   ${summary}`;
  });
  return (
    "[INTELLIGENCE_CONTEXT — 以下为已上线情报条目，仅可引用此列表中的 itemId 与 url；勿编造条目或链接]\n" +
    lines.join("\n")
  );
}

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 * @param {object} [planInputView]
 */
function selectBenchmarkItemsForPlan(store, planInputView) {
  const all = store
    .listIntelligenceItems({ publishedOnly: true, limit: 5000 })
    .filter((x) => isBenchmarkIntelItem(x));
  if (!all.length) return [];

  const field = String(planInputView?.goals?.value?.field || "").trim();
  if (!field) return all.slice(0, 4);

  const f = field.toLowerCase();
  const matched = all.filter(
    (b) =>
      (b.programTags || []).some((t) => String(t).toLowerCase().includes(f) || String(t).includes(field)) ||
      String(b.locale?.titleZh || "").includes(field) ||
      String(b.locale?.summaryZh || "").includes(field)
  );
  return (matched.length ? matched : all).slice(0, 4);
}

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 * @param {{ userMessage?: string, snapshot?: object, planInputView?: object, limit?: number, preferBenchmarks?: boolean, forPlanOrReport?: boolean }} opts
 */
export function buildIntelContextPack(store, opts = {}) {
  const forPlan = Boolean(opts.forPlanOrReport || opts.planInputView);
  const limit = Math.min(
    PLAN_REPORT_LIMIT,
    Math.max(1, Number(opts.limit) || (forPlan ? PLAN_REPORT_LIMIT : DEFAULT_LIMIT))
  );
  const hints = extractProfileSearchHints(opts);
  const query = buildIntelSearchQuery(opts);
  const preferBenchmarks = opts.preferBenchmarks !== false && Boolean(opts.planInputView || opts.forPlanOrReport);
  const search = searchIntelligenceItems(store, {
    q: query,
    limit: Math.max(limit, 16),
    preferBenchmarks,
    profileHints: hints,
  });

  /** @type {object[]} */
  let pool = search.items;
  if (preferBenchmarks && opts.planInputView) {
    const bench = selectBenchmarkItemsForPlan(store, opts.planInputView);
    const seen = new Set(pool.map((x) => x.id));
    pool = [...bench.filter((x) => !seen.has(x.id)), ...pool];
  }

  const ranked = rankIntelContextItems(pool, { preferBenchmarks });
  const items = ranked.slice(0, limit).map((it) => ({
    ...it,
    _relevanceReason: relevanceReasonForItem(it, hints),
  }));
  const text = formatIntelContextPackText(items, hints);
  return { items, text, query, total: search.total, profileHints: hints };
}

/**
 * Plan / Report / Chat：情报 pack + 官方外链知识库（≤8000 字符）。
 * @param {ReturnType<import("../store.js").createStore>} store
 * @param {Parameters<typeof buildIntelContextPack>[1]} opts
 */
export function buildCombinedIntelContext(store, opts = {}) {
  const forPlan = Boolean(opts.forPlanOrReport || opts.planInputView);
  const intelLimit = forPlan ? PLAN_REPORT_LIMIT : Math.min(8, Number(opts.limit) || DEFAULT_LIMIT);
  const pack = buildIntelContextPack(store, { ...opts, limit: intelLimit, forPlanOrReport: forPlan });
  const extKbEntries = selectExternalKbForProfile({
    planInputView: opts.planInputView,
    snapshot: opts.snapshot,
    userMessage: opts.userMessage,
    limit: forPlan ? 8 : 4,
  });
  const extText = formatExternalKbContextText(extKbEntries);
  const combinedText = [pack.text, extText].filter(Boolean).join("\n\n").slice(0, 8000);
  return {
    ...pack,
    extKbEntries,
    text: combinedText,
  };
}
