import { loadSourcesRegistry, loadSchoolsRegistry } from "./source-registry.js";
import { syncFeedUrlsToStore, runIngestion } from "./ingestion-service.js";
import { isIntelligenceItemPublished } from "./normalization-service.js";
import { userCanReview, assertReviewer } from "./reviewer-auth.js";
import { searchIntelligenceItems } from "./searchItems.js";
import { getSchoolDetail, listSchoolCards } from "./schoolDashboard.js";

/**
 * @param {import("fastify").FastifyInstance} app
 * @param {{ store: ReturnType<import("../store.js").createStore>, auth: (req: import("fastify").FastifyRequest) => Promise<object> }} deps
 */
export function registerIntelligenceRoutes(app, deps) {
  const { store, auth } = deps;

  function mapItemForClient(item) {
    if (!item) return null;
    return {
      item_id: item.id,
      source_id: item.sourceId,
      review_status: item.reviewStatus,
      title_zh: item.locale?.titleZh || "",
      summary_zh: item.locale?.summaryZh || "",
      canonical_url: item.canonicalUrl,
      published_at: item.publishedAt,
      school_ids: item.schoolIds || [],
      info_type: item.infoType,
      product_curated: Boolean(item.productCurated),
      feed_id: item.feedId || null,
      content_hash: item.contentHash || null,
      structured: item.structured || null,
      content_text: item.locale?.contentText ? item.locale.contentText.slice(0, 2000) : null,
      last_snapshot_id: item.lastSnapshotId || null,
    };
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
      },
    };
  });

  app.post("/api/v1/intelligence/admin/collect", async (request) => {
    const user = await auth(request);
    assertReviewer(store, user);
    const result = await runIngestion(store, {});
    return {
      ok: true,
      items_ingested: result.itemsIngested,
      run_id: result.run?.id,
      fetch_enabled: result.fetchEnabled,
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
