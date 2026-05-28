import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createKnowledgeStore } from "./knowledge-store.js";
import { computeDedupeHash, normalizeIntelligenceItem } from "./normalization-service.js";
import { loadSourcesRegistry } from "./source-registry.js";
import { runRealCrawl } from "./real-crawler.js";
import { buildCrawlFeeds } from "./crawl-registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "..", "data", "intelligence");

const DEFAULT_MAX_FETCH = 10;
const FETCH_TIMEOUT_MS = 12_000;

/**
 * @returns {{ feeds: object[] }}
 */
export function loadFeedUrlsFile() {
  const path = join(dataDir, "feed-urls.json");
  if (!existsSync(path)) return { feeds: [] };
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return { feeds: Array.isArray(raw.feeds) ? raw.feeds : [] };
}

export { respectRobotsForUrl } from "./robots.js";

/**
 * @param {string} url
 */
async function fetchPageText(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": "StudyAgentIntel/1.0", Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim().slice(0, 300) : url;
  const snippet = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  return { title, snippet };
}

/**
 * 每日采集条目一律 pending_review（见 API 草案）。
 * @param {object} raw
 */
export function normalizeIngestedItem(raw) {
  const base = normalizeIntelligenceItem(raw);
  return { ...base, reviewStatus: "pending_review" };
}

/**
 * Mock 入库：不发起 HTTP，用 feed 元数据合成条目。
 * @param {object} feed
 */
function mockIngestFromFeed(feed) {
  const url = String(feed.url || "").trim();
  if (!url) return null;
  const title = String(feed.titleHint || `采集：${feed.sourceId || "source"} — ${feed.id || url}`).slice(0, 200);
  return normalizeIngestedItem({
    sourceId: feed.sourceId,
    canonicalUrl: url,
    schoolIds: feed.schoolIds || [],
    infoType: feed.infoType || "policy",
    locale: {
      titleZh: title,
      summaryZh: String(feed.summaryHint || "每日采集任务生成的待审核摘要（Mock）。").slice(0, 500),
      titleOriginal: title,
      snippetOriginal: String(feed.summaryHint || "").slice(0, 500),
    },
    publishedAt: new Date().toISOString(),
  });
}

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 * @param {{ fetchEnabled?: boolean, maxFetch?: number }} [opts]
 */
export async function runIngestion(store, opts = {}) {
  const crawlMode = String(process.env.INTELLIGENCE_CRAWL_MODE || "real").toLowerCase();
  const fetchEnabled =
    opts.fetchEnabled ?? (process.env.INTELLIGENCE_FETCH === "1" || process.env.INTELLIGENCE_FETCH === "true");

  if (fetchEnabled && crawlMode !== "legacy") {
    const feeds = loadFeedUrlsFile().feeds;
    const registryFeeds = feeds.length ? feeds : buildCrawlFeeds();
    return runRealCrawl(store, { ...opts, fetchEnabled: true, feeds: registryFeeds });
  }
  const maxFetch = Math.min(50, Math.max(1, Number(opts.maxFetch || process.env.INTELLIGENCE_FETCH_MAX || DEFAULT_MAX_FETCH)));
  const ks = createKnowledgeStore(store);
  ks.syncSourcesFromRegistry();

  const feeds = loadFeedUrlsFile().feeds;
  const { sources } = loadSourcesRegistry();
  const validSourceIds = new Set(sources.map((s) => s.id));

  const startedAt = new Date().toISOString();
  let itemsIngested = 0;
  let fetchCount = 0;
  const errors = [];

  for (const feed of feeds) {
    if (!feed || !feed.sourceId || !validSourceIds.has(feed.sourceId)) continue;
    try {
      let normalized;
      if (fetchEnabled && fetchCount < maxFetch) {
        const url = String(feed.url || "").trim();
        if (!url) continue;
        const allowed = await respectRobotsForUrl(url);
        if (!allowed) {
          errors.push(`robots blocked: ${url}`);
          continue;
        }
        const { title, snippet } = await fetchPageText(url);
        fetchCount += 1;
        normalized = normalizeIngestedItem({
          sourceId: feed.sourceId,
          canonicalUrl: url,
          schoolIds: feed.schoolIds || [],
          infoType: feed.infoType || "policy",
          locale: {
            titleZh: title,
            summaryZh: snippet.slice(0, 400),
            titleOriginal: title,
            snippetOriginal: snippet,
          },
          publishedAt: new Date().toISOString(),
        });
      } else {
        normalized = mockIngestFromFeed(feed);
      }
      if (!normalized) continue;
      const before = store.listIntelligenceItems({ limit: 5000 }).length;
      ks.upsertItem(normalized);
      const after = store.listIntelligenceItems({ limit: 5000 }).length;
      if (after >= before) itemsIngested += 1;
    } catch (e) {
      errors.push(String(e?.message || e));
    }
  }

  const finishedAt = new Date().toISOString();
  const run = ks.appendCollectionRun({
    status: errors.length && !itemsIngested ? "failed" : "completed",
    itemsIngested,
    errorMessage: errors.length ? errors.slice(0, 3).join("; ") : null,
    startedAt,
    finishedAt,
  });

  return { run, itemsIngested, fetchEnabled, errors };
}

/**
 * 将 feed-urls 模板同步到 store（供 admin workspace 展示）。
 * @param {ReturnType<import("../store.js").createStore>} store
 */
export function syncFeedUrlsToStore(store) {
  const { feeds } = loadFeedUrlsFile();
  return store.syncIntelligenceFeedUrls(feeds);
}

export { computeDedupeHash };
