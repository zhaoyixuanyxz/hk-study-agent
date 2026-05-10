import Fastify from "fastify";
import cors from "@fastify/cors";
import { createStore, reportShareStatus } from "./store.js";
import { runProfileAgent } from "./agent.js";
import { nextOrchestrationState } from "./orchestrator.js";
import { runPhase2Pipeline, refreshUserProfileSnapshot } from "./phase2-pipeline.js";
import {
  checkPlanGenerationPreconditions,
  generateStructuredPlan,
  getPlanGenerationTimeoutMs,
} from "./planning-service.js";
import {
  checkReportGenerationPreconditions,
  generateHtmlReport,
  getReportGenerationTimeoutMs,
} from "./report-service.js";
import { renderHtmlToPdf } from "./pdf-service.js";
import { recordPlanGenerateRequest, getPlanGenerateMetricsSnapshot } from "./plan-generation-metrics.js";
import { buildProfileProgress } from "./profile-progress.js";
import { buildProfileViewModel } from "./profile-view.js";
import { hydrateProfileSnapshotFromMemories } from "./profile-service.js";
import { buildPlanInputView } from "./plan-input-service.js";
import { buildReportReadiness } from "./report-readiness.js";

function logPlanGenerationFailure(payload) {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      scope: "plan_generation",
      level: "error",
      ...payload,
    })
  );
}

function escapeHtmlAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function createRateLimitGuard() {
  const hits = new Map();
  const windowMs = 60_000;
  return function rateLimitHook(request, reply, done) {
    const max = Number(process.env.APP_RATE_LIMIT_MAX || 0);
    if (!max || max <= 0 || !String(request.url || "").startsWith("/api/")) {
      done();
      return;
    }
    const k = request.ip || "unknown";
    const now = Date.now();
    let bucket = hits.get(k);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, n: 1 };
    } else {
      bucket.n += 1;
    }
    hits.set(k, bucket);
    if (bucket.n > max) {
      reply.status(429).send({ code: "rate_limit", message: "璇锋眰杩囦簬棰戠箒锛岃绋嶅悗鍐嶈瘯" });
      return;
    }
    done();
  };
}

