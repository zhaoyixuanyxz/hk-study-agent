import { runProfileExtraction } from "./extraction.js";
import { buildProfileSnapshot } from "./profile-service.js";
import { buildPlanInputView } from "./plan-input-service.js";

/**
 * @param {ReturnType<import('./store.js').createStore>} store
 * @param {object} ctx
 * @param {string} ctx.userId
 * @param {string} ctx.threadId
 * @param {string} ctx.userMessage
 * @param {string} ctx.assistantReply
 * @param {string[]} ctx.gapsFromAgent
 * @param {boolean} ctx.useMock
 * @param {string} ctx.deepseekApiKey
 * @param {string} ctx.deepseekBaseUrl
 * @param {string} ctx.deepseekModel
 */
export async function runPhase2Pipeline(store, ctx) {
  const memCtx = buildMemoryContext(store, ctx.userId, ctx.userMessage, ctx.threadId);
  const latestSnap = store.getLatestProfileSnapshot(ctx.userId, ctx.threadId);

  const extracted = await runProfileExtraction({
    userMessage: ctx.userMessage,
    assistantReply: ctx.assistantReply,
    useMock: ctx.useMock,
    deepseekApiKey: ctx.deepseekApiKey,
    deepseekBaseUrl: ctx.deepseekBaseUrl,
    deepseekModel: ctx.deepseekModel,
    memoryContext: memCtx,
    profileSnapshot: latestSnap?.snapshot,
  });

  mergeExtractionIntoStore(store, ctx.userId, ctx.threadId, extracted);

  const memories = store.listMemoriesByThread(ctx.userId, ctx.threadId);
  const threadSum = store.getThreadSummary(ctx.userId, ctx.threadId);
  let summaryText = threadSum?.summary || "";
  if (extracted.summary_delta) {
    summaryText = summaryText ? `${summaryText}\n${extracted.summary_delta}` : extracted.summary_delta;
    store.upsertThreadSummary(ctx.userId, ctx.threadId, summaryText.slice(0, 8000));
  }

  const snap = buildProfileSnapshot({
    summaryText: store.getThreadSummary(ctx.userId, ctx.threadId)?.summary || summaryText,
    gapsFromAgent: ctx.gapsFromAgent || [],
    memories: memories.map((m) => ({
      kind: m.kind,
      key: m.key,
      value: m.value,
      hasConflict: m.hasConflict,
      valueAlt: m.valueAlt,
    })),
  });

  const planInput = buildPlanInputView(snap, memories.map((m) => ({ kind: m.kind, key: m.key, value: m.value })));

  store.appendProfileSnapshot({
    userId: ctx.userId,
    threadId: ctx.threadId,
    snapshot: snap,
    planInputView: planInput,
  });

  const chunkText = `用户：${ctx.userMessage}\n要点：${JSON.stringify(extracted.confirmed.slice(0, 5))}`;
  store.addSemanticChunk(ctx.userId, ctx.threadId, chunkText);

  return { snapshot: snap, planInputView: planInput, extraction: extracted };
}

/**
 * 在用户确认事实等场景下，仅基于当前记忆与上一版缺口重建快照（不调用 LLM）
 * @param {ReturnType<import('./store.js').createStore>} store
 * @param {string} userId
 * @param {string|null} [sourceThreadId] 写入快照的会话归属（如由该会话内确认事实触发）
 */
export function refreshUserProfileSnapshot(store, userId, sourceThreadId = null) {
  const tid = sourceThreadId ? String(sourceThreadId) : null;
  const memories = tid ? store.listMemoriesByThread(userId, tid) : store.listMemoriesByUser(userId);
  const last = tid
    ? store.getLatestProfileSnapshot(userId, tid)
    : store.getLatestProfileSnapshot(userId);
  const gapsFromAgent = last?.snapshot?.gaps || [];
  const summaryText = last?.snapshot?.summary || "";

  const snap = buildProfileSnapshot({
    summaryText,
    gapsFromAgent,
    memories: memories.map((m) => ({
      kind: m.kind,
      key: m.key,
      value: m.value,
      hasConflict: m.hasConflict,
      valueAlt: m.valueAlt,
    })),
  });
  const planInput = buildPlanInputView(snap, memories.map((m) => ({ kind: m.kind, key: m.key, value: m.value })));
  store.appendProfileSnapshot({
    userId,
    threadId: sourceThreadId || null,
    snapshot: snap,
    planInputView: planInput,
  });
  return { snapshot: snap, planInputView: planInput };
}

function buildMemoryContext(store, userId, query, threadId) {
  const chunks = store.searchSemanticChunks(userId, query, 4, threadId);
  if (!chunks.length) return "";
  return chunks.map((c) => c.text).join("\n---\n");
}

/**
 * @param {ReturnType<import('./store.js').createStore>} store
 */
function mergeExtractionIntoStore(store, userId, threadId, extracted) {
  const buckets = [
    ["insight", extracted.insights],
    ["preference", extracted.preference],
    ["candidate", extracted.candidate],
    ["confirmed", extracted.confirmed],
  ];
  for (const [kind, arr] of buckets) {
    for (const item of arr) {
      store.upsertMemory({
        userId,
        threadId,
        kind,
        key: item.key,
        value: item.value,
      });
    }
  }
}
