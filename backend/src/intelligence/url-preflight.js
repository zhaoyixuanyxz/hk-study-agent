import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCrawlFeeds } from "./crawl-registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "..", "data");

export const PREFLIGHT_LAST_PATH = join(dataDir, ".intel-preflight-last.json");
export const PREFLIGHT_TIMEOUT_MS = 25_000;
export const DEFAULT_PREFLIGHT_CONCURRENCY = 4;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 StudyAgent/1.0";

/**
 * @param {string} finalUrl
 * @param {string} [htmlSnippet]
 */
export function isSoft404(finalUrl, htmlSnippet = "") {
  if (/notfound\.html|404\.html|page-not-found|error-404/i.test(finalUrl)) return true;
  if (/We could not find the page|Page Not Found|404 Not Found/i.test(htmlSnippet.slice(0, 2000))) {
    return true;
  }
  return false;
}

/**
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 * @returns {Promise<{ ok: boolean, status: number, finalUrl: string, ms: number, soft404?: boolean, error?: string }>}
 */
export async function probeUrl(url, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const timeoutMs = opts.timeoutMs ?? PREFLIGHT_TIMEOUT_MS;
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-HK,en;q=0.9,zh-HK;q=0.8",
      },
    });
    const finalUrl = res.url || url;
    const ms = Date.now() - started;
    let html = "";
    if (res.ok) {
      html = await res.text();
    }
    const soft = isSoft404(finalUrl, html);
    const ok = res.status >= 200 && res.status < 400 && !soft;
    return {
      ok,
      status: res.status,
      finalUrl,
      ms,
      soft404: soft,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      ms: Date.now() - started,
      error: e?.name === "AbortError" ? "timeout" : e?.message || String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} feed
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function probeFeed(feed, opts = {}) {
  const url = String(feed.url || "").trim();
  if (!url) {
    return {
      feedId: feed.id,
      url: "",
      ok: false,
      status: 0,
      finalUrl: "",
      ms: 0,
      error: "empty_url",
    };
  }
  const r = await probeUrl(url, opts);
  return {
    feedId: feed.id,
    url,
    ok: r.ok,
    status: r.status,
    finalUrl: r.finalUrl,
    ms: r.ms,
    soft404: r.soft404,
    error: r.error,
  };
}

/**
 * @param {{ feeds?: object[], concurrency?: number, fetchImpl?: typeof fetch }} [opts]
 */
export async function runFeedPreflight(opts = {}) {
  const feeds = opts.feeds?.length ? opts.feeds : buildCrawlFeeds();
  const concurrency = Math.min(
    12,
    Math.max(1, Number(opts.concurrency) || DEFAULT_PREFLIGHT_CONCURRENCY)
  );
  /** @type {Awaited<ReturnType<typeof probeFeed>>[]} */
  const results = [];
  let index = 0;

  async function worker() {
    while (index < feeds.length) {
      const i = index++;
      const row = await probeFeed(feeds[i], { fetchImpl: opts.fetchImpl });
      results.push(row);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, feeds.length) }, () => worker());
  await Promise.all(workers);

  const failures = results.filter((r) => !r.ok);
  const slow = results.filter((r) => r.ms > 10_000);
  const summary = {
    ranAt: new Date().toISOString(),
    total: results.length,
    okCount: results.length - failures.length,
    failedCount: failures.length,
    slowCount: slow.length,
    failures: failures.map((f) => ({
      feedId: f.feedId,
      url: f.url,
      status: f.status,
      error: f.error,
      soft404: f.soft404,
      finalUrl: f.finalUrl,
    })),
    results,
  };
  return summary;
}

/**
 * @param {object} summary
 */
export function savePreflightLast(summary) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(PREFLIGHT_LAST_PATH, JSON.stringify(summary, null, 2), "utf8");
}

/**
 * @returns {object | null}
 */
export function loadPreflightLast() {
  if (!existsSync(PREFLIGHT_LAST_PATH)) return null;
  try {
    return JSON.parse(readFileSync(PREFLIGHT_LAST_PATH, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Feed IDs that failed the last preflight (for crawl skip).
 * @param {object | null} [last]
 * @returns {Set<string>}
 */
export function getFailedFeedIdSet(last = loadPreflightLast()) {
  const set = new Set();
  if (!last || !Array.isArray(last.failures)) return set;
  for (const f of last.failures) {
    if (f?.feedId) set.add(String(f.feedId));
  }
  return set;
}
