import OpenAI from "openai";
import {
  citationsToCitationRefs,
  filterCitationsAgainstCombinedSources,
  normalizeCitations,
} from "./citation-utils.js";
import {
  externalKbCitationId,
  selectExternalKbForProfile,
} from "./intelligence/external-kb-loader.js";
import { loadPromptText } from "./promptLayer.js";
import { buildMockPlanVisuals, normalizePlanVisuals } from "./visuals-normalize.js";

const PLAN_RESULT_SCHEMA_VERSION = "1.0";

/** @returns {number} 毫秒，默认 120s */
export function getPlanGenerationTimeoutMs() {
  const n = Number(process.env.PLAN_GENERATION_TIMEOUT_MS);
  if (Number.isFinite(n) && n >= 5000 && n <= 600000) return Math.floor(n);
  return 120000;
}

const DEFAULT_DISCLAIMER =
  "本方案由系统根据你提供的信息自动生成，仅供参考，不构成任何录取、签证或财务承诺。具体选校、申请要求与截止时间请以院校及官方渠道为准。";

/**
 * @param {object | null} latestSnapshotRow store.getLatestProfileSnapshot 返回值
 * @returns {{ ok: true } | { ok: false, code: string, message: string, retryable: boolean, suggestion?: string, meta?: object }}
 */
export function checkPlanGenerationPreconditions(latestSnapshotRow) {
  if (!latestSnapshotRow) {
    return {
      ok: false,
      code: "INPUT_INCOMPLETE",
      message: "暂无画像快照，请先完成对话建档。",
      retryable: false,
      suggestion: "返回对话页补充背景与目标信息。",
    };
  }
  const piv = latestSnapshotRow.planInputView;
  if (!piv || typeof piv !== "object") {
    return {
      ok: false,
      code: "INPUT_INCOMPLETE",
      message: "缺少方案输入视图 planInputView。",
      retryable: false,
      suggestion: "继续对话以生成画像，或刷新画像页后重试。",
    };
  }
  const ready = piv.readiness?.ready === true;
  if (!ready) {
    const missing = (piv.readiness && piv.readiness.missingRequired) || [];
    return {
      ok: false,
      code: "READINESS_NOT_MET",
      message:
        missing.length > 0
          ? `方案生成门槛未满足：尚缺维度 ${missing.join("、")}。`
          : "方案生成门槛未满足：画像仍存在待补充项或缺口。",
      retryable: false,
      suggestion: "请完善对话或确认关键事实后再试。",
      meta: { missingRequired: missing },
    };
  }
  return { ok: true };
}

/**
 * @param {object} planInputView
 */
function flattenDim(piv, key) {
  const block = piv[key];
  const v = block && block.value;
  if (!v || typeof v !== "object") return {};
  return { ...v };
}

/**
 * @param {object[]} intelItems
 * @param {object[]} extKbEntries
 * @param {object} planInputView
 */
function mockRichCitations(intelItems, extKbEntries, planInputView) {
  const field = String(planInputView?.goals?.value?.field || "目标专业").trim();
  const intake = String(planInputView?.timeline?.value?.intake_or_season || "").trim();
  const out = [];
  const intelPool = Array.isArray(intelItems) ? intelItems : [];
  const extPool = Array.isArray(extKbEntries) ? extKbEntries : [];

  const intelOrder = [
    ...intelPool.filter((x) => x.infoType === "benchmark"),
    ...intelPool.filter((x) => x.infoType === "deadline" || x.infoType === "policy"),
    ...intelPool,
  ];
  for (const item of intelOrder) {
    if (!item?.id || !item.canonicalUrl || out.length >= 8) break;
    if (out.some((c) => c.itemId === item.id)) continue;
    out.push({
      itemId: item.id,
      url: item.canonicalUrl,
      sourceTitle: item.locale?.titleZh,
      publishedAt: item.publishedAt,
      quoteOrSummary: `与 ${field}、${intake || "申请季"} 相关的已发布情报：${(item.locale?.summaryZh || "").slice(0, 120)}`,
    });
  }

  for (const entry of extPool) {
    if (out.length >= 12) break;
    const id = externalKbCitationId(entry);
    if (!id || !entry.url || out.some((c) => c.itemId === id)) continue;
    out.push({
      itemId: id,
      url: entry.url,
      sourceTitle: entry.title,
      publishedAt: entry.publishedAt,
      quoteOrSummary: `官方知识库：${entry.title || id}（${field}）`,
    });
  }

  return out.slice(0, 12);
}

