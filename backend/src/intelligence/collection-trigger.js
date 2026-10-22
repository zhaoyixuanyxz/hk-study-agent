/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {"scheduler" | "manual"}
 */
export function resolveCollectionTrigger(env = process.env) {
  return String(env.COLLECTION_TRIGGER || "").trim() === "scheduler" ? "scheduler" : "manual";
}

/**
 * Map an ISO timestamp to a calendar date in Asia/Hong_Kong.
 * @param {string} iso
 * @returns {string} YYYY-MM-DD
 */
export function hongKongCalendarDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`invalid iso: ${iso}`);
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}
