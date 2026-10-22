import { hongKongCalendarDate } from "./collection-trigger.js";

/**
 * @param {string} asOfDate YYYY-MM-DD in Asia/Hong_Kong
 * @returns {string[]} seven dates ending at asOfDate inclusive, ascending
 */
export function sevenHongKongDaysEndingOn(asOfDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(asOfDate || "").trim());
  if (!m) throw new RangeError(`asOfDate must be YYYY-MM-DD, got ${asOfDate}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // Anchor noon UTC on that civil date so ±1 day stays on intended calendar when formatting back…
  // Better: treat asOfDate as HKT civil date by constructing UTC noon of that Y-M-D then walk.
  const anchor = new Date(Date.UTC(y, mo - 1, d, 4, 0, 0)); // 04:00Z ≈ 12:00 HKT
  const out = [];
  for (let i = 6; i >= 0; i -= 1) {
    const t = new Date(anchor.getTime() - i * 24 * 60 * 60 * 1000);
    out.push(hongKongCalendarDate(t.toISOString()));
  }
  return out;
}

/**
 * @param {{ asOfDate: string, runs: Array<{ status?: string, trigger?: string, finishedAt?: string }> }} input
 * @returns {{ passed: boolean, days: Array<{ date: string, ok: boolean }> }}
 */
export function checkSevenDaySchedulerGate({ asOfDate, runs }) {
  const days = sevenHongKongDaysEndingOn(asOfDate);
  const okByDay = new Set();
  for (const r of runs || []) {
    if (!r || r.status !== "completed") continue;
    if (r.trigger !== "scheduler") continue;
    if (!r.finishedAt) continue;
    let day;
    try {
      day = hongKongCalendarDate(r.finishedAt);
    } catch {
      continue;
    }
    okByDay.add(day);
  }
  const dayRows = days.map((date) => ({ date, ok: okByDay.has(date) }));
  return { passed: dayRows.every((d) => d.ok), days: dayRows };
}
