import OpenAI from "openai";
import {
  filterCitationsAgainstCombinedSources,
  normalizeCitations,
} from "./citation-utils.js";
import { loadPromptText } from "./promptLayer.js";
import { buildMockReportVisuals, normalizeReportVisuals } from "./visuals-normalize.js";
import { buildOutputLocaleBlock, normalizeLocale } from "./output-locale.js";

export const REPORT_RESULT_SCHEMA_VERSION = "2.0";

const DEFAULT_REPORT_DISCLAIMER =
  "本报告由系统根据对话建档信息与自动生成的留学方案整理而成，仅供参考，不构成任何录取、签证或财务承诺。具体选校、申请要求与截止时间请以院校及官方渠道为准。";

/** @returns {number} 毫秒，默认 120s */
export function getReportGenerationTimeoutMs() {
  const n = Number(process.env.REPORT_GENERATION_TIMEOUT_MS);
  if (Number.isFinite(n) && n >= 5000 && n <= 600000) return Math.floor(n);
  return 120000;
}

/**
 * 估算去标签后的正文字数（中文按字符计，英文按词+字符混合近似）
 * @param {string} html
 */
export function countReportTextChars(html) {
  const text = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "");
  return text.length;
}

/**
 * @param {object | null} latestSnapshotRow store.getLatestProfileSnapshot
 * @param {object | null} planRow planResult 行（含 plan、snapshotId）
 * @returns {{ ok: true } | { ok: false, code: string, message: string, retryable: boolean, suggestion?: string, meta?: object }}
 */
export function checkReportGenerationPreconditions(latestSnapshotRow, planRow) {
  if (!planRow || !planRow.plan || typeof planRow.plan !== "object") {
    return {
      ok: false,
      code: "NO_PLAN",
      message: "暂无可用的留学方案，请先生成方案后再生成报告。",
      retryable: false,
      suggestion: "前往「方案」页完成方案生成。",
    };
  }
  if (!latestSnapshotRow) {
    return {
      ok: false,
      code: "INPUT_INCOMPLETE",
      message: "暂无画像快照，无法生成报告。",
      retryable: false,
      suggestion: "请先完成对话建档并生成画像快照。",
    };
  }
  if (planRow.snapshotId && latestSnapshotRow.id && planRow.snapshotId !== latestSnapshotRow.id) {
    return {
      ok: false,
      code: "SNAPSHOT_MISMATCH",
      message: "当前画像快照与所选方案不一致，请先刷新画像或重新生成方案。",
      retryable: true,
      suggestion: "刷新画像页后重新生成方案，再生成报告。",
      meta: { plan_snapshot_id: planRow.snapshotId, latest_snapshot_id: latestSnapshotRow.id },
    };
  }
  return { ok: true };
}

const CHAPTER_DEFS = [
  { id: "ch1", title: "概述与执行摘要" },
  { id: "ch2", title: "申请人画像与关键事实" },
  { id: "ch3", title: "申请目标与策略框架" },
  { id: "ch4", title: "方案梯度说明（冲刺 / 匹配 / 保底）" },
  { id: "ch5", title: "风险、预算与时间线" },
  { id: "ch6", title: "材料准备与执行建议" },
  { id: "ch7", title: "免责声明与后续行动" },
];

function flattenSnapshotSummary(snapshot) {
  const s = snapshot && typeof snapshot === "object" ? snapshot : {};
  return String(s.summary || "").trim() || "（摘要未提供）";
}