function applyIntelToPlan(plan, intelItems, extKbEntries = []) {
  if (!plan) return plan;
  const citations = filterCitationsAgainstCombinedSources(plan.citations, intelItems || [], extKbEntries || []);
  const mockOnly = citations.length < 6;
  const merged = mockOnly
    ? filterCitationsAgainstCombinedSources(
        mockRichCitations(intelItems, extKbEntries, plan._planInputView),
        intelItems || [],
        extKbEntries || []
      )
    : citations;
  const { _planInputView, ...rest } = plan;
  return { ...rest, citations: merged, citationRefs: citationsToCitationRefs(merged) };
}

export function buildMockStructuredPlan(planInputView, intelItems, extKbEntries) {
  const ext =
    extKbEntries ||
    selectExternalKbForProfile({ planInputView, limit: 8 });
  const g = flattenDim(planInputView, "goals");
  const a = flattenDim(planInputView, "academic");
  const b = flattenDim(planInputView, "budget");
  const t = flattenDim(planInputView, "timeline");
  const r = flattenDim(planInputView, "riskPreference");

  const region = g.target_region || g.intent_degree || "目标地区";
  const field = g.field || "意向专业";
  const gpa = a.gpa || "（未提供）";
  const school = a.school_background || "（未提供）";
  const budget = b.budget_range || "（未提供）";
  const intake = t.intake_or_season || "（未提供）";
  const risk = r.risk_style || "均衡";

  const base = {
    schemaVersion: PLAN_RESULT_SCHEMA_VERSION,
    disclaimer: DEFAULT_DISCLAIMER,
    risk_summary: `基于你当前背景（${school}，GPA ${gpa}）与目标（${region} · ${field}），申请仍受当年竞争、名额与材料质量影响；请避免将任何表述理解为录取承诺。`,
    budget_suggestion: `已提供预算区间：${budget}。建议预留语言考试、认证、申请费与生活费波动；具体以官方费用与汇率为准。`,
    timeline_suggestion: `意向入学/申请季：${intake}。建议按「材料准备 → 网申与推荐信 → 面试/补件」倒排里程碑，并关注目标院校轮次截止日期。`,
    timeline_urgency: "normal",
    citations: [],
    tiers: {
      reach: {
        label: "冲刺",
        summary: `在 ${region} 方向尝试更 competitive 的项目组合（${field}），以匹配你的长期目标。`,
        rationale: `在风险偏好为「${risk}」时，冲刺档用于探索上限；请结合 GPA/语言与项目先修要求，优先选择与你叙事一致的项目。`,
        risk_note: `冲刺档不确定性更高：竞争激烈与当年名额波动可能导致结果偏离预期，不代表录取概率承诺。`,
        fit_note: `程序匹配度：Math M1/M2 与核心科学选修对 DS/AI 等港校项目权重较高；若科目成绩未达 typical admitted profile，冲刺档匹配度偏低（基于历史趋势，非官方概率）。`,
      },
      match: {
        label: "匹配",
        summary: `主申路径：与 ${school} 背景、${field} 目标较一致的项目组合。`,
        rationale: `该档强调可行性与目标匹配；建议把主要精力与文书材料放在这一档的项目上。`,
        risk_note: `匹配档仍需满足语言、先修与材料完整性；「匹配」不等于自动录取。`,
        fit_note: `程序匹配度：本科背景与 ${field} 主线一致；GPA ${gpa} 接近港校授课型硕士常见 admitted 区间（基于历史趋势，请以当年官网为准）。`,
      },
      safety: {
        label: "保底",
        summary: `更稳妥的备选路径：降低「全拒」风险，但仍需满足项目最低要求与材料完整性。`,
        rationale: `保底不等于「一定录取」，用于平衡风险；建议仍认真完成材料与面试准备。`,
        risk_note: `保底院校仍有最低门槛与材料审核；懈怠准备仍可能导致意外失利。`,
        fit_note: `程序匹配度：保底档通常对应门槛低于主申组合的项目；仍须满足官网公示的语言与先修底线，rolling round 自费路径相对可行。`,
      },
    },
  };
  base._planInputView = planInputView;
  const withIntel = applyIntelToPlan(base, intelItems, ext);
  const visuals = normalizePlanVisuals(withIntel.visuals) || buildMockPlanVisuals(planInputView, withIntel);
  const { _planInputView, ...planOut } = withIntel;
  return { ...planOut, visuals };
}

