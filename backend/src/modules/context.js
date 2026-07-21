import { buildProfileViewModel } from "../profile-view.js";
import { hydrateProfileSnapshotFromMemories } from "../profile-service.js";
import { buildPlanInputView } from "../plan-input-service.js";

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 */
export function createAppContext(store) {
  async function auth(request) {
    const h = request.headers.authorization;
    if (!h || !h.startsWith("Bearer ")) {
      const err = new Error("unauthorized");
      err.statusCode = 401;
      err.payload = { code: "unauthorized", message: "缺少 Bearer Token" };
      throw err;
    }
    const token = h.slice("Bearer ".length).trim();
    const user = store.getUserByToken(token);
    if (!user) {
      const err = new Error("invalid_token");
      err.statusCode = 401;
      err.payload = { code: "invalid_token", message: "无效 Token" };
      throw err;
    }
    return user;
  }

  function memoryContextForTurn(userId, userMessage, threadId) {
    const chunks = store.searchSemanticChunks(userId, userMessage, 4, threadId);
    if (!chunks.length) return "";
    return chunks.map((c) => c.text).join("\n---\n");
  }

  function buildLiveProfileBundle(userId, threadId) {
    const tid = threadId != null && String(threadId).trim() ? String(threadId).trim() : "";
    const latestRow = tid
      ? store.getLatestProfileSnapshot(userId, tid)
      : store.getLatestProfileSnapshot(userId);
    const memories = tid ? store.listMemoriesByThread(userId, tid) : store.listMemoriesByUser(userId);
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

  function rollbackRoughPhase2ForReplaceTurn(threadId, userId, typoUserContent) {
    const prefix = `用户：${String(typoUserContent || "").trim()}\n`;
    if (prefix.length > 4) store.deleteSemanticChunksStartingWith(userId, threadId, prefix);
    store.deleteLatestProfileSnapshotForThread(userId, threadId);
  }

  return {
    store,
    auth,
    memoryContextForTurn,
    buildLiveProfileBundle,
    rollbackRoughPhase2ForReplaceTurn,
  };
}

export function escapeHtmlAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

export function logPlanGenerationFailure(payload) {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      scope: "plan_generation",
      level: "error",
      ...payload,
    })
  );
}