function escapeHtmlText(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function asStringList(x, max = 8) {
  if (!Array.isArray(x)) return [];
  return x
    .map((t) => String(t || "").trim())
    .filter(Boolean)
    .slice(0, max);
}

const RISK_LEVELS = new Set(["high", "medium", "low"]);

/**
 * 规范化报告 delivery 块（parent_summary、action_plan、risk_items）。
 * @param {unknown} raw
 */
export function normalizeReportDelivery(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const ap = o.action_plan && typeof o.action_plan === "object" ? o.action_plan : {};
  const apObj = /** @type {Record<string, unknown>} */ (ap);
  const action_plan = {
    days_30: asStringList(apObj.days_30 ?? apObj["30"], 12),
    days_60: asStringList(apObj.days_60 ?? apObj["60"], 12),
    days_90: asStringList(apObj.days_90 ?? apObj["90"], 12),
  };
  const risk_items = [];
  if (Array.isArray(o.risk_items)) {
    for (const item of o.risk_items) {
      if (!item || typeof item !== "object") continue;
      const level = String(item.level || "")
        .trim()
        .toLowerCase();
      const label = String(item.label || "").trim();
      if (!RISK_LEVELS.has(level) || !label) continue;
      const entry = { level, label };
      const detail = String(item.detail || "").trim();
      if (detail) entry.detail = detail;
      risk_items.push(entry);
      if (risk_items.length >= 12) break;
    }
  }
  const visuals = normalizeReportVisuals(o.visuals);
  const delivery = {
    parent_summary: asStringList(o.parent_summary, 8),
    action_plan,
    risk_items,
    plain_language_notes: asStringList(o.plain_language_notes, 6),
  };
  if (visuals) delivery.visuals = visuals;
  return delivery;
}

/**
 * @param {object} plan
 */
function planCitations(plan) {
  const raw = plan && typeof plan === "object" && Array.isArray(plan.citations) ? plan.citations : [];
  return normalizeCitations(raw);
}

/**
 * @param {string[]} items
 * @param {boolean} ordered
 * @param {string} [emptyLabel]
 */
function listHtml(items, ordered, emptyLabel) {
  const empty = emptyLabel || "（暂无条目）";
  if (!items.length) return `<p>${escapeHtmlText(empty)}</p>`;
  const tag = ordered ? "ol" : "ul";
  const lis = items.map((t) => `<li>${escapeHtmlText(t)}</li>`).join("");
  return `<${tag} class="report-list">${lis}</${tag}>`;
}

/**
 * @param {object} parsed from model or mock
 * @param {object} mergedCitations normalized citations (plan + model)
 * @param {{ locale?: string }} [options]
 */
export function buildDeliverySectionsHtml(parsed, mergedCitations, options = {}) {
  const isEn = normalizeLocale(options.locale) === "en";
  const delivery = normalizeReportDelivery(parsed) || {
    parent_summary: [],
    action_plan: { days_30: [], days_60: [], days_90: [] },
    risk_items: [],
    plain_language_notes: [],
  };
  const parentLines = delivery.parent_summary;
  const d30 = delivery.action_plan.days_30;
  const d60 = delivery.action_plan.days_60;
  const d90 = delivery.action_plan.days_90;
  const gloss = delivery.plain_language_notes;

  const emptyList = isEn ? "(no entries)" : "（暂无条目）";
  const parentBlock = `<section class="report-chapter" id="parent-summary"><h2>${escapeHtmlText(isEn ? "Parent Decision Summary" : "家长决策摘要")}</h2><p class="report-lede">${escapeHtmlText(isEn ? "Conclusion scan for family decision-makers (budget, risk, direction)." : "以下为面向家庭决策者的结论速览（预算、风险与方向）。")}</p>${listHtml(
    parentLines,
    false,
    emptyList
  )}</section>`;

  const actionBlock = `<section class="report-chapter" id="action-plan"><h2>${escapeHtmlText(isEn ? "Student Action Plan (30 / 60 / 90 days)" : "学生行动计划（30 / 60 / 90 天）")}</h2>
    <h3 class="report-subh">${escapeHtmlText(isEn ? "Next 30 days" : "未来 30 天")}</h3>${listHtml(d30, true, emptyList)}
    <h3 class="report-subh">${escapeHtmlText(isEn ? "Days 31-60" : "第 31–60 天")}</h3>${listHtml(d60, true, emptyList)}
    <h3 class="report-subh">${escapeHtmlText(isEn ? "Days 61-90" : "第 61–90 天")}</h3>${listHtml(d90, true, emptyList)}
  </section>`;

  let citeInner = "";
  if (mergedCitations.length === 0) {
    citeInner = `<p>${escapeHtmlText(
      isEn
        ? "This report cites no external KB entries; strategy relies on onboarding chat and plan structure. If citations appear on the plan page, regenerate the report to sync."
        : "本报告未引用外部知识库条目；策略依据主要来自建档对话与方案结构。若方案页展示引用，可重新生成报告以同步。"
    )}</p>`;
  } else {
    citeInner = `<ul class="report-cite-list">${mergedCitations
      .map((c) => {
        const title = escapeHtmlText(c.sourceTitle || c.itemId || (isEn ? "source" : "来源"));
        const url = escapeHtmlText(c.url);
        return `<li><a href="${url}" rel="noopener noreferrer" target="_blank">${title}</a>${c.quoteOrSummary ? ` — ${escapeHtmlText(String(c.quoteOrSummary).slice(0, 200))}` : ""}</li>`;
      })
      .join("")}</ul>`;
  }
  const citeBlock = `<section class="report-chapter" id="report-citations"><h2>${escapeHtmlText(isEn ? "Citations & References" : "引用与参考来源")}</h2>${citeInner}</section>`;

  const glossBlock =
    gloss.length > 0
      ? `<section class="report-chapter" id="plain-language"><h2>${escapeHtmlText(isEn ? "Term Glossary" : "术语短解")}</h2>${listHtml(gloss, false, emptyList)}</section>`
      : "";

  const riskBlock = buildRiskItemsSectionHtml(delivery.risk_items, { locale: options.locale });

  return `\n${parentBlock}\n${riskBlock}\n${actionBlock}\n${citeBlock}\n${glossBlock}\n`;
}

const RISK_LEVEL_ZH = { high: "高", medium: "中", low: "低" };
const RISK_LEVEL_EN = { high: "High", medium: "Medium", low: "Low" };

/**
 * @param {{ level: string, label: string, detail?: string }[]} riskItems
 * @param {{ locale?: string }} [options]
 */
export function buildRiskItemsSectionHtml(riskItems, options = {}) {
  if (!Array.isArray(riskItems) || !riskItems.length) return "";
  const isEn = normalizeLocale(options.locale) === "en";
  const levelMap = isEn ? RISK_LEVEL_EN : RISK_LEVEL_ZH;
  const fallback = isEn ? "Medium" : "中";
  const cards = riskItems
    .map((r) => {
      const lvl = levelMap[r.level] || fallback;
      const detail = r.detail
        ? `<p class="risk-item-detail">${escapeHtmlText(r.detail)}</p>`
        : "";
      return `<div class="risk-card risk-card--${escapeHtmlText(r.level)}" data-risk-level="${escapeHtmlText(r.level)}">
        <span class="risk-level">${escapeHtmlText(lvl)}</span>
        <span class="risk-label">${escapeHtmlText(r.label)}</span>${detail}
      </div>`;
    })
    .join("");
  return `<section class="report-chapter report-risk-items" id="report-risk-items">
    <h2>${escapeHtmlText(isEn ? "Risk Dashboard" : "风险仪表盘")}</h2>
    <p class="report-lede">${escapeHtmlText(isEn ? "Structured risk items (report-generated, not admission promises)." : "结构化风险条目（由报告生成，非录取承诺）。")}</p>
    <div class="risk-dashboard-grid">${cards}</div>
  </section>`;
}

/**
 * 基于画像与方案生成 HTML（mock，短版、可决策）
 * @param {object} snapshot profile snapshot 对象
 * @param {object} plan 结构化方案
 */
export function buildMockHtmlReport(snapshot, plan, options = {}) {
  const locale = normalizeLocale(options.locale);
  const isEn = locale === "en";
  const summary = flattenSnapshotSummary(snapshot);
  const tiers = plan.tiers || {};
  const reach = tiers.reach || {};
  const match = tiers.match || {};
  const safety = tiers.safety || {};

  const merged = planCitations(plan);

  const parsed = isEn
    ? {
        parent_summary: [
          `Conclusion: with current profile and plan as the main axis, push forward with the "${reach.label || "Reach"} / ${match.label || "Match"} / ${safety.label || "Safety"}" mix.`,
          `Budget: fees and timeline in the plan are indicative ranges; refer to family cash flow and the school's official annual figures.`,
          `Risk: watch language milestones, credentialing lead times, and round deadlines to avoid last-minute blockers.`,
        ],
        action_plan: {
          days_30: [
            "[Verify + Checklist] Self-check transcripts / enrollment proof vs profile (high priority; risk: material mismatch triggers rejection)",
            "[Timeline] List 3-5 target programs + official deadlines / test requirements (cite intel dates)",
            "[Budget alignment] Confirm cap and self-funded / scholarship preference with parents (quantify: tuition + living + tests with 15% buffer)",
          ],
          days_60: [
            "[Language/standardized tests] Schedule or confirm waivers + score targets (medium risk: late tests break rolling rounds)",
            "[Essays] Main PS / CV draft, iterate per-program weighted variants (e.g. JUPAS Math)",
            "[Recommenders] Confirm 2-3 + communicate timeline (low risk but needs buffer)",
          ],
          days_90: [
            "[Submit] Per-round applications + attachments / payment checklist (high risk: 48h-before-deadline crunch)",
            "[Interview] Program-specific prep + mock (incl. HK local policy Q&A)",
            "[Contingency] Worst-case drill: all-reject backup + gap year / other regions plan",
          ],
        },
        plain_language_notes: [
          "Reach / Match / Safety: respectively the lower-odds main push, mid-odds focus, and backup mix; not an official classification.",
        ],
        risk_items: [
          {
            level: "high",
            label: "Materials / language not ready before round deadline",
            detail: "High risk: late submission can void the round; back-plan a 30-day checklist.",
          },
          {
            level: "medium",
            label: "Budget and exchange-rate swings",
            detail: "Medium risk: tuition and living costs follow official sites and current exchange rates; keep a 10-15% buffer.",
          },
          {
            level: "low",
            label: "Recommender scheduling",
            detail: "Low risk: contact recommenders 4-6 weeks ahead and confirm submission path.",
          },
        ],
        visuals: buildMockReportVisuals(plan),
      }
    : {
        parent_summary: [
          `结论：以当前画像与方案为主轴，建议按「${reach.label || "冲刺"} / ${match.label || "匹配"} / ${safety.label || "保底"}」组合推进。`,
          `预算：方案中的费用与时间线为区间说明，请以家庭现金流与院校当年公示为准。`,
          `风险：请关注语言节点、材料认证周期与轮次截止，避免「卡点」导致被动。`,
        ],
        action_plan: {
          days_30: [
            "【核对+Checklist】成绩单/在读证明与画像一致性自检（高优先，风险：材料不符导致拒审）",
            "【时间线】列出 3-5 目标项目 + 官方截止/考试要求（引用 intel 日期）",
            "【预算对齐】与父母确认上限与自费/奖学金偏好（量化：学费+生活+考试预留 15% 浮动）",
          ],
          days_60: [
            "【语言/标化】安排或豁免确认 + 成绩目标（中风险：晚考卡 rolling）",
            "【文书】主 PS/简历 draft，按项目权重（JUPAS Math 等）迭代差异版",
            "【推荐人】确认 2-3 位 + 沟通 timeline（低风险但需 buffer）",
          ],
          days_90: [
            "【提交】按轮次网申 + 附件/支付 checklist（高风险：截止前 48h 卡点）",
            "【面试】项目特定问题准备 + mock（含香港本地政策问答）",
            "【 contingency】最坏情况推演：全拒备选 + gap year / 其他地区 plan",
          ],
        },
        plain_language_notes: [
          "冲刺/匹配/保底：分别指录取把握较低的主攻、把握中等的重心、用于托底的组合，不代表官方分类。",
        ],
        risk_items: [
          {
            level: "high",
            label: "轮次截止前材料/语言未齐",
            detail: "高风险：卡点提交可能导致当轮失效，请倒排 30 天清单。",
          },
          {
            level: "medium",
            label: "预算与汇率波动",
            detail: "中风险：学费与生活费请以官网与当年汇率为准，预留 10–15% buffer。",
          },
          {
            level: "low",
            label: "推荐人沟通档期",
            detail: "低风险：提前 4–6 周联系推荐人并确认提交路径。",
          },
        ],
        visuals: buildMockReportVisuals(plan),
      };

  const deliveryHtml = buildDeliverySectionsHtml(parsed, merged, { locale });

  const paragraphs = isEn
    ? [
        `Executive summary: ${summary}. This report compresses profile, strategy tiers, risk, and execution rhythm for parent-student division of work.`,
        `Profile dimensions: keep verifying GPA, school background, language, and intended field against paper materials; pending items should follow official proof, not chat inference as fact.`,
        `Application goals and strategy: with HK direction and current intent as the main line, the three tiers organize gradient and psychological expectation, not admission promises; verify prerequisites and minimums on each program page.`,
        `Tier excerpt: "${reach.label || "Reach"}" ${reach.summary || ""} ${reach.rationale || ""} "${match.label || "Match"}" ${match.summary || ""} ${match.rationale || ""} "${safety.label || "Safety"}" ${safety.summary || ""} ${safety.rationale || ""}`,
        `Risk, budget, and timeline: ${escapeHtmlText(plan.risk_summary || "(see plan)")}; budget note: ${escapeHtmlText(plan.budget_suggestion || "")}; timeline: ${escapeHtmlText(plan.timeline_suggestion || "")}.`,
        `Materials and execution: stabilize facts first, then polish narrative, then align per-program differentiators; check application fields, attachments, and recommender links before submit.`,
        `${escapeHtmlText(plan.disclaimer || DEFAULT_REPORT_DISCLAIMER)} Next steps: 1) update profile; 2) maintain deadline tracker; 3) phased tests and essays; 4) full-flow review before submission.`,
      ]
    : [
        `执行摘要：${summary}。本报告将画像、策略梯度、风险与执行节奏压缩呈现，便于家长与学生分工推进。`,
        `申请人画像维度：请持续核对绩点、院校背景、语言与意向专业是否与纸质材料一致；待确认项请以官方证明为准，勿将对话推断当作事实。`,
        `申请目标与策略：以香港方向与当前意向为主线，三档用于组织梯度与心理预期，不是录取承诺；需到各项目页面核对先修与最低线。`,
        `梯度摘录：「${reach.label || "冲刺"}」${reach.summary || ""} ${reach.rationale || ""} 「${match.label || "匹配"}」${match.summary || ""} ${match.rationale || ""} 「${safety.label || "保底"}」${safety.summary || ""} ${safety.rationale || ""}`,
        `风险、预算与时间线：${escapeHtmlText(plan.risk_summary || "（见方案）")}；预算提示：${escapeHtmlText(plan.budget_suggestion || "")}；时间线：${escapeHtmlText(plan.timeline_suggestion || "")}。`,
        `材料与执行：先稳定事实，再打磨叙事，最后逐项目对齐差异点；提交前检查网申字段、附件与推荐人链接。`,
        `${escapeHtmlText(plan.disclaimer || DEFAULT_REPORT_DISCLAIMER)} 后续可做：① 更新画像；② 维护截止表；③ 分阶段考试与文书；④ 提交前全流程复查。`,
      ];

  const chapterTitles = isEn
    ? [
        "Overview & Executive Summary",
        "Applicant Profile & Key Facts",
        "Application Goals & Strategy Frame",
        "Plan Tier Notes (Reach / Match / Safety)",
        "Risk, Budget & Timeline",
        "Materials & Execution Advice",
        "Disclaimer & Next Steps",
      ]
    : CHAPTER_DEFS.map((c) => c.title);
  const chapterIds = CHAPTER_DEFS.map((c) => c.id);

  const sections = chapterIds.map((id, i) => {
    const body = paragraphs[i] || paragraphs[paragraphs.length - 1];
    const paras = body.split("\n\n").map((p) => `<p>${escapeHtmlText(p)}</p>`);
    return `<section class="report-chapter" id="${escapeHtmlText(id)}"><h2>${escapeHtmlText(chapterTitles[i])}</h2>${paras.join("")}</section>`;
  });

  const coreHtml = sections.join("\n");
  const delivery = normalizeReportDelivery(parsed);
  const visualsJson = delivery?.visuals ? JSON.stringify(delivery.visuals) : "";
  const visualsScript = visualsJson
    ? `<script type="application/json" id="report-visuals-data">${visualsJson.replace(/</g, "\\u003c")}</script>`
    : "";
  const html = `<article class="study-report">${deliveryHtml}\n${coreHtml}\n${visualsScript}\n</article>`;

  return {
    schemaVersion: REPORT_RESULT_SCHEMA_VERSION,
    title: isEn ? "Study Application Planning Report (auto-generated)" : "留学申请规划报告（自动生成）",
    chapters: chapterIds.map((id, i) => ({
      id,
      title: chapterTitles[i],
      html: sections[i],
    })),
    html,
    wordCount: countReportTextChars(html),
    disclaimer: plan.disclaimer || DEFAULT_REPORT_DISCLAIMER,
    citations: merged,
    visuals: delivery?.visuals || null,
  };
}

function parseReportJson(content) {
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

/**
 * @param {object} snapshot
 * @param {object} plan
 * @param {{
 *   useMock: boolean,
 *   deepseekApiKey?: string,
 *   deepseekBaseUrl?: string,
 *   deepseekModel?: string,
 *   timeoutMs?: number,
 *   intelContextText?: string,
 *   intelItems?: object[],
 *   extKbEntries?: object[],
 *   locale?: string,
 * }} opts
 */
export async function generateHtmlReport(snapshot, plan, opts) {
  const locale = normalizeLocale(opts.locale);
  const baseCites = planCitations(plan);
  const intelItems = opts.intelItems || [];
  const extKbEntries = opts.extKbEntries || [];

  if (opts.useMock) {
    const report = buildMockHtmlReport(snapshot, plan, { locale });
    let cites = normalizeCitations([...(report.citations || []), ...baseCites], 12);
    cites = filterCitationsAgainstCombinedSources(cites, intelItems, extKbEntries);
    report.citations = cites;
    return { ok: true, report };
  }

  const timeoutMs = opts.timeoutMs ?? getReportGenerationTimeoutMs();
  const client = new OpenAI({
    apiKey: opts.deepseekApiKey,
    baseURL: opts.deepseekBaseUrl || "https://api.deepseek.com",
    timeout: timeoutMs,
    maxRetries: 0,
  });

  const system =
    (loadPromptText("report.txt") ||
      "你是留学规划顾问写作助手。只输出一个 JSON 对象，不要 markdown。") +
    "\n\n" +
    buildOutputLocaleBlock(locale);

  let user = `请基于以下画像快照（snapshot）与方案（plan，结构化 JSON）撰写 JSON 报告。方案内 plan.citations 若有条目，应择优纳入 citations 数组；补充引用时 itemId 与 url 须来自下方情报上下文，不要编造失效链接。\n\nsnapshot:\n${JSON.stringify(snapshot, null, 2)}\n\nplan:\n${JSON.stringify(plan, null, 2)}`;
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
        message: `报告生成超时（>${Math.round(timeoutMs / 1000)}s），请稍后重试。`,
        retryable: true,
        suggestion: "可稍后重试，或检查 REPORT_GENERATION_TIMEOUT_MS 与模型服务。",
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
  const parsed = parseReportJson(text);
  const chaptersRaw = parsed?.chapters;
  if (!parsed || !Array.isArray(chaptersRaw) || chaptersRaw.length !== 7) {
    return {
      ok: false,
      code: "GENERATION_FAILED",
      message: "模型输出无法解析为合法七章报告结构。",
      retryable: true,
      suggestion: "请重试生成报告。",
    };
  }

  const modelCites = normalizeCitations(parsed.citations);
  let mergedCitations = normalizeCitations([...baseCites, ...modelCites]);
  if (intelItems.length || extKbEntries.length) {
    mergedCitations = filterCitationsAgainstCombinedSources(mergedCitations, intelItems, extKbEntries);
  }

  const deliveryHtml = buildDeliverySectionsHtml(parsed, mergedCitations, { locale });

  const chapters = [];
  const sectionHtmls = [];
  for (let i = 0; i < 7; i++) {
    const ch = chaptersRaw[i] && typeof chaptersRaw[i] === "object" ? chaptersRaw[i] : {};
    const title = String(ch.title || CHAPTER_DEFS[i].title).trim() || CHAPTER_DEFS[i].title;
    const body = String(ch.body || "").trim();
    const paras = body
      ? body
          .split(/\n\n+/)
          .map((p) => `<p>${escapeHtmlText(p)}</p>`)
          .join("")
      : `<p>${escapeHtmlText("（本章暂无内容）")}</p>`;
    const id = CHAPTER_DEFS[i].id;
    const sec = `<section class="report-chapter" id="${escapeHtmlText(id)}"><h2>${escapeHtmlText(title)}</h2>${paras}</section>`;
    sectionHtmls.push(sec);
    chapters.push({ id, title, html: sec });
  }

  const deliveryNorm = normalizeReportDelivery(parsed);
  const visualsJson = deliveryNorm?.visuals ? JSON.stringify(deliveryNorm.visuals) : "";
  const visualsScript = visualsJson
    ? `<script type="application/json" id="report-visuals-data">${visualsJson.replace(/</g, "\\u003c")}</script>`
    : "";
  const html = `<article class="study-report">${deliveryHtml}\n${sectionHtmls.join("\n")}\n${visualsScript}\n</article>`;
  const wordCount = countReportTextChars(html);

  const disclaimer =
    String(parsed.disclaimer || "").trim() || String(plan.disclaimer || DEFAULT_REPORT_DISCLAIMER);

  return {
    ok: true,
    report: {
      schemaVersion: String(parsed.schemaVersion || REPORT_RESULT_SCHEMA_VERSION),
      title: String(parsed.title || "").trim() || (locale === "en"
        ? "Study Application Planning Report (auto-generated)"
        : "留学申请规划报告（自动生成）"),
      chapters,
      html,
      wordCount,
      disclaimer,
      citations: mergedCitations,
      visuals: deliveryNorm?.visuals || null,
    },
  };
}