function parsePlanJson(content) {
  const s = String(content || "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const m = /\{[\s\S]*\}/.exec(s);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

function normalizeTimelineUrgency(raw) {
  const x = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (x === "relaxed" || x === "normal" || x === "tight") return x;
  return null;
}

export function normalizePlanResult(raw) {
  if (!raw || typeof raw !== "object") return null;
  const d = String(raw.disclaimer || "").trim() || DEFAULT_DISCLAIMER;
  const tiers = raw.tiers || {};
  const reach = tiers.reach || tiers.冲刺;
  const match = tiers.match || tiers.匹配;
  const safety = tiers.safety || tiers.保底;
  if (!reach || !match || !safety) return null;
  const one = (t, label) => {
    const o = t && typeof t === "object" ? t : {};
    /** @type {{ label: string, summary: string, rationale: string, risk_note: string, fit_note?: string }} */
    const tier = {
      label: String(o.label || label),
      summary: String(o.summary || "").trim() || "（未生成）",
      rationale: String(o.rationale || "").trim() || "（未生成）",
      risk_note: String(o.risk_note || o.risk || "").trim(),
    };
    const fitNote = String(o.fit_note || "").trim();
    if (fitNote) tier.fit_note = fitNote;
    return tier;
  };
  const citations = normalizeCitations(raw.citations);
  const citationRefs = citationsToCitationRefs(citations);
  const timeline_urgency = normalizeTimelineUrgency(raw.timeline_urgency);
  /** @type {Record<string, unknown>} */
  const out = {
    schemaVersion: String(raw.schemaVersion || PLAN_RESULT_SCHEMA_VERSION),
    disclaimer: d,
    risk_summary: String(raw.risk_summary || "").trim() || "（未生成）",
    budget_suggestion: String(raw.budget_suggestion || "").trim() || "（未生成）",
    timeline_suggestion: String(raw.timeline_suggestion || "").trim() || "（未生成）",
    tiers: {
      reach: one(reach, "冲刺"),
      match: one(match, "匹配"),
      safety: one(safety, "保底"),
    },
    citations,
    citationRefs,
  };
  if (timeline_urgency) out.timeline_urgency = timeline_urgency;
  const visuals = normalizePlanVisuals(raw.visuals);
  if (visuals) out.visuals = visuals;
  return /** @type {typeof out & { timeline_urgency?: string; visuals?: object }} */ (out);
}

/**
 * @param {object} planInputView
 * @param {{
 *   useMock: boolean,
 *   deepseekApiKey?: string,
 *   deepseekBaseUrl?: string,
 *   deepseekModel?: string,
 *   timeoutMs?: number,
 *   intelContextText?: string,
 *   intelItems?: object[],
 *   extKbEntries?: object[],
 * }} opts
 */
export async function generateStructuredPlan(planInputView, opts) {
  if (opts.useMock) {
    const plan = buildMockStructuredPlan(planInputView, opts.intelItems, opts.extKbEntries);
    return { ok: true, plan };
  }

  const timeoutMs = opts.timeoutMs ?? getPlanGenerationTimeoutMs();
  const client = new OpenAI({
    apiKey: opts.deepseekApiKey,
    baseURL: opts.deepseekBaseUrl || "https://api.deepseek.com",
    timeout: timeoutMs,
    maxRetries: 0,
  });

  const system =
    loadPromptText("plan.txt") ||
    "你是留学规划助手。只输出一个 JSON 对象，不要输出 markdown。";

  let user = `请仅基于以下 planInputView（JSON）生成结构化方案：\n${JSON.stringify(planInputView, null, 2)}`;
  if (opts.intelContextText && String(opts.intelContextText).trim()) {
    user += `\n\n${String(opts.intelContextText).slice(0, 8000)}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: opts.deepseekModel || "deepseek-chat",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.35,
      signal: controller.signal,
    });
  } catch (e) {
    const aborted =
      e?.name === "AbortError" ||
      e?.constructor?.name === "APIUserAbortError" ||
      /aborted|timeout/i.test(String(e?.message || "")) ||
      String(e?.code || "") === "ETIMEDOUT";
    if (aborted) {
      return {
        ok: false,
        code: "GENERATION_TIMEOUT",
        message: `方案生成超时（>${Math.round(timeoutMs / 1000)}s），请稍后重试。`,
        retryable: true,
        suggestion: "可稍后重试，或联系管理员检查模型服务与 PLAN_GENERATION_TIMEOUT_MS。",
      };
    }
    return {
      ok: false,
      code: "GENERATION_FAILED",
      message: "模型调用失败，请稍后重试。",
      retryable: true,
      suggestion: "请稍后重试；若持续失败请检查模型服务配置。",
    };
  } finally {
    clearTimeout(timer);
  }

  const text = completion.choices?.[0]?.message?.content || "";
  const parsed = parsePlanJson(text);
  const normalized = normalizePlanResult(parsed);
  if (!normalized) {
    return {
      ok: false,
      code: "GENERATION_FAILED",
      message: "模型输出无法解析为合法方案结构。",
      retryable: true,
      suggestion: "请重试生成。",
    };
  }
  const applied = applyIntelToPlan(
    { ...normalized, _planInputView: planInputView },
    opts.intelItems,
    opts.extKbEntries
  );
  const { _planInputView, ...rest } = applied;
  const visuals = normalizePlanVisuals(rest.visuals) || buildMockPlanVisuals(planInputView, rest);
  return { ok: true, plan: { ...rest, visuals } };
}
