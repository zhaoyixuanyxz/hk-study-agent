import OpenAI from "openai";
import {
  filterCitationsAgainstCombinedSources,
  filterCitationsAgainstIntelligenceItems,
  normalizeCitations,
} from "./citation-utils.js";
import { composeSystemPrompt } from "./promptLayer.js";
import { assessChatScope, buildScopeRedirectAgentOutput } from "./chat-scope.js";
import { normalizeLocale } from "./output-locale.js";

const REPLY_MAX_CHARS = 1000;
const TRUNC_SUFFIX = "\n\n（已为你收敛篇幅，如需展开可继续追问。）";
const POLICY_HINT = /(?:截止日期|学费|录取要求|申请要求|语言要求|滚动录取|招生简章|官网明确)/;

function pickFirstNonEmptyString(obj, keys) {
  if (!obj || typeof obj !== "object") return "";
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const s = String(obj[k] ?? "").trim();
    if (s) return s;
  }
  return "";
}

/** 去掉末尾 ``` / ```json 围栏块（模型常把 JSON 再贴一遍在正文后）。 */
export function stripTrailingMarkdownJsonBlocks(s) {
  let t = String(s ?? "");
  const re = /\r?\n*```(?:json)?\s*\r?\n[\s\S]*?```\s*$/i;
  for (let i = 0; i < 24; i++) {
    const next = t.replace(re, "").trimEnd();
    if (next === t) break;
    t = next;
  }
  return t;
}

function tryParseJsonObject(str) {
  const t = String(str || "").trim();
  if (!t) return null;
  try {
    const o = JSON.parse(t);
    if (o && typeof o === "object" && !Array.isArray(o)) return o;
  } catch {
    /* ignore */
  }
  return null;
}

