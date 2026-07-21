import { refreshUserProfileSnapshot } from "../phase2-pipeline.js";
import { normalizeLocale, resolveThreadLocale } from "../output-locale.js";

/**
 * @param {import("fastify").FastifyInstance} app
 * @param {ReturnType<import("./context.js").createAppContext>} ctx
 */
export function registerProfileRoutes(app, ctx) {
  const { store, auth, buildLiveProfileBundle } = ctx;

  app.get("/api/v1/profile", async (request) => {
    const user = await auth(request);
    const threadId = request.query?.thread_id ? String(request.query.thread_id).trim() : "";
    const bundle = buildLiveProfileBundle(user.id, threadId || undefined);
    return {
      snapshot: bundle.snapshot,
      plan_input_view: bundle.plan_input_view,
      snapshot_version: bundle.snapshot_version,
      snapshot_id: bundle.snapshot_id,
      profile_view: bundle.profile_view,
      memories: bundle.memories,
    };
  });

  app.get("/api/v1/profile/snapshot", async (request) => {
    const user = await auth(request);
    const threadId = request.query?.thread_id ? String(request.query.thread_id).trim() : "";
    const bundle = buildLiveProfileBundle(user.id, threadId || undefined);
    if (!bundle.snapshot) {
      return {
        snapshot: null,
        version: null,
        id: null,
      };
    }
    return {
      id: bundle.snapshot_id,
      version: bundle.snapshot_version,
      created_at: bundle.snapshot_created_at,
      snapshot: bundle.snapshot,
    };
  });

  app.delete("/api/v1/profile/snapshots/:snapshotId", async (request) => {
    const user = await auth(request);
    const ok = store.deleteProfileSnapshotForUser(user.id, request.params.snapshotId);
    if (!ok) {
      const err = new Error("not_found");
      err.statusCode = 404;
      err.payload = { code: "snapshot_not_found", message: "档案快照不存在或无权访问" };
      throw err;
    }
    return { ok: true };
  });

  app.post("/api/v1/profile/full-reset", async (request, reply) => {
    const user = await auth(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    if (body.confirm !== true) {
      return reply.status(400).send({
        code: "bad_request",
        message: "请在请求 JSON 中设置 confirm: true 以确认清空建档数据（不可恢复）。",
      });
    }
    const removed = store.purgeUserStudyArchive(user.id);
    const locale = normalizeLocale(body.locale);
    const t = store.createThread(user.id, { locale });
    return {
      ok: true,
      thread_id: t.id,
      orchestration_state: t.orchestrationState,
      locale: resolveThreadLocale(t),
      removed,
    };
  });

  app.get("/api/v1/profile/plan-input", async (request) => {
    const user = await auth(request);
    const threadId = request.query?.thread_id ? String(request.query.thread_id).trim() : "";
    const bundle = buildLiveProfileBundle(user.id, threadId || undefined);
    return {
      plan_input_view: bundle.plan_input_view,
      snapshot_version: bundle.snapshot_version,
    };
  });

  app.get("/api/v1/profile/memories", async (request) => {
    const user = await auth(request);
    const threadId = request.query?.thread_id ? String(request.query.thread_id).trim() : "";
    const memories = threadId
      ? store.listMemoriesByThread(user.id, threadId)
      : store.listMemoriesByUser(user.id);
    return memories.map((m) => ({
      id: m.id,
      kind: m.kind,
      key: m.key,
      value: m.value,
      thread_id: m.threadId,
      updated_at: m.updatedAt,
    }));
  });

  app.post("/api/v1/profile/confirmations/:factId", async (request, reply) => {
    const user = await auth(request);
    const factId = String(request.params.factId || "");
    const key = factId.startsWith("fact_") ? factId.slice("fact_".length) : factId;
    if (!key) {
      return reply.status(400).send({ code: "bad_request", message: "无效的 factId" });
    }
    const body = request.body || {};
    const memories = store.listMemoriesByUser(user.id);
    const m = memories.find((x) => x.key === key);
    if (!m) {
      const err = new Error("not_found");
      err.statusCode = 404;
      err.payload = { code: "fact_not_found", message: "未找到对应记忆项" };
      throw err;
    }
    const newValue = body.value !== undefined ? String(body.value) : m.value;
    store.upsertMemory({
      userId: user.id,
      threadId: m.threadId || null,
      kind: "confirmed",
      key,
      value: newValue,
    });
    const out = refreshUserProfileSnapshot(store, user.id, m.threadId || null);
    return {
      ok: true,
      snapshot: out.snapshot,
      plan_input_view: out.planInputView,
    };
  });
}
