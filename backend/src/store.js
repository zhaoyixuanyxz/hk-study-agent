import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import { hashPassword, verifyPassword } from "./password.js";
import { ALL_STRUCTURED_FACT_KEYS, buildPlanInputView } from "./plan-input-service.js";
import { buildProfileSnapshot } from "./profile-service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 追加一条与当前 profileMemories + 其余会话摘要一致的聚合画像快照（threadId 为空）。
 * @param {ReturnType<typeof migrateDb>} db
 * @param {string} userId
 */
function appendAggregateProfileSnapshotForUser(db, userId) {
  const uid = String(userId || "").trim();
  const memoriesLeft = (db.profileMemories || []).filter((m) => m.userId === uid);
  const memRows = memoriesLeft.map((m) => ({
    kind: m.kind,
    key: m.key,
    value: m.value,
    hasConflict: m.hasConflict,
    valueAlt: m.valueAlt,
  }));
  const sums = (db.conversationSummaries || [])
    .filter((s) => s.userId === uid)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  const summaryText = sums
    .map((s) => s.summary || "")
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000);
  const freshSnap = buildProfileSnapshot({
    summaryText,
    gapsFromAgent: [],
    memories: memRows,
  });
  const freshPiv = buildPlanInputView(
    freshSnap,
    memoriesLeft.map((m) => ({ kind: m.kind, key: m.key, value: m.value }))
  );
  const rid = cryptoRandomId();
  const now = new Date().toISOString();
  const version =
    1 +
    (db.profileSnapshots || [])
      .filter((s) => s.userId === uid)
      .reduce((max, s) => Math.max(max, s.version || 0), 0);
  db.profileSnapshots.push({
    id: rid,
    userId: uid,
    threadId: null,
    version,
    snapshot: freshSnap,
    planInputView: freshPiv,
    createdAt: now,
  });
}

/**
 * threadId 指向不存在或无权占有的会话时，清理残留消息/摘要/记忆/快照，并级联删方案与报告。
 * @returns {Set<string>} 需要重写聚合快照的 userId
 */
function pruneOrphanThreadScopedData(db) {
  /** @type {Set<string>} */
  const affected = new Set();
  const threadIds = new Set();
  /** @type {Map<string, string>} */
  const threadOwner = new Map();
  for (const t of db.threads || []) {
    if (t && t.id) {
      threadIds.add(t.id);
      threadOwner.set(t.id, t.userId);
    }
  }

  const orphanSnapIds = new Set();

  db.profileMemories = (db.profileMemories || []).filter((m) => {
    if (!m.threadId) return true;
    if (!threadIds.has(m.threadId) || threadOwner.get(m.threadId) !== m.userId) {
      affected.add(m.userId);
      return false;
    }
    return true;
  });

  db.profileSnapshots = (db.profileSnapshots || []).filter((s) => {
    if (!s.threadId) return true;
    if (!threadIds.has(s.threadId) || threadOwner.get(s.threadId) !== s.userId) {
      orphanSnapIds.add(s.id);
      affected.add(s.userId);
      return false;
    }
    return true;
  });

  db.semanticMemoryChunks = (db.semanticMemoryChunks || []).filter((c) => {
    if (!c.threadId) return true;
    if (!threadIds.has(c.threadId) || threadOwner.get(c.threadId) !== c.userId) {
      affected.add(c.userId);
      return false;
    }
    return true;
  });

  db.conversationSummaries = (db.conversationSummaries || []).filter((s) => {
    if (!s.threadId) return true;
    if (!threadIds.has(s.threadId) || threadOwner.get(s.threadId) !== s.userId) {
      affected.add(s.userId);
      return false;
    }
    return true;
  });

  db.messages = (db.messages || []).filter((m) => m.threadId && threadIds.has(m.threadId));

  /** @type {Set<string>} */
  const orphanPlanIds = new Set();
  for (const p of db.planResults || []) {
    if (p.snapshotId && orphanSnapIds.has(p.snapshotId)) {
      orphanPlanIds.add(p.id);
      affected.add(p.userId);
    }
  }

  db.reportResults = (db.reportResults || []).filter((r) => {
    const byPlan = r.planId && orphanPlanIds.has(r.planId);
    const bySnap = r.snapshotId && orphanSnapIds.has(r.snapshotId);
    if (byPlan || bySnap) {
      if (r.userId) affected.add(r.userId);
      return false;
    }
    return true;
  });

  db.planResults = (db.planResults || []).filter((p) => !(p.snapshotId && orphanSnapIds.has(p.snapshotId)));

  return affected;
}

