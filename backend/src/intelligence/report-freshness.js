import { hongKongCalendarDate } from "./collection-trigger.js";
import { calendarDaysBetween, factContentFingerprint } from "./fact-check-table.js";

/**
 * @param {{
 *   report: object,
 *   latestSnapshotId: string | null | undefined,
 *   asOfDate: string,
 *   getItem: (itemId: string) => ({ fetchedAt?: string, contentFingerprint?: string } | null),
 *   checkShare?: boolean,
 * }} input
 * @returns {{ fresh: boolean, reason: "ok"|"share_disabled"|"profile_changed"|"intel_changed"|"age_exceeded"|"eval_error" }}
 */
export function evaluateReportFreshness(input) {
  try {
    const report = input.report && typeof input.report === "object" ? input.report : {};
    if (input.checkShare) {
      const sh = report.share && typeof report.share === "object" ? report.share : {};
      if (!sh.enabled || !sh.token) {
        return { fresh: false, reason: "share_disabled" };
      }
    }

    const snapId = report.snapshotId != null ? String(report.snapshotId).trim() : "";
    const latest = input.latestSnapshotId != null ? String(input.latestSnapshotId).trim() : "";
    if (!snapId || snapId !== latest) {
      return { fresh: false, reason: "profile_changed" };
    }

    const rows = Array.isArray(report.factCheckRows) ? report.factCheckRows : [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const itemId = String(row.itemId || "").trim();
      if (!itemId) {
        return { fresh: false, reason: "intel_changed" };
      }
      const current = input.getItem(itemId);
      if (!current || typeof current !== "object") {
        return { fresh: false, reason: "intel_changed" };
      }
      const storedFetched = String(row.fetchedAt || "");
      const curFetched = String(current.fetchedAt || "");
      if (!storedFetched || storedFetched !== curFetched) {
        return { fresh: false, reason: "intel_changed" };
      }
      const storedFp = row.contentFingerprint != null ? String(row.contentFingerprint) : "";
      if (storedFp) {
        const curFp =
          current.contentFingerprint != null
            ? String(current.contentFingerprint)
            : factContentFingerprint(current.summary ?? row.summary ?? "");
        if (storedFp !== curFp) {
          return { fresh: false, reason: "intel_changed" };
        }
      }
    }

    let createdYmd;
    try {
      createdYmd = hongKongCalendarDate(String(report.createdAt || ""));
    } catch {
      return { fresh: false, reason: "age_exceeded" };
    }
    const age = calendarDaysBetween(createdYmd, String(input.asOfDate || ""));
    if (!(age >= 0 && age <= 31)) {
      return { fresh: false, reason: "age_exceeded" };
    }

    return { fresh: true, reason: "ok" };
  } catch {
    return { fresh: false, reason: "eval_error" };
  }
}

export function renderClosedOrInvalidShareHtml() {
  return "<!DOCTYPE html><html lang=\"zh-Hans\"><head><meta charset=\"utf-8\"/><title>报告不可用</title></head><body><p>分享链接已关闭或无效。</p></body></html>";
}

export function renderExpiredShareHtml() {
  return "<!DOCTYPE html><html lang=\"zh-Hans\"><head><meta charset=\"utf-8\"/><title>报告已过期</title></head><body><p>这份报告已过期，不能再当作正式版转发。请学生重新生成后再分享。</p></body></html>";
}
