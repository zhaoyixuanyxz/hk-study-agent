import { searchIntelligenceItems } from "./searchItems.js";

const DEFAULT_LIMIT = 6;

/**
 * 从用户消息、画像快照、planInputView 拼检索 query。
 * @param {{ userMessage?: string, snapshot?: object, planInputView?: object }} opts
 */
export function buildIntelSearchQuery(opts = {}) {
  const parts = [];
  if (opts.userMessage) parts.push(String(opts.userMessage));
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
 */
export function formatIntelContextPackText(items) {
  if (!Array.isArray(items) || !items.length) return "";
  const lines = items.map((it, i) => {
    const title = it.locale?.titleZh || it.title_zh || "(无标题)";
    const summary = String(it.locale?.summaryZh || "").slice(0, 280);
    const schools = Array.isArray(it.schoolIds) ? it.schoolIds.join(",") : "";
    return `${i + 1}. itemId=${it.id} | title=${title} | url=${it.canonicalUrl} | infoType=${it.infoType || ""} | schools=${schools} | publishedAt=${it.publishedAt || ""}\n   ${summary}`;
  });
  return (
    "[INTELLIGENCE_CONTEXT — 以下为已上线情报条目，仅可引用此列表中的 itemId 与 url；勿编造条目或链接]\n" +
    lines.join("\n")
  );
}

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 * @param {{ userMessage?: string, snapshot?: object, planInputView?: object, limit?: number }} opts
 */
export function buildIntelContextPack(store, opts = {}) {
  const limit = Math.min(12, Math.max(1, Number(opts.limit) || DEFAULT_LIMIT));
  const query = buildIntelSearchQuery(opts);
  const search = searchIntelligenceItems(store, { q: query, limit: Math.max(limit, 12) });
  const items = search.items.slice(0, limit);
  const text = formatIntelContextPackText(items);
  return { items, text, query, total: search.total };
}
