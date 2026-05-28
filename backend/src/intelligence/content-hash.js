import { createHash } from "node:crypto";

/**
 * Stable hash for detecting page content changes (daily refresh).
 * @param {string} text
 */
export function computeContentHash(text) {
  const norm = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return createHash("sha256").update(norm).digest("hex").slice(0, 32);
}

/**
 * Dedupe key for crawl feeds: one row per feed URL.
 * @param {string} canonicalUrl
 */
export function computeFeedDedupeHash(canonicalUrl) {
  const u = String(canonicalUrl || "").trim().toLowerCase();
  return createHash("sha256").update(`feed|${u}`).digest("hex").slice(0, 32);
}
