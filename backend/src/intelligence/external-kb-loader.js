import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractProfileSearchHints } from "./profile-search-hints.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = join(__dirname, "..", "..", "data", "intelligence", "external-kb.json");

/** @type {object | null} */
let cached = null;

/**
 * @returns {{ version: number, entries: object[] }}
 */
export function loadExternalKb() {
  if (cached) return cached;
  const path = String(process.env.EXTERNAL_KB_FILE || DEFAULT_PATH).trim();
  if (!existsSync(path)) {
    cached = { version: 1, entries: [] };
    return cached;
  }
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  cached = { version: raw.version || 1, entries };
  return cached;
}

/**
 * @param {object} entry
 */
export function externalKbCitationId(entry) {
  const id = String(entry?.id || "").trim();
  if (!id) return "";
  return id.startsWith("ext_kb_") ? id : `ext_kb_${id}`;
}

/**
 * @param {object} entry
 */
export function isOfficialExternalKb(entry) {
  return String(entry?.trustTier || "official").toLowerCase() === "official";
}

/**
 * @param {{ planInputView?: object, snapshot?: object, userMessage?: string, limit?: number }} opts
 */
export function selectExternalKbForProfile(opts = {}) {
  const { entries } = loadExternalKb();
  const official = entries.filter((e) => isOfficialExternalKb(e) && String(e.url || "").trim());
  if (!official.length) return [];

  const hints = extractProfileSearchHints(opts);
  const limit = Math.min(12, Math.max(1, Number(opts.limit) || 6));
  const field = String(hints.field || "").toLowerCase();

  const scored = official.map((entry) => {
    let score = 0;
    const reasons = [];
    const schools = entry.schoolIds || [];
    if (hints.targetSchools.length && schools.some((s) => hints.targetSchools.includes(s))) {
      score += 3;
      reasons.push("目标院校匹配");
    }
    if (field && (entry.programTags || []).some((t) => String(t).toLowerCase().includes(field) || String(t).includes(hints.field))) {
      score += 2;
      reasons.push("专业方向匹配");
    }
    if (entry.infoTypes?.includes("admission_req") || entry.infoTypes?.includes("program_page")) {
      score += 1;
      reasons.push("官方项目/要求页");
    }
    return { entry, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const picked =
    scored.some((x) => x.score > 0) ? scored.filter((x) => x.score > 0) : scored;
  return picked.slice(0, limit).map((x) => ({ ...x.entry, _relevanceReasons: x.reasons }));
}

/**
 * @param {object[]} entries
 */
export function formatExternalKbContextText(entries) {
  if (!Array.isArray(entries) || !entries.length) return "";
  const lines = entries.map((e, i) => {
    const cid = externalKbCitationId(e);
    const schools = Array.isArray(e.schoolIds) ? e.schoolIds.join(",") : "";
    const tags = Array.isArray(e.programTags) ? e.programTags.join(",") : "";
    const why = Array.isArray(e._relevanceReasons) && e._relevanceReasons.length ? e._relevanceReasons.join("；") : "官方知识库";
    return `${i + 1}. itemId=${cid} | title=${e.title || ""} | url=${e.url} | trust=official | schools=${schools} | tags=${tags}\n   relevance: ${why}`;
  });
  return (
    "[EXTERNAL_KB — 官方外链知识库，citation 可使用 ext_kb_* 的 itemId 与对应 url]\n" + lines.join("\n")
  );
}

/**
 * @param {object[]} entries
 */
export function externalKbToAllowlistMap(entries) {
  const map = new Map();
  for (const e of entries || []) {
    if (!isOfficialExternalKb(e)) continue;
    const id = externalKbCitationId(e);
    const url = String(e.url || "").trim();
    if (!id || !url.startsWith("http")) continue;
    map.set(id, {
      canonicalUrl: url,
      sourceTitle: String(e.title || id).slice(0, 500),
      publishedAt: e.publishedAt || null,
    });
  }
  return map;
}
