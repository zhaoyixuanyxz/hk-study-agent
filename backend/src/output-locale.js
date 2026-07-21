/**
 * @param {unknown} value
 * @returns {"zh"|"en"}
 */
export function normalizeLocale(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  if (v === "en" || v === "en-us" || v === "en_gb") return "en";
  return "zh";
}

/**
 * @param {"zh"|"en"|string} locale
 * @returns {string}
 */
export function buildOutputLocaleBlock(locale) {
  const loc = normalizeLocale(locale);
  if (loc === "en") {
    return [
      "[OUTPUT_LOCALE]",
      "locale=en",
      "Respond entirely in English. User-facing fields in JSON (summaries, labels,",
      "risk notes, plain_language_notes, report prose, reply) must be English.",
      "Keep school/program official English names; do not invent Chinese.",
    ].join("\n");
  }
  return [
    "[OUTPUT_LOCALE]",
    "locale=zh",
    "请使用简体中文输出全部用户可见内容（含 JSON 中的摘要、标签、风险说明、白话释义、报告正文与 reply）。",
    "院校/项目专有名词可保留官方英文名，必要时括号附中文惯用译名。",
  ].join("\n");
}

/**
 * @param {{ locale?: string } | null | undefined} thread
 * @returns {"zh"|"en"}
 */
export function resolveThreadLocale(thread) {
  return normalizeLocale(thread?.locale);
}
