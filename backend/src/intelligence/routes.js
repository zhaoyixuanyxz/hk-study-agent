import { loadSourcesRegistry, loadSchoolsRegistry } from "./source-registry.js";
import { syncFeedUrlsToStore, runIngestion } from "./ingestion-service.js";
import { isIntelligenceItemPublished } from "./normalization-service.js";
import { userCanReview, assertReviewer } from "./reviewer-auth.js";
import { searchIntelligenceItems } from "./searchItems.js";
import { getSchoolDetail, listSchoolCards } from "./schoolDashboard.js";
import {
  loadPreflightLast,
  runFeedPreflight,
  savePreflightLast,
} from "./url-preflight.js";
import { buildCrawlFeeds } from "./crawl-registry.js";
import { loadFeedUrlsFile } from "./ingestion-service.js";
import { mapIntelligenceItemForClient } from "./item-dto.js";

/**
 * @param {import("fastify").FastifyInstance} app
 * @param {{ store: ReturnType<import("../store.js").createStore>, auth: (req: import("fastify").FastifyRequest) => Promise<object> }} deps
 */
export function registerIntelligenceRoutes(app, deps) {
  const { store, auth } = deps;

  function mapItemForClient(item) {
    return mapIntelligenceItemForClient(item);
  }

  app.get("/api/v1/intelligence/items", async (request) => {
    await auth(request);
    const schoolId = String(request.query?.school_id || "").trim();
    const items = store.listIntelligenceItems({
      publishedOnly: true,
      schoolId: schoolId || undefined,
      limit: Number(request.query?.limit) || 50,
    });
    return { items: items.map(mapItemForClient) };
  });

  app.get("/api/v1/intelligence/search", async (request) => {
    await auth(request);
    const result = searchIntelligenceItems(store, {
      q: request.query?.q,
      schoolId: request.query?.school_id,
      infoType: request.query?.info_type,
      programTag: request.query?.program_tag,
      limit: request.query?.limit,
      offset: request.query?.offset,
    });
    return {
      items: result.items.map(mapItemForClient),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  });

  app.get("/api/v1/intelligence/schools", async (request) => {
    await auth(request);
    return { schools: listSchoolCards(store) };
  });

  app.get("/api/v1/intelligence/schools/:schoolId", async (request, reply) => {
    await auth(request);
    const detail = getSchoolDetail(store, request.params.schoolId);
    if (!detail) {
      return reply.status(404).send({ code: "not_found", message: "院校不存在" });
    }
    return {
      school: detail.school,
      overview: detail.overview,
      latest_items: detail.latest_items.map(mapItemForClient),
      timeline: detail.timeline,
    };
  });

  app.get("/api/v1/intelligence/review/status", async (request) => {
    const user = await auth(request);
    return { can_review: userCanReview(store, user) };
  });

  app.get("/api/v1/intelligence/review/queue", async (request) => {
    const user = await auth(request);
    assertReviewer(store, user);
    const status = String(request.query?.status || "pending_review").trim();
    const rows = store.listIntelligenceItemsByReviewStatus({ reviewStatus: status, limit: 100 });
    return {
      items: rows.map((item) => ({
        ...mapItemForClient(item),
        machine_summary_zh: item.locale?.summaryZh || "",
      })),
    };
  });

  app.post("/api/v1/intelligence/review/decide", async (request, reply) => {
    const user = await auth(request);
    assertReviewer(store, user);
    const itemId = String(request.body?.item_id || request.body?.itemId || "").trim();
    const decision = String(request.body?.decision || "").trim();
    if (!itemId || !["approve", "reject"].includes(decision)) {
      return reply.status(400).send({ code: "bad_request", message: "item_id 与 decision(approve|reject) 必填" });
    }
    const row = store.decideIntelligenceItemReview(itemId, {
      decision,
      reviewerEmail: user.email,
      rejectionReason: request.body?.rejection_reason,
    });
    if (!row) {
      return reply.status(404).send({ code: "not_found", message: "情报条目不存在" });
    }
    return { ok: true, item: mapItemForClient(row) };
  });

  app.get("/api/v1/intelligence/admin/workspace", async (request) => {
    const user = await auth(request);
    assertReviewer(store, user);
    syncFeedUrlsToStore(store);
    const { sources } = loadSourcesRegistry();
    const { schools } = loadSchoolsRegistry();
    return {
      feeds: store.listIntelligenceFeedUrls(),
      reviewers: store.listIntelligenceReviewerEmails(),
      sources,
      schools,
      stats: {
        pending_review: store.listIntelligenceItemsByReviewStatus({ reviewStatus: "pending_review", limit: 500 })
          .length,
        published: store.listIntelligenceItems({ publishedOnly: true, limit: 5000 }).length,
        crawl_candidates_pending: store.listCrawlCandidates({ status: "pending", limit: 500 }).length,
      },
    };
  });

  app.get("/api/v1/intelligence/admin/preflight-last", async (request) => {
    const user = await auth(request);
    assertReviewer(store, user);
    const last = loadPreflightLast();
    if (!last) {
      return { ok: true, empty: true, ran_at: null, total: 0, failed_count: 0, failures: [] };
    }
    return {
      ok: true,
      empty: false,
      ran_at: last.ranAt,
      total: last.total,
      ok_count: last.okCount,
      failed_count: last.failedCount,
      slow_count: last.slowCount,
      failures: last.failures || [],
    };
  });

  app.post("/api/v1/intelligence/admin/preflight-urls", async (request) => {
    const user = await auth(request);
    assertReviewer(store, user);
    const fileFeeds = loadFeedUrlsFile().feeds;
    const feeds = fileFeeds.length ? fileFeeds : buildCrawlFeeds();
    const summary = await runFeedPreflight({ feeds, concurrency: 4 });
    savePreflightLast(summary);
    return {
      ok: true,
      ran_at: summary.ranAt,
      total: summary.total,
      ok_count: summary.okCount,
      failed_count: summary.failedCount,
      slow_count: summary.slowCount,
      failures: summary.failures,
    };
  });

  app.post("/api/v1/intelligence/admin/collect", async (request) => {
    const user = await auth(request);
    assertReviewer(store, user);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const respectPreflight = body.respect_preflight !== false && body.respectPreflight !== false;
    const discoverOnly = body.discover_only === true || body.discoverOnly === true;
    const discover =
      body.discover === true || body.discover === "1" || process.env.INTELLIGENCE_LLM_DISCOVER === "1";
    const llmSelect =
      body.llm_select !== false &&
      body.llmSelect !== false &&
      String(process.env.INTELLIGENCE_LLM_SELECT ?? "1") !== "0";
    const maxFeeds = body.max_feeds ?? body.maxFeeds;
    const result = await runIngestion(store, {
      respectPreflight,
      llmSelect,
      discover: discoverOnly ? false : discover,
      discoverOnly,
      maxFetch: maxFeeds != null ? Number(maxFeeds) : undefined,
    });
    return {
      ok: true,
      items_ingested: result.itemsIngested,
      items_updated: result.itemsUpdated ?? 0,
      items_skipped_quality: result.itemsSkippedQuality ?? 0,
      skipped_preflight: result.skippedPreflight ?? 0,
      skipped_feeds: result.skippedFeeds ?? [],
      run_id: result.run?.id,
      fetch_enabled: result.fetchEnabled,
      mode: result.mode,
      select: result.select || null,
      discover: result.discover
        ? { created: result.discover.created, errors: (result.discover.errors || []).slice(0, 5) }
        : null,
      errors: (result.errors || []).slice(0, 10),
    };
  });

  app.get("/api/v1/intelligence/admin/crawl-candidates", async (request) => {
    const user = await auth(request);
    assertReviewer(store, user);
    const status = String(request.query?.status || "pending").trim();
    const rows = store.listCrawlCandidates({ status: status === "all" ? "" : status, limit: 100 });
    return {
      items: rows.map((c) => ({
        candidate_id: c.id,
        feed_id: c.feedId,
        url: c.canonicalUrl,
        school_id: c.schoolId,
        source_id: c.sourceId,
        info_type: c.infoType,
        reason: c.reason,
        status: c.status,
        seed_url: c.seedUrl,
        discovered_at: c.discoveredAt,
      })),
    };
  });

  app.post("/api/v1/intelligence/admin/crawl-candidates/decide", async (request, reply) => {
    const user = await auth(request);
    assertReviewer(store, user);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const candidateId = String(body.candidate_id || body.candidateId || "").trim();
    const decision = String(body.decision || "").trim();
    if (!candidateId || !["approve", "reject"].includes(decision)) {
      return reply.status(400).send({ code: "bad_request", message: "candidate_id 与 decision(approve|reject) 必填" });
    }
    const row = store.decideCrawlCandidate(candidateId, decision, user.email);
    if (!row) {
      return reply.status(404).send({ code: "not_found", message: "候选不存在" });
    }
    return {
      ok: true,
      candidate_id: row.id,
      status: row.status,
      feed_id: row.feedId,
      url: row.canonicalUrl,
    };
  });

  app.post("/api/v1/intelligence/admin/bootstrap-reviewer", async (request, reply) => {
    const user = await auth(request);
    const email = String(user.email || "").trim().toLowerCase();
    if (!email) {
      return reply.status(400).send({ code: "bad_request", message: "当前账号无邮箱，无法成为审核员" });
    }
    const envReviewers = String(process.env.INTELLIGENCE_REVIEWER_EMAILS || "").trim();
    const existing = store.listIntelligenceReviewerEmails();
    if (envReviewers || existing.length > 0) {
      if (!userCanReview(store, user)) {
        return reply.status(403).send({ code: "forbidden", message: "已有审核员配置，且当前用户不在名单中" });
      }
      return { ok: true, email, already: true };
    }
    store.addIntelligenceReviewerEmail(email);
    return { ok: true, email, bootstrapped: true };
  });
}

export { isIntelligenceItemPublished };
