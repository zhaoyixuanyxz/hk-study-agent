import { createHash } from "node:crypto";
import { hongKongCalendarDate } from "./collection-trigger.js";
import { checkSevenDaySchedulerGate } from "./collection-gate.js";

export function factContentFingerprint(summary) {
  return createHash("sha256").update(String(summary ?? ""), "utf8").digest("hex");
}

function escapeHtmlText(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

/** Inclusive calendar-day distance: asOf - fetched, in whole days. */
export function calendarDaysBetween(fetchedYmd, asOfYmd) {
  const a = parseYmd(fetchedYmd);
  const b = parseYmd(asOfYmd);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const t0 = Date.UTC(a.y, a.mo - 1, a.d);
  const t1 = Date.UTC(b.y, b.mo - 1, b.d);
  return Math.round((t1 - t0) / 86400000);
}

/**
 * @param {string} fetchedAtIso
 * @param {string} asOfDate YYYY-MM-DD HKT
 * @param {number} [maxDays=31]
 */
export function isFetchedWithinDays(fetchedAtIso, asOfDate, maxDays = 31) {
  let fetchedDate;
  try {
    fetchedDate = hongKongCalendarDate(fetchedAtIso);
  } catch {
    return false;
  }
  const delta = calendarDaysBetween(fetchedDate, asOfDate);
  return delta >= 0 && delta <= maxDays;
}

export function itemSummary(item) {
  const loc = item && item.locale && typeof item.locale === "object" ? item.locale : {};
  return String(loc.summaryZh || loc.titleZh || item.title || item.id || "").slice(0, 500);
}

/**
 * @param {{ itemId: string, infoType: string, summary: string, fetchedAt: string, fetchedDate: string }[]} rows
 */
export function renderFactCheckTableHtml(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const body = rows
    .map((r) => {
      const typeZh = r.infoType === "deadline" ? "截止日期" : "学费";
      return `<tr data-item-id="${escapeHtmlText(r.itemId)}"><td>${escapeHtmlText(typeZh)}</td><td>${escapeHtmlText(r.summary)}</td><td class="fact-fetched-date">抓取日期：${escapeHtmlText(r.fetchedDate)}</td></tr>`;
    })
    .join("");
  return `<section class="report-chapter" id="report-fact-check"><h2>学费与截止日期核对</h2><table class="fact-check-table"><thead><tr><th>类型</th><th>内容</th><th>抓取日期</th></tr></thead><tbody>${body}</tbody></table></section>`;
}

/**
 * @param {{ itemId: string, infoType: string, summary: string, fetchedAt: string, fetchedDate: string }[]} rows
 * @param {string} asOfDate
 */
export function filterFactCheckRowsForAsOf(rows, asOfDate) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r && r.fetchedAt && isFetchedWithinDays(r.fetchedAt, asOfDate, 31));
}

/**
 * @param {{ items: object[], runs: object[], asOfDate: string }} input
 */
export function buildFactCheckTable({ items, runs, asOfDate }) {
  const gate = checkSevenDaySchedulerGate({ asOfDate, runs: runs || [] });
  if (!gate.passed) {
    return { gatePassed: false, rows: [], tableHtml: "" };
  }
  const rows = [];
  for (const item of items || []) {
    if (!item || typeof item !== "object") continue;
    const infoType = String(item.infoType || "").toLowerCase();
    if (infoType !== "tuition" && infoType !== "deadline") continue;
    const fetchedAt = item.fetchedAt != null ? String(item.fetchedAt) : "";
    if (!fetchedAt || !isFetchedWithinDays(fetchedAt, asOfDate, 31)) continue;
    let fetchedDate;
    try {
      fetchedDate = hongKongCalendarDate(fetchedAt);
    } catch {
      continue;
    }
    const summary = itemSummary(item);
    rows.push({
      itemId: String(item.id || item.itemId || "").trim() || `fact_${rows.length + 1}`,
      infoType,
      summary,
      fetchedAt,
      fetchedDate,
      contentFingerprint: factContentFingerprint(summary),
    });
  }
  return {
    gatePassed: true,
    rows,
    tableHtml: renderFactCheckTableHtml(rows),
  };
}

export function injectFactCheckIntoReportHtml(html, tableHtml) {
  const table = String(tableHtml || "");
  if (!table) return String(html || "");
  const s = String(html || "");
  const marker = "</article>";
  const idx = s.lastIndexOf(marker);
  if (idx === -1) return `${s}\n${table}`;
  return `${s.slice(0, idx)}\n${table}\n${s.slice(idx)}`;
}

export function stripFactCheckSection(html) {
  return String(html || "").replace(
    /<section\b[^>]*\bid=["']report-fact-check["'][^>]*>[\s\S]*?<\/section>/i,
    ""
  );
}

export function presentReportHtmlForAsOf({ html, factCheckRows, asOfDate }) {
  const visible = filterFactCheckRowsForAsOf(factCheckRows || [], asOfDate);
  const without = stripFactCheckSection(html);
  const tableHtml = renderFactCheckTableHtml(visible);
  return { html: injectFactCheckIntoReportHtml(without, tableHtml), rows: visible };
}
