import {
  checkPlanGenerationPreconditions,
  generateStructuredPlan,
  getPlanGenerationTimeoutMs,
} from "../planning-service.js";
import { recordPlanGenerateRequest, getPlanGenerateMetricsSnapshot } from "../plan-generation-metrics.js";
import { buildReportReadiness } from "../report-readiness.js";
import { buildCombinedIntelContext } from "../intelligence/intelContextPack.js";
import { logPlanGenerationFailure } from "./context.js";

/**
 * @param {import("fastify").FastifyInstance} app
 * @param {ReturnType<import("./context.js").createAppContext>} ctx
 */
export function registerPlanRoutes(app, ctx) {
  const { store, auth } = ctx;

  app.post("/api/v1/plans/generate", async (request, reply) => {
    const started = Date.now();
    const user = await auth(request);
    const latest = store.getLatestProfileSnapshot(user.id);
    const pre = checkPlanGenerationPreconditions(latest);
    if (!pre.ok) {
      recordPlanGenerateRequest({
        outcome: "failure",
        code: pre.code,
        duration_ms: Date.now() - started,
      });
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
    const piv = latest.planInputView;
    const timeoutMs = getPlanGenerationTimeoutMs();

    const intelPack = buildCombinedIntelContext(store, {
      snapshot: latest.snapshot,
      planInputView: piv,
      forPlanOrReport: true,
      limit: 12,
    });

    const gen = await generateStructuredPlan(piv, {
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
      const duration_ms = Date.now() - started;
      recordPlanGenerateRequest({ outcome: "failure", code: gen.code, duration_ms });
      logPlanGenerationFailure({
        code: gen.code,
        retryable: gen.retryable,
        use_mock: useMock,
        duration_ms,
      });
      return reply.status(502).send({
        ok: false,
        code: gen.code,
        message: gen.message,
        retryable: gen.retryable,
        suggestion: gen.suggestion,
      });
    }

    const saved = store.appendPlanResult({
      userId: user.id,
      snapshotId: latest.id,
      snapshotVersion: latest.version,
      planInputSchemaVersion: String(piv.schemaVersion || "1.0"),
      plan: gen.plan,
    });

    recordPlanGenerateRequest({
      outcome: "success",
      code: "SUCCESS",
      duration_ms: Date.now() - started,
    });

    return {
      ok: true,
      plan_id: saved.id,
      snapshot_id: latest.id,
      snapshot_version: latest.version,
      plan_input_schema_version: saved.planInputSchemaVersion,
      plan: gen.plan,
    };
  });

  app.get("/api/v1/internal/plan-generation/metrics", async (request, reply) => {
    const secret = (process.env.PLAN_METRICS_HTTP_TOKEN || "").trim();
    if (!secret) {
      return reply.status(404).send({ code: "not_found", message: "Not found" });
    }
    const token = request.headers["x-plan-metrics-token"];
    if (typeof token !== "string" || token !== secret) {
      return reply.status(404).send({ code: "not_found", message: "Not found" });
    }
    return getPlanGenerateMetricsSnapshot();
  });

  app.get("/api/v1/plans", async (request) => {
    const user = await auth(request);
    const list = store.listPlanResultsByUser(user.id);
    return {
      plans: list.map((p) => ({
        plan_id: p.id,
        created_at: p.createdAt,
        snapshot_id: p.snapshotId,
        snapshot_version: p.snapshotVersion,
      })),
    };
  });

  app.get("/api/v1/plans/:planId", async (request) => {
    const user = await auth(request);
    const p = store.getPlanResult(request.params.planId, user.id);
    if (!p) {
      const err = new Error("not_found");
      err.statusCode = 404;
      err.payload = { code: "plan_not_found", message: "方案不存在或无权访问" };
      throw err;
    }
    let snapRow = null;
    if (p.snapshotId) snapRow = store.getProfileSnapshot(p.snapshotId, user.id);
    if (!snapRow) snapRow = store.getLatestProfileSnapshot(user.id);
    const report_readiness = buildReportReadiness(snapRow?.snapshot || null, snapRow?.planInputView || null);
    return {
      ok: true,
      plan_id: p.id,
      created_at: p.createdAt,
      snapshot_id: p.snapshotId,
      snapshot_version: p.snapshotVersion,
      plan_input_schema_version: p.planInputSchemaVersion,
      plan: p.plan,
      report_readiness,
      profile_snapshot_resolved_id: snapRow?.id ?? null,
    };
  });
}
