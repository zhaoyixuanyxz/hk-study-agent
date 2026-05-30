import { reportShareStatus } from "../store.js";
import {
  checkReportGenerationPreconditions,
  generateHtmlReport,
  getReportGenerationTimeoutMs,
} from "../report-service.js";
import { renderHtmlToPdf } from "../pdf-service.js";
import { buildCombinedIntelContext } from "../intelligence/intelContextPack.js";

/**
 * @param {import("fastify").FastifyInstance} app
 * @param {ReturnType<import("./context.js").createAppContext>} ctx
 */
export function registerReportRoutes(app, ctx) {
  const { store, auth } = ctx;

  app.post("/api/v1/reports/generate", async (request, reply) => {
    const user = await auth(request);
    const body = request.body || {};
    const planIdHint = body.plan_id ? String(body.plan_id).trim() : "";

    const latest = store.getLatestProfileSnapshot(user.id);
    let planRow = null;
    if (planIdHint) {
      planRow = store.getPlanResult(planIdHint, user.id);
    } else {
      const plans = store.listPlanResultsByUser(user.id);
      planRow = plans[0] || null;
    }

    const pre = checkReportGenerationPreconditions(latest, planRow);
    if (!pre.ok) {
      return reply.status(400).send({
        ok: false,
        code: pre.code,
        message: pre.message,
        retryable: pre.retryable,
        suggestion: pre.suggestion,
        meta: pre.meta,
      });
    }

    const key = (process.env.DEEPSEEK_API_KEY || "").trim();
    const useMock = !key;
    const timeoutMs = getReportGenerationTimeoutMs();

    const intelPack = buildCombinedIntelContext(store, {
      snapshot: latest.snapshot,
      planInputView: latest.planInputView,
      userMessage: [
        planRow.plan?.risk_summary,
        planRow.plan?.timeline_suggestion,
        planRow.plan?.budget_suggestion,
      ]
        .filter(Boolean)
        .join(" "),
      forPlanOrReport: true,
      limit: 12,
    });

    const gen = await generateHtmlReport(latest.snapshot, planRow.plan, {
      useMock,
      deepseekApiKey: key,
      deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      timeoutMs,
      intelContextText: intelPack.text,
      intelItems: intelPack.items,
      extKbEntries: intelPack.extKbEntries,
    });

    if (!gen.ok) {
      return reply.status(502).send({
        ok: false,
        code: gen.code,
        message: gen.message,
        retryable: gen.retryable,
        suggestion: gen.suggestion,
      });
    }

    const saved = store.appendReportResult({
      userId: user.id,
      planId: planRow.id,
      snapshotId: planRow.snapshotId || latest.id,
      snapshotVersion: planRow.snapshotVersion ?? latest.version,
      reportSchemaVersion: String(gen.report.schemaVersion || "2.0"),
      title: gen.report.title || "",
      html: gen.report.html,
      citations: Array.isArray(gen.report.citations) ? gen.report.citations : [],
      visuals: gen.report.visuals || null,
      chapterCount: 7,
      wordCount: gen.report.wordCount,
    });

    return {
      ok: true,
      report_id: saved.id,
      plan_id: planRow.id,
      snapshot_id: saved.snapshotId,
      snapshot_version: saved.snapshotVersion,
      word_count: saved.wordCount,
      title: gen.report.title,
      citation_count: saved.citations?.length ?? 0,
      html: gen.report.html,
    };
  });

  app.get("/api/v1/reports", async (request) => {
    const user = await auth(request);
    const list = store.listReportResultsByUser(user.id);
    return {
      reports: list.map((r, i) => ({
        report_id: r.id,
        created_at: r.createdAt,
        plan_id: r.planId,
        snapshot_id: r.snapshotId,
        snapshot_version: r.snapshotVersion,
        word_count: r.wordCount,
        chapter_count: r.chapterCount,
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
      })),
    };
  });

  app.get("/api/v1/reports/:reportId/pdf", async (request, reply) => {
    const user = await auth(request);
    const r = store.getReportResult(request.params.reportId, user.id);
    if (!r) {
      const err = new Error("not_found");
      err.statusCode = 404;
      err.payload = { code: "report_not_found", message: "报告不存在或无权访问" };
      throw err;
    }
    try {
      const buf = await renderHtmlToPdf(r.html);
      const safe = String(r.id).replace(/[^\w-]/g, "").slice(0, 12) || "report";
      reply.header("Content-Type", "application/pdf");
      reply.header("Content-Disposition", `attachment; filename="report-${safe}.pdf"`);
      return reply.send(buf);
    } catch (e) {
      const code = e && e.code;
      if (code === "PDF_DISABLED" || code === "PUPPETEER_UNAVAILABLE" || code === "PUPPETEER_LAUNCH_FAILED") {
        return reply.status(501).send({
          ok: false,
          code: code || "pdf_unavailable",
          message: "当前环境无法生成 PDF。可配置 Chromium 或将 PDF_DISABLED 设为 0 后重试。",
        });
      }
      throw e;
    }
  });

  app.post("/api/v1/reports/:reportId/share", async (request) => {
    const user = await auth(request);
    const out = store.enableReportShare(request.params.reportId, user.id);
    if (!out) {
      const err = new Error("not_found");
      err.statusCode = 404;
      err.payload = { code: "report_not_found", message: "报告不存在或无权访问" };
      throw err;
    }
    return {
      ok: true,
      share_token: out.token,
      url_path: `/api/v1/public/reports/${encodeURIComponent(out.token)}`,
      created_at: out.createdAt,
    };
  });

  app.delete("/api/v1/reports/:reportId/share", async (request) => {
    const user = await auth(request);
    const ok = store.revokeReportShare(request.params.reportId, user.id);
    if (!ok) {
      const err = new Error("not_found");
      err.statusCode = 404;
      err.payload = { code: "report_not_found", message: "报告不存在或无权访问" };
      throw err;
    }
    return { ok: true, disabled: true };
  });

  app.get("/api/v1/reports/:reportId", async (request) => {
    const user = await auth(request);
    const r = store.getReportResult(request.params.reportId, user.id);
    if (!r) {
      const err = new Error("not_found");
      err.statusCode = 404;
      err.payload = { code: "report_not_found", message: "报告不存在或无权访问" };
      throw err;
    }
    return {
      ok: true,
      report_id: r.id,
      created_at: r.createdAt,
      plan_id: r.planId,
      snapshot_id: r.snapshotId,
      snapshot_version: r.snapshotVersion,
      report_schema_version: r.reportSchemaVersion,
      word_count: r.wordCount,
      chapter_count: r.chapterCount,
      title: r.title || "",
      citation_count: Array.isArray(r.citations) ? r.citations.length : 0,
      citations: Array.isArray(r.citations) ? r.citations : [],
      share_status: reportShareStatus(r),
      share_view_count: r.share?.viewCount ?? 0,
      share_last_viewed_at: r.share?.lastViewedAt || null,
      share_url_path:
        reportShareStatus(r) === "active" && r.share?.token
          ? `/api/v1/public/reports/${encodeURIComponent(r.share.token)}`
          : null,
      html: r.html,
      visuals: r.visuals || null,
    };
  });
}
