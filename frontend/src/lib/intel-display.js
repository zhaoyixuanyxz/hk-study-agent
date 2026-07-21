import { getUiLocale } from "../i18n/index.js";

/**
 * @param {{ title_zh?: string, title_original?: string } | null | undefined} item
 */
export function intelCardTitle(item) {
  if (getUiLocale() === "en") {
    return item?.title_original || item?.title_zh || "Untitled";
  }
  return item?.title_zh || item?.title_original || "未命名条目";
}

/**
 * @param {{ summary_zh?: string, snippet_original?: string } | null | undefined} item
 */
export function intelCardSummary(item) {
  if (getUiLocale() === "en") {
    return item?.snippet_original || item?.summary_zh || "";
  }
  return item?.summary_zh || item?.snippet_original || "";
}