function migrateDb(raw) {
  const db = raw && typeof raw === "object" ? raw : {};
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.threads)) db.threads = [];
  if (!Array.isArray(db.messages)) db.messages = [];
  if (!Array.isArray(db.profileMemories)) db.profileMemories = [];
  if (!Array.isArray(db.conversationSummaries)) db.conversationSummaries = [];
  if (!Array.isArray(db.profileSnapshots)) db.profileSnapshots = [];
  if (!Array.isArray(db.semanticMemoryChunks)) db.semanticMemoryChunks = [];
  if (!Array.isArray(db.planResults)) db.planResults = [];
  if (!Array.isArray(db.reportResults)) db.reportResults = [];
  if (!Array.isArray(db.analyticsEvents)) db.analyticsEvents = [];
  stripLegacyIntelligenceData(db);
  for (const r of db.reportResults) {
    normalizeReportResultInPlace(r);
  }
  for (const t of db.threads) {
    if (t == null || typeof t !== "object") continue;
    if (t.pinned !== true) t.pinned = false;
  }
  const prunedUsers = pruneOrphanThreadScopedData(db);
  if (prunedUsers.size > 0) {
    for (const uid of prunedUsers) {
      appendAggregateProfileSnapshotForUser(db, uid);
    }
    for (const uid of prunedUsers) {
      const memLeft = (db.profileMemories || []).filter((m) => m.userId === uid).length;
      if (memLeft === 0) {
        db.planResults = (db.planResults || []).filter((p) => p.userId !== uid);
        db.reportResults = (db.reportResults || []).filter((r) => r.userId !== uid);
      }
    }
    db.__persistAfterMigrate = true;
  }
  return db;
}

/** Remove deprecated Hong Kong study-intelligence module keys from persisted DB. */
function stripLegacyIntelligenceData(db) {
  const keys = [
    "intelligenceSources",
    "intelligenceItems",
    "intelligenceRawSnapshots",
    "intelligenceTimelineEvents",
    "intelligenceCollectionRuns",
    "intelligenceFollows",
    "intelligenceReviewerEmails",
    "intelligenceFeedUrls",
    "intelligenceDiscoveryPolicy",
    "intelligenceDiscoveryJobs",
    "intelligenceAuditSamples",
  ];
  let stripped = false;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(db, k)) {
      delete db[k];
      stripped = true;
    }
  }
  for (const u of db.users || []) {
    if (u && typeof u === "object" && Object.prototype.hasOwnProperty.call(u, "intelligenceLastOpenedAt")) {
      delete u.intelligenceLastOpenedAt;
      stripped = true;
    }
  }
  if (stripped) db.__persistAfterMigrate = true;
}

function defaultReportShare() {
  return {
    token: null,
    enabled: false,
    createdAt: null,
    revokedAt: null,
    viewCount: 0,
    lastViewedAt: null,
  };
}

/**
 * Backward-compatible shape for V1-P3+ (title, citations[], share stats).
 * @param {object} r
 */
export function normalizeReportResultInPlace(r) {
  if (!r || typeof r !== "object") return r;
  if (r.title == null) r.title = "";
  else r.title = String(r.title);
  if (!Array.isArray(r.citations)) r.citations = [];
  if (!r.share || typeof r.share !== "object") r.share = defaultReportShare();
  else {
    const s = r.share;
    r.share = {
      token: s.token != null && String(s.token).trim() ? String(s.token).trim() : null,
      enabled: Boolean(s.enabled && s.token),
      createdAt: s.createdAt != null ? String(s.createdAt) : null,
      revokedAt: s.revokedAt != null ? String(s.revokedAt) : null,
      viewCount: Number.isFinite(Number(s.viewCount)) ? Math.max(0, Math.floor(Number(s.viewCount))) : 0,
      lastViewedAt: s.lastViewedAt != null ? String(s.lastViewedAt) : null,
    };
  }
  return r;
}

/**
 * @param {object} r report row (may be legacy)
 * @returns {"none"|"active"|"revoked"}
 */
export function reportShareStatus(r) {
  if (!r || typeof r !== "object") return "none";
  const sh = r.share && typeof r.share === "object" ? r.share : defaultReportShare();
  if (sh.enabled && sh.token) return "active";
  if (sh.revokedAt || (sh.createdAt && !sh.enabled)) return "revoked";
  if (sh.createdAt && !sh.token) return "revoked";
  return "none";
}

