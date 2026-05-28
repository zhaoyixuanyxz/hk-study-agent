import { createHash } from "node:crypto";
import { getSourceById } from "./source-registry.js";

const REVIEW_AUTO = "auto_published";
const REVIEW_PENDING = "pending_review";

/**
 * @param {string} canonicalUrl
 * @param {string} [title]
 */
export function computeDedupeHash(canonicalUrl, title = "") {
  const base = `${String(canonicalUrl || "").trim().toLowerCase()}|${String(title || "").trim().toLowerCase()}`;
  return createHash("sha256").update(base).digest("hex").slice(0, 32);
}

/**
 * 根据来源 tier 决定审核状态。
 * @param {{ tier?: string, trustRules?: { autoPublish?: boolean } }} source
 */
export function resolveReviewStatusForSource(source) {
  if (!source) return REVIEW_PENDING;
  if (source.trustRules?.autoPublish === true || source.tier === "official") return REVIEW_AUTO;
  return REVIEW_PENDING;
}

/**
 * 将采集或手工录入的原始对象规范为 intelligence item 行。
 * @param {object} raw
 * @param {{ id?: string }} [opts]
 */
export function normalizeIntelligenceItem(raw, opts = {}) {
  if (!raw || typeof raw !== "object") {
    throw new Error("normalizeIntelligenceItem: raw must be an object");
  }
  const sourceId = String(raw.sourceId || "").trim();
  const source = getSourceById(sourceId);
  const canonicalUrl = String(raw.canonicalUrl || raw.url || "").trim();
  if (!canonicalUrl) throw new Error("normalizeIntelligenceItem: canonicalUrl required");

  const localeIn = raw.locale && typeof raw.locale === "object" ? raw.locale : {};
  const titleZh = String(localeIn.titleZh || raw.titleZh || raw.title || "").trim();
  const summaryZh = String(localeIn.summaryZh || raw.summaryZh || raw.summary || "").trim();

  const reviewStatus =
    raw.reviewStatus && ["auto_published", "pending_review", "approved", "rejected"].includes(raw.reviewStatus)
      ? raw.reviewStatus
      : resolveReviewStatusForSource(source);

  const now = new Date().toISOString();
  const publishedAt = String(raw.publishedAt || now).slice(0, 80);

  return {
    id: String(opts.id || raw.id || "").trim() || undefined,
    feedId: String(raw.feedId || "").trim() || undefined,
    sourceId,
    reviewStatus,
    locale: {
      titleZh,
      summaryZh,
      titleOriginal: String(localeIn.titleOriginal || raw.titleOriginal || "").slice(0, 500),
      snippetOriginal: String(localeIn.snippetOriginal || raw.snippetOriginal || "").slice(0, 2000),
      contentText: String(localeIn.contentText || raw.contentText || "").slice(0, 12000),
    },
    structured:
      raw.structured && typeof raw.structured === "object" && !Array.isArray(raw.structured)
        ? raw.structured
        : undefined,
    contentHash: String(raw.contentHash || "").trim() || undefined,
    lastSnapshotId: String(raw.lastSnapshotId || "").trim() || undefined,
    canonicalUrl,
    publishedAt,
    fetchedAt: String(raw.fetchedAt || now).slice(0, 80),
    schoolIds: Array.isArray(raw.schoolIds) ? raw.schoolIds.map(String) : [],
    programTags: Array.isArray(raw.programTags) ? raw.programTags.map(String) : [],
    infoType: String(raw.infoType || "policy").slice(0, 80),
    dedupeHash: String(raw.dedupeHash || "").trim() || computeDedupeHash(canonicalUrl, titleZh),
    sensitiveHint: Array.isArray(raw.sensitiveHint) ? raw.sensitiveHint.map(String) : [],
    productCurated: raw.productCurated === true,
  };
}

/**
 * 用户可见：已自动发布或已审核通过。
 * @param {object} item
 */
export function isIntelligenceItemPublished(item) {
  if (!item) return false;
  return item.reviewStatus === REVIEW_AUTO || item.reviewStatus === "approved";
}
