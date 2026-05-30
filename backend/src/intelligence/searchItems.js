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
 * @param {import("./profile-search-hints.js").extractProfileSearchHints extends Function ? ReturnType<import("./profile-search-hints.js").extractProfileSearchHints> : object} [profileHints]
 */
function scoreItem(qWords, item, profileHints) {
  let n = 0;
  if (!qWords.length) n = 1;
  else {
  const struct = item.structured && typeof item.structured === "object" ? item.structured : {};
  const hay = [
    item.locale?.titleZh,
    item.locale?.summaryZh,
    item.infoType,
    ...(item.schoolIds || []),
    ...(item.programTags || []),
    struct.benchmarkGpa ? `gpa 基准 benchmark ${JSON.stringify(struct.benchmarkGpa)}` : "",
    struct.competitionTag ? `竞争度 ${struct.competitionTag}` : "",
    Array.isArray(struct.subjectWeights)
      ? struct.subjectWeights.map((s) => `${s.subject} ${s.weight} ${s.note || ""}`).join(" ")
      : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  for (const w of qWords) {
    if (hay.includes(w)) n += 1;
  }
  if (String(item.infoType || "").toLowerCase() === "benchmark") {
    const benchmarkQuery = qWords.some((w) => /gpa|基准|benchmark|录取|竞争|权重|ielts|语言/.test(w));
    if (benchmarkQuery) n += 2;
  }
  }

  if (profileHints && typeof profileHints === "object") {
    const schools = Array.isArray(item.schoolIds) ? item.schoolIds : [];
    if (
      Array.isArray(profileHints.targetSchools) &&
      profileHints.targetSchools.some((s) => schools.includes(s))
    ) {
      n += 2;
    }
    const field = String(profileHints.field || "").trim().toLowerCase();
    if (
      field &&
      Array.isArray(item.programTags) &&
      item.programTags.some(
        (t) => String(t).toLowerCase().includes(field) || String(t).includes(profileHints.field)
      )
    ) {
      n += 2;
    }
    if (String(item.infoType || "").toLowerCase() === "deadline" && profileHints.intakeTerm) {
      n += 1;
    }
  }
  return n;
}

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 * @param {{ q?: string, schoolId?: string, infoType?: string, programTag?: string, limit?: number, offset?: number, profileHints?: object }} opts
 */
export function searchIntelligenceItems(store, opts = {}) {
  const profileHints = opts.profileHints && typeof opts.profileHints === "object" ? opts.profileHints : null;
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
      .map((item) => ({ item, score: scoreItem(qWords, item, profileHints) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ab = String(a.item.infoType || "").toLowerCase() === "benchmark" ? 1 : 0;
        const bb = String(b.item.infoType || "").toLowerCase() === "benchmark" ? 1 : 0;
        if (opts.preferBenchmarks && bb !== ab) return bb - ab;
        return new Date(b.item.publishedAt || 0) - new Date(a.item.publishedAt || 0);
      })
      .map((x) => x.item);
  } else if (opts.preferBenchmarks) {
    list = list.sort((a, b) => {
      const ab = String(a.infoType || "").toLowerCase() === "benchmark" ? 1 : 0;
      const bb = String(b.infoType || "").toLowerCase() === "benchmark" ? 1 : 0;
      if (bb !== ab) return bb - ab;
      return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
    });
  } else {
    list = list.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  }

  const total = list.length;
  const page = list.slice(offset, offset + limit);
  return { items: page, total, limit, offset };
}
