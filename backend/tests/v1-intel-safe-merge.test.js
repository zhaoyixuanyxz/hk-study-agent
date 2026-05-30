import { describe, it } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../src/store.js";
import { passesExtractionQuality } from "../src/intelligence/structured-extract.js";
import {
  getFailedFeedIdSet,
  isSoft404,
  probeUrl,
  runFeedPreflight,
  savePreflightLast,
  loadPreflightLast,
} from "../src/intelligence/url-preflight.js";
import { runRealCrawl } from "../src/intelligence/real-crawler.js";

const GOOD_TEXT =
  "Application deadline: 31 January 2026. Tuition HK$120,000 per year for taught postgraduate programmes. " +
  "Additional fees may apply. Please refer to the official fee schedule and admission requirements.";
const GOOD_STRUCTURED = {
  fees: [{ amount: "HK$120,000", programme: "MSc" }],
  deadlines: [{ date: "2026-01-31", label: "Application" }],
};

describe("url-preflight", () => {
  it("isSoft404 detects common patterns", () => {
    assert.equal(isSoft404("https://www.polyu.edu.hk/en/404.html"), true);
    assert.equal(isSoft404("https://www.hku.hk/fees", "Page Not Found"), true);
    assert.equal(isSoft404("https://www.hku.hk/fees", "Tuition fees for MSc"), false);
  });

  it("probeUrl uses mock fetch", async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      url: "https://example.com/ok",
      text: async () => "<html><body>Hello world with enough content for probe.</body></html>",
    });
    const r = await probeUrl("https://example.com/ok", { fetchImpl: mockFetch });
    assert.equal(r.ok, true);
    assert.equal(r.status, 200);
  });

  it("runFeedPreflight returns summary with failures array", async () => {
    let n = 0;
    const mockFetch = async (url) => {
      n += 1;
      if (String(url).includes("bad")) {
        return { ok: false, status: 404, url, text: async () => "" };
      }
      return {
        ok: true,
        status: 200,
        url,
        text: async () => "<html><title>OK</title><body>content</body></html>",
      };
    };
    const summary = await runFeedPreflight({
      feeds: [
        { id: "good-a", url: "https://example.com/a" },
        { id: "bad-b", url: "https://example.com/bad" },
      ],
      concurrency: 2,
      fetchImpl: mockFetch,
    });
    assert.equal(summary.total, 2);
    assert.equal(summary.failedCount, 1);
    assert.equal(summary.failures[0].feedId, "bad-b");
    assert.ok(n >= 2);
  });

  it("savePreflightLast and getFailedFeedIdSet", () => {
    const dir = mkdtempSync(join(tmpdir(), "pf-"));
    const orig = process.cwd();
    try {
      const summary = {
        ranAt: new Date().toISOString(),
        total: 2,
        okCount: 1,
        failedCount: 1,
        slowCount: 0,
        failures: [{ feedId: "x-fail", url: "https://x/bad" }],
        results: [],
      };
      savePreflightLast(summary);
      const loaded = loadPreflightLast();
      assert.equal(loaded.failedCount, 1);
      const set = getFailedFeedIdSet(loaded);
      assert.ok(set.has("x-fail"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("upsertIntelligenceItemCrawl safe merge", () => {
  it("skips update when new content fails extraction quality", () => {
    const dir = mkdtempSync(join(tmpdir(), "merge-"));
    const store = createStore(join(dir, "db.json"));
    const good = {
      feedId: "hku-tuition",
      sourceId: "hku-official",
      canonicalUrl: "https://www.hku.hk/fees",
      schoolIds: ["hku"],
      infoType: "tuition",
      reviewStatus: "auto_published",
      reviewedBy: "test@reviewer",
      productCurated: true,
      contentHash: "hash-good",
      locale: { titleZh: "HKU", summaryZh: "s", contentText: GOOD_TEXT },
      structured: GOOD_STRUCTURED,
      dedupeHash: "d1",
    };
    store.upsertIntelligenceItemCrawl(good);
    const bad = {
      ...good,
      contentHash: "hash-bad",
      locale: { titleZh: "HKU", summaryZh: "s", contentText: "short" },
      structured: {},
      reviewStatus: "pending_review",
      productCurated: false,
    };
    const r = store.upsertIntelligenceItemCrawl(bad);
    assert.equal(r.updated, false);
    assert.equal(r.skippedReason, "quality_degraded");
    const row = store.listIntelligenceItems({ limit: 5 })[0];
    assert.equal(row.contentHash, "hash-good");
    assert.equal(row.reviewStatus, "auto_published");
    assert.equal(row.productCurated, true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("preserves approved review fields when quality update succeeds", () => {
    const dir = mkdtempSync(join(tmpdir(), "merge2-"));
    const store = createStore(join(dir, "db.json"));
    const v1 = {
      feedId: "cuhk-policy",
      sourceId: "cuhk-official",
      canonicalUrl: "https://www.cuhk.edu.hk/policy",
      schoolIds: ["cuhk"],
      infoType: "policy",
      reviewStatus: "approved",
      reviewedBy: "ops@example.com",
      productCurated: true,
      contentHash: "h1",
      locale: { titleZh: "CUHK", summaryZh: "s1", contentText: GOOD_TEXT },
      structured: { policy_points: ["point a"], highlights: ["h1"] },
      dedupeHash: "d2",
    };
    store.upsertIntelligenceItemCrawl(v1);
    const v2 = {
      ...v1,
      contentHash: "h2",
      locale: { titleZh: "CUHK", summaryZh: "s2", contentText: `${GOOD_TEXT} Updated policy text.` },
      structured: { policy_points: ["point a", "point b"], highlights: ["h1", "h2"] },
      reviewStatus: "pending_review",
      productCurated: false,
    };
    assert.ok(passesExtractionQuality(v2.locale.contentText, v2.structured));
    const r = store.upsertIntelligenceItemCrawl(v2);
    assert.equal(r.updated, true);
    const row = store.listIntelligenceItems({ limit: 5 })[0];
    assert.equal(row.reviewStatus, "approved");
    assert.equal(row.reviewedBy, "ops@example.com");
    assert.equal(row.productCurated, true);
    assert.equal(row.contentHash, "h2");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("runRealCrawl preflight skip", () => {
  it("skips feeds in preflight failure set", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crawl-skip-"));
    const dbPath = join(dir, "db.json");
    const store = createStore(dbPath);
    savePreflightLast({
      ranAt: new Date().toISOString(),
      total: 1,
      okCount: 0,
      failedCount: 1,
      slowCount: 0,
      failures: [{ feedId: "only-feed", url: "https://bad.example/x" }],
      results: [],
    });
    const mockFetch = async () => {
      throw new Error("should not fetch");
    };
    const result = await runRealCrawl(store, {
      fetchEnabled: true,
      maxFetch: 5,
      feeds: [
        {
          id: "only-feed",
          url: "https://bad.example/x",
          sourceId: "hku-official",
          schoolIds: ["hku"],
          infoType: "tuition",
        },
      ],
      fetchImpl: mockFetch,
      respectPreflight: true,
    });
    assert.equal(result.skippedPreflight, 1);
    assert.equal(result.fetchCount, 0);
    rmSync(dir, { recursive: true, force: true });
  });
});
