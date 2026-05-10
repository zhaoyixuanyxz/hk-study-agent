import { emptySnapshot, SNAPSHOT_SCHEMA_VERSION } from "./schemas/phase2.js";

/**
 * @param {object} input
 * @param {string} input.summaryText
 * @param {string[]} input.gapsFromAgent
 * @param {Array<{ kind: string, key: string, value: string, hasConflict?: boolean, valueAlt?: string }>} input.memories
 * @param {Array<{ key: string, value: string, status?: string }>} input.confirmationFacts
 */
export function buildProfileSnapshot({ summaryText, gapsFromAgent, memories, confirmationFacts = [] }) {
  const snap = emptySnapshot();
  snap.schemaVersion = SNAPSHOT_SCHEMA_VERSION;
  snap.summary = summaryText || "";
  snap.gaps = Array.isArray(gapsFromAgent) ? [...new Set(gapsFromAgent.map((x) => String(x).trim()).filter(Boolean))].slice(0, 20) : [];

  /** @type {Record<string, string>} */
  const structuredFacts = {};
  const insights = [];

  for (const m of memories) {
    if (m.kind === "insight") {
      insights.push(`${m.key}: ${m.value}`);
      continue;
    }
    if (m.kind === "confirmed" || m.kind === "candidate" || m.kind === "preference") {
      structuredFacts[m.key] = m.value;
    }
  }

  snap.structuredFacts = structuredFacts;
  snap.insights = insights.slice(0, 24);

  const factStatus = new Map();
  for (const m of memories) {
    if (m.kind === "insight") continue;
    if (m.hasConflict) factStatus.set(m.key, "conflict");
  }
  for (const m of memories) {
    if (m.kind === "insight") continue;
    if (factStatus.get(m.key) === "conflict") continue;
    if (m.kind === "confirmed") factStatus.set(m.key, "confirmed");
    else if ((m.kind === "candidate" || m.kind === "preference") && !factStatus.has(m.key)) factStatus.set(m.key, "pending");
  }

  snap.confirmationState = {
    facts: [],
  };

  const seen = new Set();
  for (const [key, value] of Object.entries(structuredFacts)) {
    const id = `fact_${key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let st = /** @type {'confirmed'|'pending'|'conflict'} */ ("pending");
    const fs = factStatus.get(key);
    if (fs === "confirmed") st = "confirmed";
    if (fs === "conflict") st = "conflict";
    snap.confirmationState.facts.push({
      id,
      key,
      value: String(value),
      status: /** @type {'confirmed'|'pending'|'conflict'} */ (st),
    });
  }

  for (const cf of confirmationFacts) {
    const existing = snap.confirmationState.facts.find((f) => f.key === cf.key);
    if (existing && cf.status) {
      existing.status = cf.status === "conflict" ? "conflict" : existing.status;
    }
  }

  snap.updatedAt = new Date().toISOString();
  return snap;
}

/**
 * 持久化快照中的 confirmationState / structuredFacts 可能落后于真实记忆（删除会话后会话侧记忆已清，但磁盘快照仍嵌入旧条目）。
 * 用 frozen 快照中的摘要与缺口文案 + **当前 store 记忆**重建面向用户的一致性视图。
 *
 * @param {object | null} frozen — 最近一次落库快照，可为 null。
 * @param {Array<{ kind: string, key: string, value: string, hasConflict?: boolean, valueAlt?: string }>} memoriesFromStore
 * @returns {object | null}
 */
export function hydrateProfileSnapshotFromMemories(frozen, memoriesFromStore) {
  const rows = Array.isArray(memoriesFromStore) ? memoriesFromStore : [];
  const memories = rows.map((m) => ({
    kind: String(m.kind || ""),
    key: String(m.key || ""),
    value: String(m.value ?? ""),
    hasConflict: Boolean(m.hasConflict),
    valueAlt: m.valueAlt != null ? String(m.valueAlt) : undefined,
  }));

  const hasFrozen = frozen && typeof frozen === "object";

  /** @type {string} */
  const summaryText =
    hasFrozen && typeof frozen.summary === "string" ? frozen.summary : hasFrozen ? String(frozen.summary ?? "") : "";
  /** @type {string[]} */
  const gapsArr = hasFrozen && Array.isArray(frozen.gaps) ? frozen.gaps : [];

  const hasStructural =
    memories.some((m) => ["confirmed", "candidate", "preference", "insight"].includes(m.kind)) ||
    summaryText.trim() !== "" ||
    gapsArr.length > 0;

  if (!hasStructural) return null;

  return buildProfileSnapshot({
    summaryText,
    gapsFromAgent: gapsArr,
    memories,
  });
}