export function createStore(dataFile) {
  const path = dataFile || join(__dirname, "..", "data", "db.json");

  function ensure() {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(path)) {
      writeFileSync(
        path,
        JSON.stringify(
          migrateDb({
            users: [],
            threads: [],
            messages: [],
            profileMemories: [],
            conversationSummaries: [],
            profileSnapshots: [],
            semanticMemoryChunks: [],
            planResults: [],
            reportResults: [],
            analyticsEvents: [],
          }),
          null,
          2
        ),
        "utf8"
      );
    }
  }

  function load() {
    ensure();
    const db = migrateDb(JSON.parse(readFileSync(path, "utf8")));
    if (db.__persistAfterMigrate) {
      delete db.__persistAfterMigrate;
      writeFileSync(path, JSON.stringify(db, null, 2), "utf8");
    }
    return db;
  }

  function save(db) {
    writeFileSync(path, JSON.stringify(db, null, 2), "utf8");
  }

  return {
    path,
    createUser() {
      const db = load();
      const id = cryptoRandomId();
      const token = randomBytes(24).toString("base64url");
      db.users.push({ id, token, createdAt: new Date().toISOString() });
      save(db);
      return { id, token };
    },
    getUserByToken(token) {
      const db = load();
      return db.users.find((u) => u.token === token) || null;
    },

    /**
     * @param {string} email
     */
    findUserByEmail(email) {
      const db = load();
      const n = normEmail(email);
      if (!n) return null;
      return db.users.find((u) => u.email && normEmail(u.email) === n) || null;
    },

    /**
     * @param {string} email
     * @param {string} plainPassword
     * @returns {{ ok: true, id: string, token: string } | { ok: false, code: string }}
     */
    registerUserWithEmailPassword(email, plainPassword) {
      const db = load();
      const n = normEmail(email);
      if (!n) return { ok: false, code: "INVALID_EMAIL" };
      if (db.users.some((u) => u.email && normEmail(u.email) === n)) {
        return { ok: false, code: "EMAIL_TAKEN" };
      }
      const id = cryptoRandomId();
      const token = randomBytes(24).toString("base64url");
      const now = new Date().toISOString();
      const passwordHash = hashPassword(plainPassword);
      db.users.push({ id, token, email: n, passwordHash, createdAt: now });
      save(db);
      return { ok: true, id, token };
    },

    /**
     * @param {string} email
     * @param {string} plainPassword
     * @returns {{ ok: true, id: string, token: string } | { ok: false, code: string }}
     */
    loginWithEmailPassword(email, plainPassword) {
      const db = load();
      const u = this.findUserByEmail(email);
      if (!u || !u.passwordHash) return { ok: false, code: "INVALID_CREDENTIALS" };
      if (!verifyPassword(plainPassword, u.passwordHash)) {
        return { ok: false, code: "INVALID_CREDENTIALS" };
      }
      const row = db.users.find((x) => x.id === u.id);
      if (!row) return { ok: false, code: "INVALID_CREDENTIALS" };
      row.token = randomBytes(24).toString("base64url");
      save(db);
      return { ok: true, id: row.id, token: row.token };
    },

    /**
     * @param {string} userId
     * @param {Array<{ name: string, props?: object }>} events
     */
    appendAnalyticsEvents(userId, events) {
      const db = load();
      const now = new Date().toISOString();
      let n = 0;
      for (const ev of events || []) {
        if (!ev || typeof ev.name !== "string" || !ev.name.trim()) continue;
        db.analyticsEvents.push({
          id: cryptoRandomId(),
          userId,
          name: ev.name.slice(0, 120),
          props: ev.props && typeof ev.props === "object" ? ev.props : {},
          createdAt: now,
        });
        n += 1;
      }
      save(db);
      return { count: n };
    },
    createThread(userId) {
      const db = load();
      const id = cryptoRandomId();
      const now = new Date().toISOString();
      db.threads.push({
        id,
        userId,
        orchestrationState: "init",
        pinned: false,
        createdAt: now,
        updatedAt: now,
      });
      save(db);
      return db.threads.find((t) => t.id === id);
    },
    getThread(threadId, userId) {
      const db = load();
      const t = db.threads.find((x) => x.id === threadId);
      if (!t || t.userId !== userId) return null;
      return t;
    },
    listMessages(threadId, limit = 200) {
      const db = load();
      return db.messages
        .filter((m) => m.threadId === threadId)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .slice(-limit);
    },
    appendUserMessage(threadId, content) {
      const db = load();
      const id = cryptoRandomId();
      const now = new Date().toISOString();
      db.messages.push({
        id,
        threadId,
        role: "user",
        content,
        createdAt: now,
      });
      save(db);
      return db.messages.find((m) => m.id === id);
    },
    /**
     * @param {string} threadId
     * @param {string} content
     * @param {Record<string, unknown> | null} [meta]
     */
    appendAssistantMessage(threadId, content, meta = null) {
      const db = load();
      const id = cryptoRandomId();
      const now = new Date().toISOString();
      /** @type {Record<string, unknown>} */
      const row = {
        id,
        threadId,
        role: "assistant",
        content,
        createdAt: now,
      };
      if (meta && typeof meta === "object" && Object.keys(meta).length) row.meta = meta;
      db.messages.push(row);
      save(db);
      return db.messages.find((m) => m.id === id);
    },
    countUserMessages(threadId) {
      const db = load();
      return db.messages.filter((m) => m.threadId === threadId && m.role === "user").length;
    },

    /**
     * 仅在「会话尾部」纠错：必须是当前会话中**最新一条用户消息**。若其后有助手回复则删除该助手消息（覆盖重答）。
     * @returns {{ ok: true, oldContent: string } | { ok: false, code: string }}
     */
    replaceTailUserTurn(threadId, userMessageId, newContentTrimmed) {
      const db = load();
      const tid = String(threadId || "").trim();
      const mid = String(userMessageId || "").trim();
      const next = String(newContentTrimmed || "").trim();
      if (!tid || !mid || !next) return { ok: false, code: "bad_args" };

      const msgs = db.messages
        .filter((m) => m.threadId === tid)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      if (!msgs.length) return { ok: false, code: "empty_thread" };

      let lastUserIdx = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "user") {
          lastUserIdx = i;
          break;
        }
      }
      if (lastUserIdx < 0) return { ok: false, code: "no_user_message" };
      if (msgs[lastUserIdx].id !== mid) return { ok: false, code: "not_last_user_turn" };

      /** @type {string[]} */
      const deleteIds = [];
      if (msgs.length > lastUserIdx + 1) {
        for (let j = lastUserIdx + 1; j < msgs.length; j++) deleteIds.push(msgs[j].id);
      }

      const userRowInDb = db.messages.find((m) => m.id === mid && m.threadId === tid);
      if (!userRowInDb || userRowInDb.role !== "user") return { ok: false, code: "msg_not_found" };

      const oldContent = String(userRowInDb.content || "");
      userRowInDb.content = next;
      userRowInDb.createdAt = new Date().toISOString();

      if (deleteIds.length) db.messages = db.messages.filter((m) => !deleteIds.includes(m.id));
      save(db);
      return { ok: true, oldContent };
    },

    /** 删掉该轮纠错前写入的语义块（与 Phase2 chunk 前缀一致）。 */
    deleteSemanticChunksStartingWith(userId, threadId, prefix) {
      const db = load();
      const uid = String(userId || "").trim();
      const tid = String(threadId || "").trim();
      const p = String(prefix || "");
      if (!uid || !tid || !p) return;
      db.semanticMemoryChunks = (db.semanticMemoryChunks || []).filter(
        (c) => !(c.userId === uid && c.threadId === tid && typeof c.text === "string" && c.text.startsWith(p))
      );
      save(db);
    },

    /** 删除本会话下最新的一条画像快照（若有），用于纠错重答后由 Phase2 重建。 */
    deleteLatestProfileSnapshotForThread(userId, threadId) {
      const uid = String(userId || "").trim();
      const tid = String(threadId || "").trim();
      if (!uid || !tid) return false;
      const db = load();
      const list = db.profileSnapshots.filter((s) => s.userId === uid && s.threadId === tid);
      if (!list.length) return false;
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return this.deleteProfileSnapshotForUser(uid, list[0].id);
    },
    updateThreadState(threadId, state) {
      const db = load();
      const t = db.threads.find((x) => x.id === threadId);
      if (!t) return;
      t.orchestrationState = state;
      t.updatedAt = new Date().toISOString();
      save(db);
    },

    /**
     * @param {string} userId
     * @param {string} threadId
     * @param {boolean} pinned
     */
    setThreadPinned(userId, threadId, pinned) {
      const db = load();
      const uid = String(userId || "").trim();
      const tid = String(threadId || "").trim();
      const t = db.threads.find((x) => x.id === tid);
      if (!t || t.userId !== uid) return false;
      t.pinned = Boolean(pinned);
      save(db);
      return true;
    },

    /**
     * 产品级「清空建档」：删除该用户全部咨询线程与消息、画像记忆/快照、语义块、会话摘要、方案与报告。
     * 不删除用户账号、登录 token、analyticsEvents。
     * @param {string} userId
     * @returns {{ threads: number, messages: number, memories: number, snapshots: number, chunks: number, summaries: number, plans: number, reports: number }}
     */
    purgeUserStudyArchive(userId) {
      const db = load();
      const uid = String(userId || "").trim();
      const threadIds = new Set(
        (db.threads || []).filter((t) => t && t.userId === uid).map((t) => String(t.id)),
      );
      const removed_threads = threadIds.size;
      const removed_messages = (db.messages || []).filter((m) => m && threadIds.has(m.threadId)).length;
      const removed_memories = (db.profileMemories || []).filter((m) => m && m.userId === uid).length;
      const removed_snapshots = (db.profileSnapshots || []).filter((s) => s && s.userId === uid).length;
      const removed_chunks = (db.semanticMemoryChunks || []).filter((c) => c && c.userId === uid).length;
      const removed_summaries = (db.conversationSummaries || []).filter((s) => s && s.userId === uid).length;
      const removed_plans = (db.planResults || []).filter((p) => p && p.userId === uid).length;
      const removed_reports = (db.reportResults || []).filter((r) => r && r.userId === uid).length;

      db.messages = (db.messages || []).filter((m) => !m || !threadIds.has(m.threadId));
      db.threads = (db.threads || []).filter((t) => !t || t.userId !== uid);
      db.conversationSummaries = (db.conversationSummaries || []).filter((s) => !s || s.userId !== uid);
      db.profileMemories = (db.profileMemories || []).filter((m) => !m || m.userId !== uid);
      db.profileSnapshots = (db.profileSnapshots || []).filter((s) => !s || s.userId !== uid);
      db.semanticMemoryChunks = (db.semanticMemoryChunks || []).filter((c) => !c || c.userId !== uid);
      db.planResults = (db.planResults || []).filter((p) => !p || p.userId !== uid);
      db.reportResults = (db.reportResults || []).filter((r) => !r || r.userId !== uid);

      save(db);
      return {
        threads: removed_threads,
        messages: removed_messages,
        memories: removed_memories,
        snapshots: removed_snapshots,
        chunks: removed_chunks,
        summaries: removed_summaries,
        plans: removed_plans,
        reports: removed_reports,
      };
    },

    /**
     * 删除该用户下的会话：消息、会话摘要、该会话产生的 profile 记忆与语义块、
     * 带相同 threadId 的画像快照，以及仅引用这些快照的方案与报告（不可恢复）。
     * 末尾会追加一条「聚合」画像快照（threadId 为空），与会话删除后仍残留的记忆对齐。
     * @param {string} userId
     * @param {string} threadId
     */
    deleteThreadForUser(userId, threadId) {
      const db = load();
      const uid = String(userId || "").trim();
      const tid = String(threadId || "").trim();
      const idx = db.threads.findIndex((x) => x.id === tid && x.userId === uid);
      if (idx < 0) return false;

      const snapIds = new Set(
        db.profileSnapshots.filter((s) => s.userId === uid && s.threadId === tid).map((s) => s.id)
      );

      const planIds = new Set(
        db.planResults
          .filter((p) => p.userId === uid && p.snapshotId && snapIds.has(p.snapshotId))
          .map((p) => p.id)
      );

      db.reportResults = db.reportResults.filter((r) => {
        if (r.userId !== uid) return true;
        const byPlan = r.planId && planIds.has(r.planId);
        const bySnap = r.snapshotId && snapIds.has(r.snapshotId);
        return !byPlan && !bySnap;
      });
      db.planResults = db.planResults.filter(
        (p) => !(p.userId === uid && p.snapshotId && snapIds.has(p.snapshotId))
      );
      db.profileSnapshots = db.profileSnapshots.filter((s) => !(s.userId === uid && s.threadId === tid));
      db.profileMemories = db.profileMemories.filter((m) => !(m.userId === uid && m.threadId === tid));
      db.semanticMemoryChunks = db.semanticMemoryChunks.filter((c) => !(c.userId === uid && c.threadId === tid));

      db.threads.splice(idx, 1);
      db.messages = db.messages.filter((m) => m.threadId !== tid);
      db.conversationSummaries = db.conversationSummaries.filter((s) => s.threadId !== tid);

      // 始终按「当前残余记忆 + 会话摘要余下部分」重写一条聚合快照。仅依赖 hadProfileSideEffect
      // 会漏掉「仅存 threadId:null 的旧快照、或删空会话」时 confirmationState 仍指向已删记忆的情况。
      appendAggregateProfileSnapshotForUser(db, uid);

      const memLeft = db.profileMemories.filter((m) => m.userId === uid).length;
      if (memLeft === 0) {
        db.planResults = db.planResults.filter((p) => p.userId !== uid);
        db.reportResults = db.reportResults.filter((r) => r.userId !== uid);
      }

      save(db);
      return true;
    },
    openaiHistory(threadId) {
      return this.listMessages(threadId, 500).map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      }));
    },

    /** @param {string} userId */
    listMemoriesByUser(userId) {
      const db = load();
      return db.profileMemories.filter((m) => m.userId === userId).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    },

    /**
     * 同一 userId+key 只保留一条记录；kind 按优先级升级（confirmed > candidate > preference > insight）
     * @param {object} rec
     */
    upsertMemory(rec) {
      const db = load();
      const now = new Date().toISOString();
      const order = { confirmed: 4, candidate: 3, preference: 2, insight: 1 };
      const norm = (s) => String(s ?? "").trim();
      const existing = db.profileMemories.find((m) => m.userId === rec.userId && m.key === rec.key);
      if (existing) {
        const incoming = order[rec.kind] || 0;
        const cur = order[existing.kind] || 0;
        const iv = norm(rec.value);
        const ev = norm(existing.value);
        const structured = ALL_STRUCTURED_FACT_KEYS.has(rec.key);
        const valueClash =
          structured &&
          iv &&
          ev &&
          iv !== ev &&
          rec.kind !== "insight" &&
          existing.kind !== "insight";

        if (valueClash) {
          if (!existing.valueAlt || norm(existing.valueAlt) === ev) existing.valueAlt = existing.value;
          existing.hasConflict = true;
          if (incoming >= cur) {
            existing.kind = rec.kind;
            existing.value = rec.value;
          }
          existing.threadId = rec.threadId ?? existing.threadId;
          existing.updatedAt = now;
          save(db);
          return existing;
        }

        if (incoming >= cur) {
          const sameAsPrimary = iv === ev;
          const alt = norm(existing.valueAlt);
          const sameAsAlt = alt && iv === alt;
          if (sameAsPrimary || sameAsAlt) {
            delete existing.hasConflict;
            delete existing.valueAlt;
          }
          existing.kind = rec.kind;
          existing.value = rec.value;
          existing.threadId = rec.threadId ?? existing.threadId;
          existing.updatedAt = now;
        }
        save(db);
        return existing;
      }
      const id = cryptoRandomId();
      db.profileMemories.push({
        id,
        userId: rec.userId,
        kind: rec.kind,
        key: rec.key,
        value: rec.value,
        threadId: rec.threadId || null,
        createdAt: now,
        updatedAt: now,
      });
      save(db);
      return db.profileMemories.find((m) => m.id === id);
    },

    /**
     * @param {string} memoryId
     * @param {string} userId
     * @param {{ value?: string, kind?: string }} patch
     */
    patchMemory(memoryId, userId, patch) {
      const db = load();
      const m = db.profileMemories.find((x) => x.id === memoryId && x.userId === userId);
      if (!m) return null;
      if (patch.value !== undefined) m.value = patch.value;
      if (patch.kind !== undefined) m.kind = patch.kind;
      m.updatedAt = new Date().toISOString();
      save(db);
      return m;
    },

    /**
     * @param {string} userId
     * @param {string} threadId
     */
    getThreadSummary(userId, threadId) {
      const db = load();
      return db.conversationSummaries.find((s) => s.userId === userId && s.threadId === threadId) || null;
    },

    /**
     * @param {string} userId
     * @param {string} threadId
     * @param {string} summary
     */
    upsertThreadSummary(userId, threadId, summary) {
      const db = load();
      const now = new Date().toISOString();
      const idx = db.conversationSummaries.findIndex((s) => s.userId === userId && s.threadId === threadId);
      if (idx >= 0) {
        db.conversationSummaries[idx].summary = summary;
        db.conversationSummaries[idx].updatedAt = now;
        save(db);
        return db.conversationSummaries[idx];
      }
      const id = cryptoRandomId();
      db.conversationSummaries.push({
        id,
        userId,
        threadId,
        summary,
        createdAt: now,
        updatedAt: now,
      });
      save(db);
      return db.conversationSummaries.find((s) => s.id === id);
    },

    /**
     * @param {object} row
     */
    appendProfileSnapshot(row) {
      const db = load();
      const id = cryptoRandomId();
      const now = new Date().toISOString();
      const version =
        1 +
        db.profileSnapshots.filter((s) => s.userId === row.userId).reduce((max, s) => Math.max(max, s.version || 0), 0);
      db.profileSnapshots.push({
        id,
        userId: row.userId,
        threadId: row.threadId || null,
        version,
        snapshot: row.snapshot,
        planInputView: row.planInputView || null,
        createdAt: now,
      });
      save(db);
      return db.profileSnapshots.find((s) => s.id === id);
    },

    /**
     * @param {string} userId
     */
    getLatestProfileSnapshot(userId) {
      const db = load();
      const list = db.profileSnapshots.filter((s) => s.userId === userId);
      if (!list.length) return null;
      return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    },

    /**
     * @param {string} snapshotId
     * @param {string} userId
     */
    getProfileSnapshot(snapshotId, userId) {
      const db = load();
      const row = db.profileSnapshots.find((s) => s.id === snapshotId && s.userId === userId);
      return row || null;
    },

    /**
     * 删除指定画像快照；同时移除仅基于该快照的方案及关联报告（规则与 deleteThreadForUser 中级联一致）。
     * 不删除记忆、语义块或会话。
     * @param {string} userId
     * @param {string} snapshotId
     * @returns {boolean}
     */
    deleteProfileSnapshotForUser(userId, snapshotId) {
      const db = load();
      const uid = String(userId || "").trim();
      const sid = String(snapshotId || "").trim();
      const row = db.profileSnapshots.find((s) => s.id === sid && s.userId === uid);
      if (!row) return false;

      const snapIds = new Set([sid]);
      const planIds = new Set(
        db.planResults
          .filter((p) => p.userId === uid && p.snapshotId && snapIds.has(p.snapshotId))
          .map((p) => p.id)
      );

      db.reportResults = db.reportResults.filter((r) => {
        if (r.userId !== uid) return true;
        const byPlan = r.planId && planIds.has(r.planId);
        const bySnap = r.snapshotId && snapIds.has(r.snapshotId);
        return !byPlan && !bySnap;
      });
      db.planResults = db.planResults.filter(
        (p) => !(p.userId === uid && p.snapshotId && snapIds.has(p.snapshotId))
      );
      db.profileSnapshots = db.profileSnapshots.filter((s) => !(s.id === sid && s.userId === uid));
      save(db);
      return true;
    },

    /**
     * @param {string} userId
     * @param {string} threadId
     * @param {string} text
     */
    addSemanticChunk(userId, threadId, text) {
      const db = load();
      const id = cryptoRandomId();
      const now = new Date().toISOString();
      const words = tokenizeForRecall(text);
      db.semanticMemoryChunks.push({
        id,
        userId,
        threadId,
        text: String(text).slice(0, 4000),
        words,
        createdAt: now,
      });
      save(db);
      return db.semanticMemoryChunks.find((c) => c.id === id);
    },

    /**
     * @param {string} userId
     * @param {string} query
     * @param {number} limit
     */
    searchSemanticChunks(userId, query, limit = 5) {
      const db = load();
      const qWords = tokenizeForRecall(query);
      if (!qWords.length) return [];
      const chunks = db.semanticMemoryChunks.filter((c) => c.userId === userId);
      const scored = chunks
        .map((c) => ({
          chunk: c,
          score: overlapScore(qWords, c.words || tokenizeForRecall(c.text)),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => x.chunk);
      return scored;
    },

    /**
     * @param {object} row
     * @param {string} row.userId
     * @param {string} [row.snapshotId]
     * @param {number|null} [row.snapshotVersion]
     * @param {string} [row.planInputSchemaVersion]
     * @param {object} row.plan
     */
    appendPlanResult(row) {
      const db = load();
      const id = cryptoRandomId();
      const now = new Date().toISOString();
      db.planResults.push({
        id,
        userId: row.userId,
        snapshotId: row.snapshotId || null,
        snapshotVersion: row.snapshotVersion ?? null,
        planInputSchemaVersion: row.planInputSchemaVersion || "1.0",
        plan: row.plan,
        createdAt: now,
      });
      save(db);
      return db.planResults.find((p) => p.id === id);
    },

    /**
     * @param {string} planId
     * @param {string} userId
     */
    getPlanResult(planId, userId) {
      const db = load();
      const p = db.planResults.find((x) => x.id === planId);
      if (!p || p.userId !== userId) return null;
      return p;
    },

    /**
     * @param {string} userId
     */
    listPlanResultsByUser(userId) {
      const db = load();
      return db.planResults
        .filter((p) => p.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    /**
     * @param {string} userId
     */
    listThreadsByUser(userId) {
      const db = load();
      return db.threads
        .filter((t) => t.userId === userId)
        .sort((a, b) => {
          const ap = a.pinned === true ? 1 : 0;
          const bp = b.pinned === true ? 1 : 0;
          if (bp !== ap) return bp - ap;
          return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
        });
    },

    /**
     * @param {string} userId
     */
    listProfileSnapshotsByUser(userId) {
      const db = load();
      return db.profileSnapshots
        .filter((s) => s.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    /**
     * @param {object} row
     */
    appendReportResult(row) {
      const db = load();
      const id = cryptoRandomId();
      const now = new Date().toISOString();
      const rec = {
        id,
        userId: row.userId,
        planId: row.planId || null,
        snapshotId: row.snapshotId || null,
        snapshotVersion: row.snapshotVersion ?? null,
        reportSchemaVersion: row.reportSchemaVersion || "1.0",
        title: row.title != null ? String(row.title).slice(0, 500) : "",
        html: row.html,
        citations: Array.isArray(row.citations) ? row.citations : [],
        chapterCount: row.chapterCount ?? 7,
        wordCount: row.wordCount ?? 0,
        createdAt: now,
        share: defaultReportShare(),
      };
      normalizeReportResultInPlace(rec);
      db.reportResults.push(rec);
      save(db);
      return db.reportResults.find((r) => r.id === id);
    },

    /**
     * @param {string} reportId
     * @param {string} userId
     */
    getReportResult(reportId, userId) {
      const db = load();
      const r = db.reportResults.find((x) => x.id === reportId);
      if (!r || r.userId !== userId) return null;
      normalizeReportResultInPlace(r);
      return r;
    },

    /**
     * @param {string} shareToken
     * @returns {object | null} raw row (caller must not expose userId in HTML)
     */
    getReportByShareToken(shareToken) {
      const db = load();
      const t = String(shareToken || "").trim();
      if (!t) return null;
      const r = db.reportResults.find((x) => {
        normalizeReportResultInPlace(x);
        return x.share && x.share.token === t && x.share.enabled === true;
      });
      return r || null;
    },

    /**
     * @param {string} reportId
     * @param {string} userId
     * @returns {{ token: string, createdAt: string } | null}
     */
    enableReportShare(reportId, userId) {
      const db = load();
      const r = db.reportResults.find((x) => x.id === reportId);
      if (!r || r.userId !== userId) return null;
      normalizeReportResultInPlace(r);
      const token = randomBytes(32).toString("base64url");
      const now = new Date().toISOString();
      r.share = {
        token,
        enabled: true,
        createdAt: now,
        revokedAt: null,
        viewCount: r.share.viewCount || 0,
        lastViewedAt: r.share.lastViewedAt || null,
      };
      save(db);
      return { token, createdAt: now };
    },

    /**
     * @param {string} reportId
     * @param {string} userId
     * @returns {boolean}
     */
    revokeReportShare(reportId, userId) {
      const db = load();
      const r = db.reportResults.find((x) => x.id === reportId);
      if (!r || r.userId !== userId) return false;
      normalizeReportResultInPlace(r);
      const now = new Date().toISOString();
      r.share.enabled = false;
      r.share.revokedAt = now;
      r.share.token = null;
      save(db);
      return true;
    },

    /**
     * @param {string} reportId internal id (from getReportByShareToken)
     */
    incrementReportShareView(reportId) {
      const db = load();
      const r = db.reportResults.find((x) => x.id === reportId);
      if (!r) return;
      normalizeReportResultInPlace(r);
      if (!r.share) r.share = defaultReportShare();
      r.share.viewCount = (r.share.viewCount || 0) + 1;
      r.share.lastViewedAt = new Date().toISOString();
      save(db);
    },

    /**
     * @param {string} userId
     */
    listReportResultsByUser(userId) {
      const db = load();
      return db.reportResults
        .filter((r) => r.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map((r) => normalizeReportResultInPlace(r));
    },
  };
}

function cryptoRandomId() {
  return randomBytes(16).toString("hex");
}

function normEmail(e) {
  return String(e || "")
    .trim()
    .toLowerCase();
}

function tokenizeForRecall(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 80);
}

function overlapScore(qWords, docWords) {
  const set = new Set(docWords);
  let n = 0;
  for (const w of qWords) {
    if (set.has(w)) n += 1;
  }
  return n;
}
