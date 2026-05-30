import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_RULES_PATH = join(__dirname, "..", "data", "chat-scope-rules.json");

/** @type {object | null} */
let cachedRules = null;

/**
 * @returns {object}
 */
export function loadChatScopeRules() {
  if (cachedRules) return cachedRules;
  const path = String(process.env.CHAT_SCOPE_RULES_FILE || DEFAULT_RULES_PATH).trim();
  if (!existsSync(path)) {
    cachedRules = {
      violationPatterns: [],
      hkAnchorPatterns: ["香港"],
      taughtMasterPatterns: ["授课型硕士"],
      defaultRedirectReply: "本助手仅支持香港高校授课型硕士申请规划。",
      defaultGaps: ["目标港校与授课型硕士专业方向"],
    };
    return cachedRules;
  }
  cachedRules = JSON.parse(readFileSync(path, "utf8"));
  return cachedRules;
}

/**
 * @param {string} text
 * @param {string[]} patterns
 */
function matchesAnyPattern(text, patterns) {
  const t = String(text || "");
  for (const p of patterns || []) {
    const raw = typeof p === "string" ? p : p?.pattern;
    if (!raw) continue;
    try {
      if (new RegExp(raw, "i").test(t)) return true;
    } catch {
      /* ignore bad regex */
    }
  }
  return false;
}

/**
 * @param {string} userMessage
 * @param {object | null | undefined} snapshot
 */
export function assessChatScope({ userMessage, snapshot } = {}) {
  const rules = loadChatScopeRules();
  const msg = String(userMessage || "").trim();
  const snapText = snapshot ? JSON.stringify(snapshot).slice(0, 4000) : "";
  const combined = `${msg}\n${snapText}`;

  const hasHkAnchor = matchesAnyPattern(combined, rules.hkAnchorPatterns);
  const hasTaughtMaster = matchesAnyPattern(combined, rules.taughtMasterPatterns);
  const hkMasterAnchored = hasHkAnchor && (hasTaughtMaster || /硕士|master|研究生/i.test(msg));

  for (const vp of rules.violationPatterns || []) {
    const id = vp.id || "violation";
    const pattern = vp.pattern || vp;
    if (!pattern) continue;
    try {
      if (new RegExp(pattern, "i").test(msg)) {
        const noSkipOnHk = /^(phd|associate|ug_only|ug_reject_master|exclude_hk|overseas_taught)/.test(id);
        if (!noSkipOnHk && hkMasterAnchored && /^region_/.test(id)) {
          continue;
        }
        return {
          inScope: false,
          reason: id,
          redirectHint: rules.defaultRedirectReply,
          redirectReply: rules.defaultRedirectReply,
          suggestedGaps: rules.defaultGaps || [],
        };
      }
    } catch {
      /* ignore */
    }
  }

  if (/^(你好|hi|hello|在吗|咨询)/i.test(msg) && msg.length < 30) {
    return { inScope: true, reason: "greeting" };
  }

  if (hasHkAnchor && (hasTaughtMaster || /硕士|master|研究生/i.test(msg))) {
    return { inScope: true, reason: "hk_master_context" };
  }

  if (
    /留学|申请|硕士|master|研究生|gpa|雅思|托福|预算|入学/i.test(msg) &&
    !matchesAnyPattern(
      msg,
      (rules.violationPatterns || []).map((x) => x.pattern || x)
    )
  ) {
    return { inScope: true, reason: "general_planning_intake" };
  }

  return { inScope: true, reason: "default_allow" };
}

/**
 * @param {object} scope
 */
export function buildScopeRedirectAgentOutput(scope) {
  const gaps = Array.isArray(scope.suggestedGaps)
    ? scope.suggestedGaps.map((g) => String(g).trim()).filter(Boolean).slice(0, 12)
    : ["目标港校与授课型硕士专业方向"];
  return {
    reply: String(scope.redirectReply || scope.redirectHint || "").trim(),
    gaps,
    gap_items: gaps.map((gap) => ({
      gap,
      impact: "明确香港授课型硕士主线后，方案梯度与情报引用才能对齐。",
    })),
    suggested_followups: ["你计划申请哪所香港高校的授课型硕士项目？"],
    readiness_for_profile: false,
    citations: [],
    scope_redirect: true,
  };
}

/**
 * Strip extraction rows that encode non-HK primary targets when message was scoped.
 * @param {object} extracted
 */
export function sanitizeExtractionForHkMaster(extracted) {
  if (!extracted || typeof extracted !== "object") return extracted;
  const nonHkRegion = /^(美国|英国|加拿大|澳洲|澳大利亚|新加坡|欧洲|usa|uk)$/i;
  const filterRows = (arr) =>
    (Array.isArray(arr) ? arr : []).filter((row) => {
      if (!row || row.key !== "target_region") return true;
      const v = String(row.value || "").trim();
      if (!v) return true;
      if (/香港|hong\s*kong/i.test(v)) return true;
      return !nonHkRegion.test(v);
    });
  return {
    ...extracted,
    confirmed: filterRows(extracted.confirmed),
    candidate: filterRows(extracted.candidate),
    preference: filterRows(extracted.preference),
  };
}
