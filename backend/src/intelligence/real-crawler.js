import { createKnowledgeStore } from "./knowledge-store.js";
import { buildCrawlFeeds } from "./crawl-registry.js";
import { respectRobotsForUrl } from "./robots.js";
import { extractHtmlTitle, extractMainText, extractTableRows } from "./html-parse.js";
import {
  buildChineseSummary,
  extractStructuredFields,
  passesExtractionQuality,
} from "./structured-extract.js";
import { computeContentHash, computeFeedDedupeHash } from "./content-hash.js";
import { normalizeIntelligenceItem } from "./normalization-service.js";
import { getSourceById } from "./source-registry.js";
import { loadSchoolsRegistry } from "./source-registry.js";
import { getFailedFeedIdSet, loadPreflightLast } from "./url-preflight.js";
import { resolveCollectionTrigger } from "./collection-trigger.js";

const FETCH_TIMEOUT_MS = 20_000;

/**
 * @param {string} url
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchPageHtml(url, fetchImpl = fetch) {
  const res = await fetchImpl(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 StudyAgentIntel/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-HK,en;q=0.9,zh-HK;q=0.8,zh-CN;q=0.7",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const finalUrl = res.url || url;
  return { html, finalUrl };
}

/**
 * @param {object} feed
 * @param {{ html: string, finalUrl: string }} page
 */
export function buildItemFromCrawl(feed, page) {
  const schoolId = feed.schoolIds?.[0] || "";
  const text = extractMainText(page.html);
  const tableRows = extractTableRows(page.html);
  const titleOriginal = extractHtmlTitle(page.html) || feed.id;
  const structured = extractStructuredFields(feed.infoType, text, tableRows, {
    schoolId,
    url: page.finalUrl,
  });
  const summaryZh = buildChineseSummary(feed.infoType, text, structured);
  const contentHash = computeContentHash(text);
  const source = getSourceById(feed.sourceId);
  const qualityOk = passesExtractionQuality(text, structured);
  const reviewStatus =
    source?.tier === "official" && qualityOk ? "auto_published" : qualityOk ? "approved" : "pending_review";

  const { schools } = loadSchoolsRegistry();
  const school = schools.find((s) => s.id === schoolId);
  const titleZh =
    `${school?.nameZh || schoolId} — ${feed.infoType}（官网 ${new Date().toISOString().slice(0, 10)}）`.slice(0, 200);

  return normalizeIntelligenceItem({
    feedId: feed.id,
    sourceId: feed.sourceId,
    canonicalUrl: page.finalUrl,
    schoolIds: feed.schoolIds || [],
    infoType: feed.infoType || "policy",
    reviewStatus,
    locale: {
      titleZh,
      summaryZh: summaryZh.slice(0, 800),
      titleOriginal: titleOriginal.slice(0, 500),
      snippetOriginal: text.slice(0, 4000),
      contentText: text.slice(0, 12000),
    },
    structured,
    contentHash,
    dedupeHash: computeFeedDedupeHash(page.finalUrl),
    publishedAt: new Date().toISOString(),
    productCurated: false,
  });
}

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 * @param {{ fetchEnabled?: boolean, maxFetch?: number, feeds?: object[], fetchImpl?: typeof fetch }} [opts]
 */
export async function runRealCrawl(store, opts = {}) {
  const fetchEnabled =
    opts.fetchEnabled ?? (process.env.INTELLIGENCE_FETCH === "1" || process.env.INTELLIGENCE_FETCH === "true");
  const maxFetch = Math.min(
    56,
    Math.max(1, Number(opts.maxFetch || process.env.INTELLIGENCE_FETCH_MAX || 56))
  );
  const feeds = opts.feeds || buildCrawlFeeds();
  const respectPreflight = opts.respectPreflight !== false;
  const skipFeedIds =
    opts.skipFeedIds instanceof Set
      ? opts.skipFeedIds
      : respectPreflight
        ? getFailedFeedIdSet(opts.preflightLast ?? loadPreflightLast())
        : new Set();
  const ks = createKnowledgeStore(store);
  ks.syncSourcesFromRegistry();

  const startedAt = new Date().toISOString();
  let itemsIngested = 0;
  let itemsUpdated = 0;
  let itemsSkippedQuality = 0;
  let skippedPreflight = 0;
  let fetchCount = 0;
  const errors = [];
  const skippedFeeds = [];

  for (const feed of feeds) {
    if (!fetchEnabled || fetchCount >= maxFetch) break;
    const url = String(feed.url || "").trim();
    if (!url) continue;
    if (skipFeedIds.has(feed.id)) {
      skippedPreflight += 1;
      skippedFeeds.push(feed.id);
      continue;
    }
    try {
      const allowed = await respectRobotsForUrl(url);
      if (!allowed) {
        errors.push(`robots blocked: ${url}`);
        continue;
      }
      const page = await fetchPageHtml(url, opts.fetchImpl);
      fetchCount += 1;
      const normalized = buildItemFromCrawl(feed, page);
      const snap = store.appendIntelligenceRawSnapshot({
        feedId: feed.id,
        canonicalUrl: page.finalUrl,
        fetchedAt: new Date().toISOString(),
        htmlLength: page.html.length,
        contentHash: normalized.contentHash,
      });
      normalized.lastSnapshotId = snap?.id;
      const upsert = store.upsertIntelligenceItemCrawl(normalized);
      if (upsert.created) itemsIngested += 1;
      if (upsert.updated) itemsUpdated += 1;
      if (upsert.skippedReason === "quality_degraded") itemsSkippedQuality += 1;
    } catch (e) {
      errors.push(`${feed.id}: ${e?.message || e}`);
    }
  }

  const finishedAt = new Date().toISOString();
  const run = ks.appendCollectionRun({
    status: errors.length && !itemsIngested && !itemsUpdated ? "failed" : "completed",
    itemsIngested: itemsIngested + itemsUpdated,
    errorMessage: errors.length ? errors.slice(0, 5).join("; ") : null,
    startedAt,
    finishedAt,
    trigger: resolveCollectionTrigger(process.env),
  });

  return {
    run,
    itemsIngested,
    itemsUpdated,
    itemsSkippedQuality,
    skippedPreflight,
    skippedFeeds,
    fetchEnabled,
    fetchCount,
    errors,
    mode: "real_crawl",
  };
}
