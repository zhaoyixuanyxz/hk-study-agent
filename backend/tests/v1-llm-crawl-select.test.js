/**
 * Acceptance: LLM crawl select + discover (①+②), approve-URL-first, pending_review default.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { createStore } from "../src/store.js";
import { buildCrawlFeeds } from "../src/intelligence/crawl-registry.js";
import {
  extractCandidateLinksFromHtml,
  approvedCandidatesToFeeds,
  feedIdForUrl,
} from "../src/intelligence/crawl-discover.js";
import { buildOfficialHostAllowlist, isUrlOnOfficialAllowlist } from "../src/intelligence/host-allowlist.js";
import {
  getSelectMaxFeeds,
  parseSelectFeedIds,
  selectFeedsForCrawl,
  selectFeedsHeuristic,
} from "../src/intelligence/crawl-select.js";
import { buildCrawlableFeedPool, runIngestion } from "../src/intelligence/ingestion-service.js";
import { buildItemFromCrawl } from "../src/intelligence/real-crawler.js";
import { loadCuratedSeedsIntoStore } from "../src/intelligence/seed-loader.js";

const SAMPLE_HTML = `<!DOCTYPE html><html><head><title>HKU Fees</title></head><body><main>
<h1>Tuition Fees</h1>
<p>Application deadline: 31 January 2026. Tuition HK$120,000 per year for MSc programmes.</p>
<table><tr><th>Programme</th><th>Fee</th></tr><tr><td>MSc CS</td><td>HK$150,000</td></tr></table>
</main></body></html>`;

describe("v1 llm crawl select+discover acceptance", () => {
  let dir;
  let dbPath;
  let app;
  let reviewerToken;
  const reviewerEmail = "llm-crawl-reviewer@test.local";

  before(async () => {
    process.env.INTELLIGENCE_REVIEWER_EMAILS = reviewerEmail;
    process.env.INTELLIGENCE_AUTO_PUBLISH = "0";
    process.env.INTELLIGENCE_LLM_SELECT = "1";
    process.env.DEEPSEEK_API_KEY = "";
    dir = mkdtempSync(join(tmpdir(), "llm-crawl-"));
    dbPath = join(dir, "db.json");
    writeFileSync(dbPath, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
    app = buildApp({ dataFile: dbPath });
    await app.ready();
    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: reviewerEmail, password: "secret12" },
    });
    assert.equal(reg.statusCode, 200);
    reviewerToken = reg.json().token;
  });

  after(async () => {
    await app.close();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    delete process.env.INTELLIGENCE_REVIEWER_EMAILS;
  });

  it("A1: new crawl is pending_review and not user-visible until approve", async () => {
    process.env.INTELLIGENCE_AUTO_PUBLISH = "0";
    const item = buildItemFromCrawl(
      {
        id: "hku-tuition",
        url: "https://www.hku.hk/fees",
        sourceId: "hku-official",
        schoolIds: ["hku"],
        infoType: "tuition",
      },
      { html: SAMPLE_HTML, finalUrl: "https://www.hku.hk/fees" }
    );
    assert.equal(item.reviewStatus, "pending_review");

    const store = createStore(dbPath);
    const { row } = store.upsertIntelligenceItemCrawl(item);
    assert.ok(row?.id);
    const published = store.listIntelligenceItems({ publishedOnly: true, limit: 50 });
    assert.equal(
      published.some((x) => x.id === row.id),
      false
    );
    const decide = await app.inject({
      method: "POST",
      url: "/api/v1/intelligence/review/decide",
      headers: { Authorization: `Bearer ${reviewerToken}` },
      payload: { item_id: row.id, decision: "approve" },
    });
    assert.equal(decide.statusCode, 200);
    const after = store.listIntelligenceItems({ publishedOnly: true, limit: 50 });
    assert.ok(after.some((x) => x.id === row.id));
  });

  it("A2: select caps at INTELLIGENCE_SELECT_MAX (heuristic without key)", async () => {
    process.env.INTELLIGENCE_SELECT_MAX = "3";
    process.env.DEEPSEEK_API_KEY = "";
    const feeds = buildCrawlFeeds();
    const r = await selectFeedsForCrawl(feeds, { useLlm: true, deepseekApiKey: "" });
    assert.ok(r.feeds.length <= 3);
    assert.ok(r.feeds.length <= getSelectMaxFeeds());
    assert.match(r.mode, /heuristic/);
    delete process.env.INTELLIGENCE_SELECT_MAX;
  });

  it("A3: discovered URL stays in candidate pool and is not crawlable until approve", () => {
    const store = createStore(dbPath);
    const url = "https://admissions.hku.hk/tpg/new-discovered-page";
    const up = store.upsertCrawlCandidate({
      feedId: feedIdForUrl(url),
      canonicalUrl: url,
      schoolId: "hku",
      sourceId: "hku-official",
      infoType: "admission",
      reason: "test",
      status: "pending",
    });
    assert.equal(up.row.status, "pending");
    const poolBefore = buildCrawlableFeedPool(store);
    assert.equal(
      poolBefore.some((f) => f.url === url),
      false
    );
    store.decideCrawlCandidate(up.row.id, "approve", reviewerEmail);
    const approvedFeeds = approvedCandidatesToFeeds(store.listCrawlCandidates({ status: "approved" }));
    assert.ok(approvedFeeds.some((f) => f.url === url));
    const poolAfter = buildCrawlableFeedPool(store);
    assert.ok(poolAfter.some((f) => f.url === url));
  });

  it("A4: host allowlist rejects off-domain links", () => {
    const allow = buildOfficialHostAllowlist();
    assert.equal(isUrlOnOfficialAllowlist("https://evil.example/page", allow), false);
    assert.equal(isUrlOnOfficialAllowlist("https://www.hku.hk/admissions", allow), true);
    const links = extractCandidateLinksFromHtml(
      `<a href="/fees">f</a><a href="https://evil.example/x">bad</a>`,
      "https://www.hku.hk/",
      allow
    );
    assert.ok(links.every((u) => u.includes("hku.hk")));
    assert.equal(links.some((u) => u.includes("evil")), false);
  });

  it("A4b: rejects image and static asset URLs even on official host", async () => {
    const { isCrawlableWebPageUrl } = await import("../src/intelligence/host-allowlist.js");
    assert.equal(isCrawlableWebPageUrl("https://www.hku.hk/logo.png"), false);
    assert.equal(isCrawlableWebPageUrl("https://www.hku.hk/banner.JPG?w=200"), false);
    assert.equal(isCrawlableWebPageUrl("https://www.hku.hk/assets/hero.webp"), false);
    assert.equal(isCrawlableWebPageUrl("data:image/png;base64,xxx"), false);
    assert.equal(isCrawlableWebPageUrl("https://www.hku.hk/admissions/tpg"), true);
    const allow = buildOfficialHostAllowlist();
    const links = extractCandidateLinksFromHtml(
      `<a href="/admissions">ok</a><a href="/img/cover.jpg">img</a><a href="https://www.hku.hk/static/a.svg">svg</a>`,
      "https://www.hku.hk/",
      allow
    );
    assert.ok(links.some((u) => /admissions/i.test(u)));
    assert.equal(links.some((u) => /\.(jpg|svg)(?:$|\?)/i.test(u)), false);
  });

  it("A5: without API key ingestion still works (mock path)", async () => {
    process.env.DEEPSEEK_API_KEY = "";
    const store = createStore(dbPath);
    loadCuratedSeedsIntoStore(store, { force: true });
    const result = await runIngestion(store, { fetchEnabled: false });
    assert.ok(result.itemsIngested >= 1);
  });

  it("A6: curated seeds remain published (auto-publish gate does not empty user intel)", () => {
    const store = createStore(dbPath);
    loadCuratedSeedsIntoStore(store, { force: true });
    const published = store.listIntelligenceItems({ publishedOnly: true, limit: 200 });
    assert.ok(published.length >= 50);
  });

  it("parseSelectFeedIds ignores unknown ids", () => {
    const feeds = [
      { id: "a", url: "https://www.hku.hk/a" },
      { id: "b", url: "https://www.hku.hk/b" },
    ];
    const selected = parseSelectFeedIds(JSON.stringify({ feedIds: ["b", "zzz", "a"] }), feeds, 2);
    assert.deepEqual(
      selected.map((f) => f.id),
      ["b", "a"]
    );
  });

  it("heuristic prefers never-updated feeds", () => {
    const feeds = [
      { id: "old", url: "https://www.hku.hk/1" },
      { id: "new", url: "https://www.hku.hk/2" },
    ];
    const items = [{ feedId: "new", updatedAt: new Date().toISOString() }];
    const picked = selectFeedsHeuristic(feeds, { max: 1, items });
    assert.equal(picked[0].id, "old");
  });

  it("admin decide candidate API", async () => {
    const store = createStore(dbPath);
    const url = "https://www.cuhk.edu.hk/english/llm-cand-api";
    const { row } = store.upsertCrawlCandidate({
      feedId: feedIdForUrl(url),
      canonicalUrl: url,
      schoolId: "cuhk",
      sourceId: "cuhk-official",
      infoType: "program",
      reason: "api",
    });
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/intelligence/admin/crawl-candidates?status=pending",
      headers: { Authorization: `Bearer ${reviewerToken}` },
    });
    assert.equal(list.statusCode, 200);
    assert.ok((list.json().items || []).some((x) => x.candidate_id === row.id));

    const decide = await app.inject({
      method: "POST",
      url: "/api/v1/intelligence/admin/crawl-candidates/decide",
      headers: { Authorization: `Bearer ${reviewerToken}` },
      payload: { candidate_id: row.id, decision: "approve" },
    });
    assert.equal(decide.statusCode, 200);
    assert.equal(decide.json().status, "approved");
  });

  it("collect with llm_select body accepted on mock ingestion path", async () => {
    const prevFetch = process.env.INTELLIGENCE_FETCH;
    process.env.INTELLIGENCE_FETCH = "0";
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/intelligence/admin/collect",
      headers: { Authorization: `Bearer ${reviewerToken}` },
      payload: { respect_preflight: true, llm_select: true, discover: false, max_feeds: 2 },
    });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().ok, true);
    if (prevFetch == null) delete process.env.INTELLIGENCE_FETCH;
    else process.env.INTELLIGENCE_FETCH = prevFetch;
  });
});
