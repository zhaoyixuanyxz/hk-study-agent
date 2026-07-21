import { runProfileAgent } from "../agent.js";
import { assessChatScope } from "../chat-scope.js";
import { DEFAULT_DEEPSEEK_MODEL, resolveDeepseekBaseUrl } from "../deepseek-client.js";
import { nextOrchestrationState } from "../orchestrator.js";
import { runPhase2Pipeline } from "../phase2-pipeline.js";
import { buildProfileProgress } from "../profile-progress.js";
import { buildReportReadiness } from "../report-readiness.js";
import { buildCombinedIntelContext } from "../intelligence/intelContextPack.js";
import { normalizeLocale, resolveThreadLocale } from "../output-locale.js";

/**
 * @param {import("fastify").FastifyInstance} app
 * @param {ReturnType<import("./context.js").createAppContext>} ctx
 */
export function registerChatRoutes(app, ctx) {
  const { store, auth, memoryContextForTurn, rollbackRoughPhase2ForReplaceTurn } = ctx;

  app.post("/api/v1/threads", async (request) => {
    const user = await auth(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const locale = normalizeLocale(body.locale);
    const t = store.createThread(user.id, { locale });
    return {
      thread_id: t.id,
      orchestration_state: t.orchestrationState,
      locale: resolveThreadLocale(t),
    };
  });

  app.get("/api/v1/threads/:threadId", async (request) => {
    const user = await auth(request);
    const t = store.getThread(request.params.threadId, user.id);
    if (!t) {
      const err = new Error("not_found");
      err.statusCode = 404;
      err.payload = { code: "thread_not_found", message: "会话不存在或无权访问" };
      throw err;
    }
    const messages = store.listMessages(t.id);
    return {
      id: t.id,
      pinned: t.pinned === true,
      orchestration_state: t.orchestrationState,
      locale: resolveThreadLocale(t),
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
    if (Object.prototype.hasOwnProperty.call(body, "locale")) {
      return reply.status(409).send({
        code: "locale_locked",
        message: "会话语言已锁定，请新建会话以切换语言",
      });
    }
    if (typeof body.pinned !== "boolean") {
      return reply.status(400).send({ code: "bad_request", message: "body.pinned 必须为布尔值" });
    }
    const ok = store.setThreadPinned(user.id, request.params.threadId, body.pinned);
    if (!ok) {
      const err = new Error("not_found");
      err.statusCode = 404;
      err.payload = { code: "thread_not_found", message: "会话不存在或无权访问" };
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
      err.payload = { code: "thread_not_found", message: "会话不存在或无权访问" };
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
      err.payload = { code: "thread_not_found", message: "会话不存在或无权访问" };
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
      err.payload = { code: "thread_not_found", message: "会话不存在或无权访问" };
      throw err;
    }
    const content = String(request.body?.content || "").trim();
    if (!content) {
      return reply.status(400).send({ code: "bad_request", message: "content 不能为空" });
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
    const latestSnap = store.getLatestProfileSnapshot(user.id);
    const intelPack = buildCombinedIntelContext(store, {
      userMessage: content,
      snapshot: latestSnap?.snapshot,
      planInputView: latestSnap?.planInputView,
      limit: 8,
    });

    const scope = assessChatScope({ userMessage: content, snapshot: latestSnap?.snapshot });
    const agentOut = await runProfileAgent({
      userMessage: content,
      historyOpenai: historyBefore,
      useMock,
      deepseekApiKey: key,
      deepseekBaseUrl: resolveDeepseekBaseUrl(process.env.DEEPSEEK_BASE_URL),
      deepseekModel: process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
      memoryContext: memCtx,
      intelContextText: intelPack.text,
      intelItems: intelPack.items,
      extKbEntries: intelPack.extKbEntries,
      profileSnapshot: latestSnap?.snapshot,
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
    if (!agentOut.scope_redirect) {
      try {
        phase2 = await runPhase2Pipeline(store, {
          userId: user.id,
          threadId: t.id,
          userMessage: content,
          assistantReply: agentOut.reply,
          gapsFromAgent: agentOut.gaps || [],
          useMock,
          deepseekApiKey: key,
          deepseekBaseUrl: resolveDeepseekBaseUrl(process.env.DEEPSEEK_BASE_URL),
          deepseekModel: process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
        });
      } catch (e) {
        request.log.error(e);
      }
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
      scope_redirect: Boolean(agentOut.scope_redirect),
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
      scope_redirect: Boolean(agentOut.scope_redirect),
    };
  });
}
