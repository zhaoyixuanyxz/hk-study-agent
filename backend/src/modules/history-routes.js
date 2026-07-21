import { reportShareStatus } from "../store.js";

/**
 * @param {import("fastify").FastifyInstance} app
 * @param {ReturnType<import("./context.js").createAppContext>} ctx
 */
export function registerHistoryRoutes(app, ctx) {
  const { store, auth } = ctx;

  app.get("/api/v1/history", async (request) => {
    const user = await auth(request);
    const threads = store.listThreadsByUser(user.id).map((t) => ({
      thread_id: t.id,
      pinned: t.pinned === true,
      orchestration_state: t.orchestrationState,
      locale: t.locale === "en" ? "en" : "zh",
      created_at: t.createdAt,
      updated_at: t.updatedAt,
    }));
    const profile_snapshots = store.listProfileSnapshotsByUser(user.id).map((s) => ({
      snapshot_id: s.id,
      version: s.version,
      created_at: s.createdAt,
    }));
    const plans = store.listPlanResultsByUser(user.id).map((p) => ({
      plan_id: p.id,
      created_at: p.createdAt,
      snapshot_id: p.snapshotId,
      snapshot_version: p.snapshotVersion,
    }));
    const reports = store.listReportResultsByUser(user.id).map((r, i) => ({
      report_id: r.id,
      created_at: r.createdAt,
      plan_id: r.planId,
      word_count: r.wordCount,
      title: r.title || "",
      citation_count: Array.isArray(r.citations) ? r.citations.length : 0,
      is_latest: i === 0,
      share_status: reportShareStatus(r),
      share_view_count: r.share?.viewCount ?? 0,
      share_last_viewed_at: r.share?.lastViewedAt || null,
      share_url_path:
        reportShareStatus(r) === "active" && r.share?.token
          ? `/api/v1/public/reports/${encodeURIComponent(r.share.token)}`
          : null,
    }));
    return {
      threads,
      profile_snapshots,
      plans,
      reports,
    };
  });
}