/** 从首个 `{` 起做括号深度扫描，取第一个平衡的 JSON 对象子串（忽略字符串内的括号）。 */
function extractFirstBalancedJsonObject(s) {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = false;
        continue;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

const EMPTY_MODEL = {
  reply: "",
  gaps: [],
  gap_items: [],
  suggested_followups: [],
  readiness_for_profile: false,
  citations: [],
};

function mergeEmptyModel(parsed) {
  return { ...EMPTY_MODEL, ...parsed };
}

/**
 * 解析模型输出：优先整段 JSON、随后 ```json``` 围栏内 JSON、再尝试从正文中切出平衡对象。
 * 避免旧版贪婪 `/{...}/` 在含 `}` 的正文或嵌套场景下解析失败，导致整段原文（含重复围栏）进入 reply。
 */
export function parseJson(content) {
  let s = String(content || "").trim();
  if (!s) {
    return mergeEmptyModel({
      reply: "（未能解析模型输出，请重试。）",
    });
  }

  let o = tryParseJsonObject(s);
  if (o) return mergeEmptyModel(o);

  const fenceRe = /```(?:json)?\s*\r?\n?([\s\S]*?)```/gi;
  const fenced = [];
  let fm;
  while ((fm = fenceRe.exec(s)) !== null) {
    const inner = fm[1].trim();
    const p = tryParseJsonObject(inner);
    if (p) fenced.push(p);
  }
  if (fenced.length) {
    return mergeEmptyModel(fenced[fenced.length - 1]);
  }

  const balanced = extractFirstBalancedJsonObject(s);
  if (balanced) {
    o = tryParseJsonObject(balanced);
    if (o) return mergeEmptyModel(o);
  }

  const stripped = stripTrailingMarkdownJsonBlocks(s);
  if (stripped !== s && stripped.length < s.length) {
    return parseJson(stripped);
  }

  return mergeEmptyModel({
    reply: stripTrailingMarkdownJsonBlocks(s) || "（未能解析模型输出，请重试。）",
  });
}

function defaultImpactForGap(g) {
  const s = String(g);
  if (/预算|费用|学费/i.test(s)) return "预算不明时，方案梯度与费用测算可能偏差。";
  if (/时间|入学|申请季|截止/i.test(s)) return "时间线不清时，选校梯度与执行节奏难以准确落地。";
  if (/语言|雅思|托福|GRE|GMAT/i.test(s)) return "语言与标化未定时，匹配院校与风险分层可能偏乐观或偏保守。";
  if (/GPA|均分|成绩|本科/i.test(s)) return "学术画像不完整时，冲刺/匹配/保底的定位可信度下降。";
  if (/目标|专业|方向|国家|地区|香港/i.test(s)) return "目标方向未定时，方案主线与叙事难以收敛。";
  if (/风险/i.test(s)) return "风险偏好不明时，梯队组合可能不符合你的承受能力。";
  return "该项会影响后续方案与报告中的依据充分度。";
}

/**
 * @param {unknown} raw
 * @param {string[]} gaps
 * @returns {{ gap: string, impact: string }[]}
 */
function normalizeGapItems(raw, gaps) {
  /** @type {{ gap: string, impact: string }[]} */
  let items = [];
  if (Array.isArray(raw)) {
    for (const x of raw) {
      if (!x || typeof x !== "object") continue;
      const gap = String(x.gap || x.label || "").trim();
      const impact = String(x.impact || x.effect || "").trim();
      if (gap) items.push({ gap, impact: impact || defaultImpactForGap(gap) });
    }
  }
  if (!items.length && Array.isArray(gaps) && gaps.length) {
    items = gaps.map((g) => {
      const gap = String(g).trim();
      return { gap, impact: defaultImpactForGap(gap) };
    });
  }
  return items.slice(0, 12);
}

function maybeDisclaimPolicyFacts(reply, citations) {
  if (citations.length) return reply;
  if (!POLICY_HINT.test(reply)) return reply;
  if (/官网|官方|不作为事实依据|请以院校/.test(reply)) return reply;
  return (
    reply +
    "\n\n（说明：涉及招生政策与数字类信息请以院校官网或官方材料为准；以下无外链时不作为可追溯事实依据。）"
  );
}

function capReply(reply) {
  if (reply.length <= REPLY_MAX_CHARS) return reply;
  const budget = REPLY_MAX_CHARS - TRUNC_SUFFIX.length;
  return (budget > 0 ? reply.slice(0, budget) : reply.slice(0, REPLY_MAX_CHARS)) + TRUNC_SUFFIX;
}

export function normalizeAgentOutput(data) {
  let reply = pickFirstNonEmptyString(data, [
    "reply",
    "Reply",
    "answer",
    "response",
    "message",
    "content",
    "assistant_reply",
    "output",
    "text",
  ]);
  if (!reply) reply = "（助手未返回可读正文，可能是模型 JSON 字段不符或网络异常，请再发一条消息重试。）";
  reply = stripTrailingMarkdownJsonBlocks(reply).trim();
  const cut = reply.search(/\r?\n```(?:json)?\s*$/i);
  if (cut > 0) reply = reply.slice(0, cut).trimEnd();
  reply = stripTrailingMarkdownJsonBlocks(reply).trim();

  let gaps = Array.isArray(data.gaps) ? data.gaps : [];
  gaps = gaps.map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
  let sug =
    data.suggested_followups || data.suggested_followup_questions || [];
  if (!Array.isArray(sug)) sug = [];
  sug = sug.map((x) => String(x).trim()).filter(Boolean).slice(0, 2);

  const citations = normalizeCitations(data.citations);
  reply = maybeDisclaimPolicyFacts(reply, citations);
  reply = capReply(reply);

  const gap_items = normalizeGapItems(data.gap_items, gaps);

  return {
    reply,
    gaps,
    gap_items,
    suggested_followups: sug,
    readiness_for_profile: Boolean(data.readiness_for_profile),
    citations,
    scope_redirect: Boolean(data.scope_redirect),
  };
}

function mockCitationsFromIntel(userMessage, intelItems) {
  if (!Array.isArray(intelItems) || !intelItems.length) return [];
  if (!POLICY_HINT.test(userMessage) && !/香港|港大|学费|截止|招生|院校官网|hku|cuhk/i.test(userMessage)) {
    return [];
  }
  const item = intelItems[0];
  if (!item?.id || !item.canonicalUrl) return [];
  return [
    {
      itemId: item.id,
      url: item.canonicalUrl,
      sourceTitle: item.locale?.titleZh,
      publishedAt: item.publishedAt,
      quoteOrSummary: String(item.locale?.summaryZh || "").slice(0, 200),
    },
  ];
}

function applyIntelCitationAllowlist(out, intelItems, extKbEntries = []) {
  if (!Array.isArray(intelItems) || !intelItems.length) {
    if (!Array.isArray(extKbEntries) || !extKbEntries.length) return out;
  }
  const citations = filterCitationsAgainstCombinedSources(out.citations, intelItems || [], extKbEntries || []);
  const reply = maybeDisclaimPolicyFacts(out.reply, citations);
  return { ...out, citations, reply: capReply(reply) };
}

export async function runProfileAgent({
  userMessage,
  historyOpenai,
  useMock,
  deepseekApiKey,
  deepseekBaseUrl,
  deepseekModel,
  memoryContext,
  intelContextText,
  intelItems,
  extKbEntries,
  profileSnapshot,
  locale,
}) {
  const loc = normalizeLocale(locale);
  const scope = assessChatScope({ userMessage, snapshot: profileSnapshot });
  if (!scope.inScope) {
    return applyIntelCitationAllowlist(
      normalizeAgentOutput(buildScopeRedirectAgentOutput(scope)),
      intelItems,
      extKbEntries
    );
  }

  const intelBlock =
    intelContextText && String(intelContextText).trim()
      ? [{ role: "system", content: String(intelContextText).slice(0, 8000) }]
      : [];

  if (useMock) {
    const turns = 1 + historyOpenai.filter((m) => m.role === "user").length;
    let gaps = [];
    let reply;
    let suggestedFollowups;
    if (loc === "en") {
      if (turns < 2) gaps = ["Target HK schools and taught MSc field"];
      else if (turns < 3) gaps = ["Planned intake / application season", "Budget range"];
      if (turns === 1) {
        reply =
          "Assessment: just starting. Reason: need your target HK schools and taught-master field. Next: which Hong Kong universities/program areas are you considering?";
      } else if (turns === 2) {
        reply =
          "Assessment: main direction is clearer. Reason: still missing timeline and budget, which heavily affect tier mix and cost risk. Next: share your planned intake year/season and rough budget range?";
      } else {
        reply =
          "Assessment: enough for an initial profile. Reason: academics, direction, timeline and budget meet the minimum set. Short diagnosis: treat HK taught masters as the main narrative, then fine-tune tiers. Next: confirm facts in the profile page, then try generating a plan.";
      }
      suggestedFollowups = ["Could you share current language scores or test plans?"];
    } else {
      if (turns < 2) gaps = ["目标港校与授课型硕士专业方向"];
      else if (turns < 3) gaps = ["计划入学时间或申请季", "预算大致区间"];
      if (turns === 1) {
        reply =
          "判断：刚开始建档，信息尚少。原因：还需要了解你的港校目标与学术背景主干。下一步：请先说说意向的香港高校/专业大类（授课型硕士）？";
      } else if (turns === 2) {
        reply =
          "判断：主线方向更清晰了。原因：仍缺时间与预算，对方案梯队和费用风险影响很大。下一步：补充计划入学年份/申请季和大致预算区间？";
      } else {
        reply =
          "判断：主干信息已够做初步画像。原因：学术、方向、时间线与预算已具备最小集合。短诊断：可把香港授课型硕士作为主叙事线，后续再微调梯度。下一步：你可以在「核对档案」确认事实后，尝试生成方案。";
      }
      suggestedFollowups = ["方便说说目前语言成绩或考试计划吗？"];
    }
    const readiness = turns >= 3 && !gaps.length;
    const memHint = memoryContext
      ? loc === "en"
        ? "\n\n(Retrieved memory fragments related to you are available; continue accordingly, but do not re-ask already covered information.)"
        : "\n\n（系统已检索到与你相关的历史记忆片段，可适当承接，但不要重复追问已覆盖的信息。）"
      : "";
    const rawCites = mockCitationsFromIntel(userMessage, intelItems);
    let mockReply = reply;
    if (rawCites.length && POLICY_HINT.test(userMessage) === false && /学费|截止|政策|录取要求/i.test(userMessage)) {
      mockReply =
        loc === "en"
          ? reply +
            "\n\nPer the intelligence library, see the official summary of the linked entries below; confirm numbers and deadlines against the school's official website."
          : reply +
            "\n\n根据情报库检索，可参考下方已上线条目的官方摘要（链接见引用区）；具体数字与截止日期请以院校官网为准。";
    }
    return applyIntelCitationAllowlist(
      normalizeAgentOutput({
        reply: mockReply + memHint,
        gaps,
        gap_items: [],
        suggested_followups: suggestedFollowups,
        readiness_for_profile: readiness,
        citations: rawCites,
      }),
      intelItems,
      extKbEntries
    );
  }

  const client = new OpenAI({
    apiKey: deepseekApiKey,
    baseURL: deepseekBaseUrl,
  });
  const system = composeSystemPrompt("v1", { locale: loc });
  const mem =
    memoryContext && String(memoryContext).trim()
      ? [{ role: "system", content: `[RETRIEVED_MEMORY]\n${String(memoryContext).slice(0, 6000)}` }]
      : [];
  const messages = [
    { role: "system", content: system },
    ...intelBlock,
    ...mem,
    ...historyOpenai.slice(-24),
    { role: "user", content: userMessage },
  ];

  const completion = await client.chat.completions.create({
    model: deepseekModel,
    messages,
    temperature: 0.7,
    max_tokens: 900,
  });
  const raw = completion.choices[0]?.message?.content || "";
  return applyIntelCitationAllowlist(normalizeAgentOutput(parseJson(raw)), intelItems, extKbEntries);
}
