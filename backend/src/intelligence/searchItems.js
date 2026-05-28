/**
 * 情报关键词与结构化筛选（仅已上线条目）。
 */

/**
 * @param {string} text
 */
function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 24);
}

/**
 * @param {string[]} qWords
 * @param {object} item
 */
function scoreItem(qWords, item) {
  if (!qWords.length) return 1;
  const hay = [
    item.locale?.titleZh,
    item.locale?.summaryZh,
    item.infoType,
    ...(item.schoolIds || []),
    ...(item.programTags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  let n = 0;
  for (const w of qWords) {
    if (hay.includes(w)) n += 1;
  }
  return n;
}

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 * @param {{ q?: string, schoolId?: string, infoType?: string, programTag?: string, limit?: number, offset?: number }} opts
 */
export function searchIntelligenceItems(store, opts = {}) {
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 30));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const schoolId = String(opts.schoolId || "").trim();
  const infoType = String(opts.infoType || "").trim().toLowerCase();
  const programTag = String(opts.programTag || "").trim().toLowerCase();
  const qWords = tokenize(opts.q);

  let list = store.listIntelligenceItems({ publishedOnly: true, limit: 5000 });

  if (schoolId) {
    list = list.filter((x) => Array.isArray(x.schoolIds) && x.schoolIds.includes(schoolId));
  }
  if (infoType) {
    list = list.filter((x) => String(x.infoType || "").toLowerCase() === infoType);
  }
  if (programTag) {
    list = list.filter(
      (x) => Array.isArray(x.programTags) && x.programTags.some((t) => String(t).toLowerCase().includes(programTag))
    );
  }

  if (qWords.length) {
    list = list
      .map((item) => ({ item, score: scoreItem(qWords, item) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.item.publishedAt || 0) - new Date(a.item.publishedAt || 0);
      })
      .map((x) => x.item);
  } else {
    list = list.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  }

  const total = list.length;
  const page = list.slice(offset, offset + limit);
  return { items: page, total, limit, offset };
}