export function buildApp(options = {}) {
  const store = createStore(options.dataFile);
  const app = Fastify({ logger: false });

  if (process.env.ENABLE_ACCESS_LOG === "1") {
    app.addHook("onRequest", (request, _reply, done) => {
      request._accessStart = Date.now();
      done();
    });
    app.addHook("onResponse", (request, reply, done) => {
      const line = {
        ts: new Date().toISOString(),
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        ms: Date.now() - (request._accessStart || Date.now()),
      };
      console.error(JSON.stringify(line));
      done();
    });
  }

  app.addHook("onRequest", createRateLimitGuard());

  const corsOrigins = (process.env.CORS_ORIGINS || "http://127.0.0.1:5180,http://localhost:5180")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.register(cors, { origin: corsOrigins.length ? corsOrigins : true, credentials: true });

  async function auth(request) {
    const h = request.headers.authorization;
    if (!h || !h.startsWith("Bearer ")) {
      const err = new Error("unauthorized");
      err.statusCode = 401;
      err.payload = { code: "unauthorized", message: "缂哄皯 Bearer Token" };
      throw err;
    }
    const token = h.slice("Bearer ".length).trim();
    const user = store.getUserByToken(token);
    if (!user) {
      const err = new Error("invalid_token");
      err.statusCode = 401;
      err.payload = { code: "invalid_token", message: "鏃犳晥 Token" };
      throw err;
    }
    return user;
  }

  function memoryContextForTurn(userId, userMessage) {
    const chunks = store.searchSemanticChunks(userId, userMessage, 4);
    if (!chunks.length) return "";
    return chunks.map((c) => c.text).join("\n---\n");
  }

  /**
   * 读侧：用当前记忆重算 confirmationState，避免删会话后磁盘快照内嵌的待确认项与记忆脱节。
   */
  function buildLiveProfileBundle(userId) {
    const latestRow = store.getLatestProfileSnapshot(userId);
    const memories = store.listMemoriesByUser(userId);
    const memSlice = memories.slice(0, 200);
    const memForPivot = memSlice.map((m) => ({
      kind: m.kind,
      key: m.key,
      value: m.value,
    }));
    const memoriesApi = memSlice.map((m) => ({
      id: m.id,
      kind: m.kind,
      key: m.key,
      value: m.value,
      updated_at: m.updatedAt,
    }));

    if (!latestRow && memSlice.length === 0) {
      return {
        snapshot: null,
        plan_input_view: null,
        snapshot_version: null,
        snapshot_id: null,
        snapshot_created_at: null,
        profile_view: buildProfileViewModel(null, [], null),
        memories: [],
      };
    }

    const frozen = latestRow?.snapshot || null;
    const snapshot = hydrateProfileSnapshotFromMemories(frozen, memSlice);
    const piv = snapshot ? buildPlanInputView(snapshot, memForPivot) : null;
    const profile_view = buildProfileViewModel(snapshot, memSlice, piv);

    return {
      snapshot,
      plan_input_view: piv,
      snapshot_version: latestRow?.version ?? null,
      snapshot_id: latestRow?.id ?? null,
      snapshot_created_at: latestRow?.createdAt ?? null,
      profile_view,
      memories: memoriesApi,
    };
  }

  /**
   * 用户「纠正上一条」时粗粒度撤销本轮 Phase2：语义块前缀 + 本会话最新一条快照；
   * 记忆与会话摘要不尝试逐字段回滚，由重跑抽取自然收敛。
   */
  function rollbackRoughPhase2ForReplaceTurn(threadId, userId, typoUserContent) {
    const prefix = `用户：${String(typoUserContent || "").trim()}\n`;
    if (prefix.length > 4)
      store.deleteSemanticChunksStartingWith(userId, threadId, prefix);
    store.deleteLatestProfileSnapshotForThread(userId, threadId);
  }

  app.setErrorHandler((err, request, reply) => {
    if (err.statusCode === 401) {
      return reply.status(401).send({ code: err.payload?.code || "unauthorized", message: err.payload?.message || err.message });
    }
    if (err.statusCode === 404) {
      return reply.status(404).send({ code: err.payload?.code || "not_found", message: err.payload?.message || err.message });
    }
    if (err.statusCode === 403) {
      return reply.status(403).send({ code: err.payload?.code || "forbidden", message: err.payload?.message || err.message });
    }
    if (err.statusCode === 400 && err.payload && typeof err.payload === "object") {
      return reply.status(400).send(err.payload);
    }
    if (err.statusCode === 502 && err.payload && typeof err.payload === "object") {
      return reply.status(502).send(err.payload);
    }
    if (err.statusCode === 501 && err.payload && typeof err.payload === "object") {
      return reply.status(501).send(err.payload);
    }
    request.log.error(err);
    return reply.status(500).send({ code: "internal_error", message: "服务器错误" });
  });

  app.get("/health", async () => ({ status: "ok" }));

  /** 公开分享路由放在匿名 /auth 业务路由之前，避免被其它 `/api/v1/...` 中间件误伤；仅返回 HTML，不输出 userId / report 私有元数据。 */
  app.get("/api/v1/public/reports/:shareToken", async (request, reply) => {
    const shareToken = String(request.params.shareToken || "").trim();
    const row = store.getReportByShareToken(shareToken);
    if (!row) {
      return reply
        .status(404)
        .type("text/html; charset=utf-8")
        .send(
          "<!DOCTYPE html><html lang=\"zh-Hans\"><head><meta charset=\"utf-8\"/><title>报告不可用</title></head><body><p>分享链接已关闭或无效。</p></body></html>"
        );
    }
    store.incrementReportShareView(row.id);
    const title = escapeHtmlAttr((row.title && String(row.title).trim()) || "留学规划报告");
    const banner = `<div class="share-privacy-banner" role="alert" style="background:#fff3cd;border:1px solid #856404;padding:12px 14px;margin-bottom:16px;font-family:system-ui,sans-serif;font-size:14px;line-height:1.55;color:#333"><strong>隐私提示：</strong>本页含个人留学申请相关信息，仅供受邀阅读；请勿转发给无关第三方。</div>`;
    const doc = `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  body { font-family: system-ui, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; margin: 16px 20px 40px; line-height: 1.55; color: #111; }
  .report-chapter { margin-bottom: 1.2rem; }
  .report-chapter h2 { font-size: 1.15rem; }
  a { color: #1565c0; }
</style>
</head>
<body>${banner}${row.html}</body>
</html>`;
    return reply.type("text/html; charset=utf-8").send(doc);
  });

  app.post("/api/v1/users/register", async () => {
    const u = store.createUser();
    return { user_id: u.id, token: u.token };
  });

  app.post("/api/v1/auth/register", async (request, reply) => {
    const email = String(request.body?.email || "").trim();
    const password = String(request.body?.password || "");
    if (!email || !password || password.length < 6) {
      return reply.status(400).send({
        code: "bad_request",
        message: "邮箱与密码必填，密码至少 6 位",
      });
    }
    const out = store.registerUserWithEmailPassword(email, password);
    if (!out.ok) {
      return reply.status(409).send({ code: "EMAIL_TAKEN", message: "璇ラ偖绠卞凡娉ㄥ唽" });
    }
    return { user_id: out.id, token: out.token };
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    const email = String(request.body?.email || "").trim();
    const password = String(request.body?.password || "");
    const out = store.loginWithEmailPassword(email, password);
    if (!out.ok) {
      return reply.status(401).send({ code: out.code, message: "邮箱或密码错误" });
    }
    return { user_id: out.id, token: out.token };
  });

  app.post("/api/v1/analytics/events", async (request, reply) => {
    const user = await auth(request);
    const raw = request.body?.events;
    const list = Array.isArray(raw) ? raw : request.body?.name ? [request.body] : [];
    const events = list
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        name: String(x.name || "").slice(0, 120),
        props: x.props && typeof x.props === "object" ? x.props : {},
      }))
      .filter((x) => x.name);
    if (!events.length) {
      return reply.status(400).send({ code: "bad_request", message: "events 涓嶈兘涓虹┖" });
    }
    const { count } = store.appendAnalyticsEvents(user.id, events);
    return { ok: true, accepted: count };
  });

  app.post("/api/v1/threads", async (request) => {
    const user = await auth(request);
    const t = store.createThread(user.id);
    return { thread_id: t.id, orchestration_state: t.orchestrationState };
  });

  app.get("/api/v1/threads/:threadId", async (request) => {
    const user = await auth(request);
    const t = store.getThread(request.params.threadId, user.id);
    if (!t) {
      const err = new Error("not_found");
      err.statusCode = 404;
      err.payload = { code: "thread_not_found", message: "浼氳瘽涓嶅瓨鍦ㄦ垨鏃犳潈璁块棶" };
      throw err;
    }
    const messages = store.listMessages(t.id);
    return {
      id: t.id,
      pinned: t.pinned === true,
      orchestration_state: t.orchestrationState,
      updated_at: t.updatedAt,
      created_at: t.createdAt,
      messages: messages.map((m) => {
        const row = {
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.createdAt,
        };
        if (m.meta && typeof m.meta === "object") row.meta = m.meta;
        return row;
      }),
    };
  });

  app.patch("/api/v1/threads/:threadId", async (request, reply) => {
    const user = await auth(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    if (typeof body.pinned !== "boolean") {
      return reply.status(400).send({ code: "bad_request", message: "body.pinned 必须为布尔值" });
    }
    const ok = store.setThreadPinned(user.id, request.params.threadId, body.pinned);
    if (!ok) {
      const err = new Error("not_found");
      err.statusCode = 404;
      err.payload = { code: "thread_not_found", message: "浼氳瘽涓嶅瓨鍦ㄦ垨鏃犳潈璁块棶" };
      throw err;
    }
    const t = store.getThread(request.params.threadId, user.id);
    return {
      ok: true,
      thread_id: t.id,
      pinned: t.pinned === true,
      orchestration_state: t.orchestrationState,
      updated_at: t.updatedAt,
      created_at: t.createdAt,
    };
  });

  app.delete("/api/v1/threads/:threadId", async (request) => {
    const user = await auth(request);
    const ok = store.deleteThreadForUser(user.id, request.params.threadId);
    if (!ok) {
      const err = new Error("not_found");
      err.statusCode = 404;
      err.payload = { code: "thread_not_found", message: "浼氳瘽涓嶅瓨鍦ㄦ垨鏃犳潈璁块棶" };
      throw err;
    }
    return { ok: true };
  });

  app.get("/api/v1/threads/:threadId/messages", async (request) => {
    const user = await auth(request);
    const t = store.getThread(request.params.threadId, user.id);
    if (!t) {
      const err = new Error("not_found");
      err.statusCode = 404;
      err.payload = { code: "thread_not_found", message: "浼氳瘽涓嶅瓨鍦ㄦ垨鏃犳潈璁块棶" };
      throw err;
    }
    const limit = Math.min(500, Math.max(1, Number(request.query.limit) || 200));
    const messages = store.listMessages(t.id, limit);
    return messages.map((m) => {
      const row = {
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.createdAt,
      };
      if (m.meta && typeof m.meta === "object") row.meta = m.meta;
      return row;
    });
  });

  app.post("/api/v1/threads/:threadId/messages", async (request, reply) => {
    const user = await auth(request);
    const t = store.getThread(request.params.threadId, user.id);
    if (!t) {
      const err = new Error("not_found");
      err.statusCode = 404;
      err.payload = { code: "thread_not_found", message: "浼氳瘽涓嶅瓨鍦ㄦ垨鏃犳潈璁块棶" };
      throw err;
    }
    const content = String(request.body?.content || "").trim();
    if (!content) {
      return reply.status(400).send({ code: "bad_request", message: "content 涓嶈兘涓虹┖" });
    }

    const replaceUserMessageId = String(request.body?.replace_user_message_id || "").trim();
    if (replaceUserMessageId) {
      const swap = store.replaceTailUserTurn(t.id, replaceUserMessageId, content);
      if (!swap?.ok) {
        const phrase =
          swap?.code === "not_last_user_turn"
            ? "仅支持纠错「当前会话最后一条你的消息」，请收起其它编辑或刷新。"
            : "无法纠错该条消息（可能已不是最后一条或未找到），请刷新后重试。";
        return reply.status(400).send({ code: swap?.code || "replace_not_allowed", message: phrase });
      }
      rollbackRoughPhase2ForReplaceTurn(t.id, user.id, swap.oldContent || "");
    } else {
      store.appendUserMessage(t.id, content);
    }
    const historyBefore = store.openaiHistory(t.id).slice(0, -1);
    const key = (process.env.DEEPSEEK_API_KEY || "").trim();
    const useMock = !key;
    const memCtx = memoryContextForTurn(user.id, content);

    const agentOut = await runProfileAgent({
      userMessage: content,
      historyOpenai: historyBefore,
      useMock,
      deepseekApiKey: key,
      deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      memoryContext: memCtx,
    });

    const filteredCitations = agentOut.citations || [];

    const userTurns = store.countUserMessages(t.id);
    const newState = nextOrchestrationState(
      t.orchestrationState,
      agentOut.gaps,
      userTurns,
      content,
      agentOut.readiness_for_profile
    );
    store.updateThreadState(t.id, newState);

    let phase2 = null;
    try {
      phase2 = await runPhase2Pipeline(store, {
        userId: user.id,
        threadId: t.id,
        userMessage: content,
        assistantReply: agentOut.reply,
        gapsFromAgent: agentOut.gaps || [],
        useMock,
        deepseekApiKey: key,
        deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
        deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      });
    } catch (e) {
      request.log.error(e);
    }

    const planReady = phase2?.planInputView?.readiness?.ready === true;
    const readiness_for_plan = planReady && agentOut.readiness_for_profile;

    const snapForProgress = phase2?.snapshot || store.getLatestProfileSnapshot(user.id)?.snapshot || null;
    const pivForProgress = phase2?.planInputView || store.getLatestProfileSnapshot(user.id)?.planInputView || null;
    const profile_progress =
      snapForProgress && pivForProgress ? buildProfileProgress(snapForProgress, pivForProgress) : null;
    const report_readiness =
      snapForProgress && pivForProgress ? buildReportReadiness(snapForProgress, pivForProgress) : null;

    const assistantMeta = {
      citations: filteredCitations,
      gap_items: agentOut.gap_items || [],
      gaps: agentOut.gaps || [],
      suggested_followups: agentOut.suggested_followups || [],
      readiness_for_profile: agentOut.readiness_for_profile,
      readiness_for_plan,
      profile_progress,
      report_readiness,
    };
    const assistant = store.appendAssistantMessage(t.id, agentOut.reply, assistantMeta);

    const all = store.listMessages(t.id);
    const userMsg = all.filter((m) => m.role === "user").pop();

    return {
      user_message: {
        id: userMsg.id,
        role: userMsg.role,
        content: userMsg.content,
        created_at: userMsg.createdAt,
      },
      assistant_message: {
        id: assistant.id,
        role: assistant.role,
        content: assistant.content,
        created_at: assistant.createdAt,
      },
      orchestration_state: newState,
      gaps: agentOut.gaps,
      gap_items: agentOut.gap_items || [],
      citations: filteredCitations,
      suggested_followups: agentOut.suggested_followups,
      readiness_for_profile: agentOut.readiness_for_profile,
      readiness_for_plan,
      profile_progress,
      report_readiness,
      profile_snapshot: phase2?.snapshot || null,
      plan_input_view: phase2?.planInputView || null,
      replacement_edit: Boolean(replaceUserMessageId),
    };
  });

  app.get("/api/v1/profile", async (request) => {
    const user = await auth(request);
    const bundle = buildLiveProfileBundle(user.id);
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
    const bundle = buildLiveProfileBundle(user.id);
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

  app.delete("/api/v1/profile/snapshots/:snapshotId", async (request, reply) => {
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

  /** 产品级「清空建档」：不可逆清空会话与建档衍生数据后授予一个新会话 id（不写冗余快照）。 */
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
    const t = store.createThread(user.id);
    return {
      ok: true,
      thread_id: t.id,
      orchestration_state: t.orchestrationState,
      removed,
    };
  });

  app.get("/api/v1/profile/plan-input", async (request) => {
    const user = await auth(request);
    const bundle = buildLiveProfileBundle(user.id);
    return {
      plan_input_view: bundle.plan_input_view,
      snapshot_version: bundle.snapshot_version,
    };
  });

  app.get("/api/v1/profile/memories", async (request) => {
    const user = await auth(request);
    const memories = store.listMemoriesByUser(user.id);
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
      return reply.status(400).send({ code: "bad_request", message: "鏃犳晥鐨?factId" });
    }
    const body = request.body || {};
    const memories = store.listMemoriesByUser(user.id);
    const m = memories.find((x) => x.key === key);
    if (!m) {
      const err = new Error("not_found");
      err.statusCode = 404;
      err.payload = { code: "fact_not_found", message: "鏈壘鍒板搴旇蹇嗛」" };
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

    const gen = await generateStructuredPlan(piv, {
      useMock,
      deepseekApiKey: key,
      deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      timeoutMs,
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
      err.payload = { code: "plan_not_found", message: "鏂规涓嶅瓨鍦ㄦ垨鏃犳潈璁块棶" };
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

    const gen = await generateHtmlReport(latest.snapshot, planRow.plan, {
      useMock,
      deepseekApiKey: key,
      deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      timeoutMs,
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
      err.payload = { code: "report_not_found", message: "鎶ュ憡涓嶅瓨鍦ㄦ垨鏃犳潈璁块棶" };
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

  app.post("/api/v1/reports/:reportId/share", async (request, reply) => {
    const user = await auth(request);
    const out = store.enableReportShare(request.params.reportId, user.id);
    if (!out) {
      const err = new Error("not_found");
      err.statusCode = 404;
      err.payload = { code: "report_not_found", message: "鎶ュ憡涓嶅瓨鍦ㄦ垨鏃犳潈璁块棶" };
      throw err;
    }
    return {
      ok: true,
      share_token: out.token,
      url_path: `/api/v1/public/reports/${encodeURIComponent(out.token)}`,
      created_at: out.createdAt,
    };
  });

  app.delete("/api/v1/reports/:reportId/share", async (request, reply) => {
    const user = await auth(request);
    const ok = store.revokeReportShare(request.params.reportId, user.id);
    if (!ok) {
      const err = new Error("not_found");
      err.statusCode = 404;
      err.payload = { code: "report_not_found", message: "鎶ュ憡涓嶅瓨鍦ㄦ垨鏃犳潈璁块棶" };
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
      err.payload = { code: "report_not_found", message: "鎶ュ憡涓嶅瓨鍦ㄦ垨鏃犳潈璁块棶" };
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
      share_status: reportShareStatus(r),
      share_view_count: r.share?.viewCount ?? 0,
      share_last_viewed_at: r.share?.lastViewedAt || null,
      share_url_path:
        reportShareStatus(r) === "active" && r.share?.token
          ? `/api/v1/public/reports/${encodeURIComponent(r.share.token)}`
          : null,
      html: r.html,
    };
  });

  app.get("/api/v1/history", async (request) => {
    const user = await auth(request);
    const threads = store.listThreadsByUser(user.id).map((t) => ({
      thread_id: t.id,
      pinned: t.pinned === true,
      orchestration_state: t.orchestrationState,
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

  return app;
}
