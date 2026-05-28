/**
 * Chat / Plan 共用的引用链接校验与规范化（http/https）。
 */

export function safeHttpUrl(u) {
  try {
    const x = new URL(String(u).trim());
    if (x.protocol !== "http:" && x.protocol !== "https:") return "";
    return x.toString();
  } catch {
    return "";
  }
}

/**
 * @param {unknown} raw
 */
export function normalizeCitations(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const url = safeHttpUrl(c.url);
    if (!url) continue;
    const itemId = String(c.itemId || c.id || "").trim() || `cite_${out.length + 1}`;
    const entry = {
      itemId,
      url,
    };
    if (c.sourceTitle) entry.sourceTitle = String(c.sourceTitle).slice(0, 500);
    if (c.publishedAt) entry.publishedAt = String(c.publishedAt).slice(0, 80);
    if (c.quoteOrSummary) entry.quoteOrSummary = String(c.quoteOrSummary).slice(0, 2000);
    out.push(entry);
    if (out.length >= 8) break;
  }
  return out;
}

export function canonicalUrlKey(url) {
  const u = safeHttpUrl(url);
  if (!u) return "";
  try {
    const x = new URL(u);
    return x.href.replace(/\/$/, "");
  } catch {
    return u.replace(/\/$/, "");
  }
}

/**
 * @param {{ itemId: string, url: string }[]} citations normalized
 * @param {Map<string, { canonicalUrl: string }>} itemsById
 */
export function assertCitationsAgainstItems(citations, itemsById) {
  if (!(itemsById instanceof Map) || itemsById.size === 0) return [];
  const out = [];
  for (const c of citations) {
    const id = String(c.itemId || "").trim();
    const meta = itemsById.get(id);
    if (!meta || !meta.canonicalUrl) continue;
    const want = canonicalUrlKey(meta.canonicalUrl);
    const got = canonicalUrlKey(c.url);
    if (!want || !got || want !== got) continue;
    const entry = { ...c };
    if (meta.sourceTitle && !entry.sourceTitle) entry.sourceTitle = meta.sourceTitle;
    if (meta.publishedAt && !entry.publishedAt) entry.publishedAt = meta.publishedAt;
    out.push(entry);
  }
  return out;
}

/**
 * @param {object[]} items published intelligence rows
 * @returns {Map<string, { canonicalUrl: string, sourceTitle?: string, publishedAt?: string }>}
 */
export function intelligenceItemsToAllowlistMap(items) {
  const map = new Map();
  for (const item of items || []) {
    const id = String(item?.id || "").trim();
    if (!id) continue;
    const url = safeHttpUrl(item.canonicalUrl);
    if (!url) continue;
    map.set(id, {
      canonicalUrl: url,
      sourceTitle: item.locale?.titleZh || item.title_zh,
      publishedAt: item.publishedAt,
    });
  }
  return map;
}

/**
 * @param {unknown} citations
 * @param {object[]} items
 */
export function filterCitationsAgainstIntelligenceItems(citations, items) {
  const normalized = normalizeCitations(citations);
  const map = intelligenceItemsToAllowlistMap(items);
  return assertCitationsAgainstItems(normalized, map);
}

/**
 * @param {{ itemId: string, url: string, sourceTitle?: string, publishedAt?: string }[]} citations
 */
export function citationsToCitationRefs(citations) {
  return (citations || []).map((c) => ({
    itemId: c.itemId,
    title: c.sourceTitle || c.itemId,
    url: c.url,
    ...(c.publishedAt ? { publishedAt: c.publishedAt } : {}),
  }));
}
