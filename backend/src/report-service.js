import OpenAI from "openai";
import {
  filterCitationsAgainstIntelligenceItems,
  normalizeCitations,
} from "./citation-utils.js";

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
 */
function listHtml(items, ordered) {
  if (!items.length) return `<p>${escapeHtmlText("（暂无条目）")}</p>`;
  const tag = ordered ? "ol" : "ul";
  const lis = items.map((t) => `<li>${escapeHtmlText(t)}</li>`).join("");
  return `<${tag} class="report-list">${lis}</${tag}>`;
}

/**
 * @param {object} parsed from model or mock
 * @param {object} mergedCitations normalized citations (plan + model)
 */
export function buildDeliverySectionsHtml(parsed, mergedCitations) {
  const parentLines = asStringList(parsed.parent_summary, 8);
  const ap = parsed.action_plan && typeof parsed.action_plan === "object" ? parsed.action_plan : {};
  const d30 = asStringList(asStringList(ap.days_30 || ap["30"], 12), 12);
  const d60 = asStringList(asStringList(ap.days_60 || ap["60"], 12), 12);
  const d90 = asStringList(asStringList(ap.days_90 || ap["90"], 12), 12);
  const gloss = asStringList(parsed.plain_language_notes, 6);

  const parentBlock = `<section class="report-chapter" id="parent-summary"><h2>家长决策摘要</h2><p class="report-lede">以下为面向家庭决策者的结论速览（预算、风险与方向）。</p>${listHtml(
    parentLines,
    false
  )}</section>`;

  const actionBlock = `<section class="report-chapter" id="action-plan"><h2>学生行动计划（30 / 60 / 90 天）</h2>
    <h3 class="report-subh">未来 30 天</h3>${listHtml(d30, true)}
    <h3 class="report-subh">第 31–60 天</h3>${listHtml(d60, true)}
    <h3 class="report-subh">第 61–90 天</h3>${listHtml(d90, true)}
  </section>`;

  let citeInner = "";
  if (mergedCitations.length === 0) {
    citeInner = `<p>${escapeHtmlText(
      "本报告未引用外部知识库条目；策略依据主要来自建档对话与方案结构。若方案页展示引用，可重新生成报告以同步。"
    )}</p>`;
  } else {
    citeInner = `<ul class="report-cite-list">${mergedCitations
      .map((c) => {
        const title = escapeHtmlText(c.sourceTitle || c.itemId || "来源");
        const url = escapeHtmlText(c.url);
        return `<li><a href="${url}" rel="noopener noreferrer" target="_blank">${title}</a>${c.quoteOrSummary ? ` — ${escapeHtmlText(String(c.quoteOrSummary).slice(0, 200))}` : ""}</li>`;
      })
      .join("")}</ul>`;
  }
  const citeBlock = `<section class="report-chapter" id="report-citations"><h2>引用与参考来源</h2>${citeInner}</section>`;

  const glossBlock =
    gloss.length > 0
      ? `<section class="report-chapter" id="plain-language"><h2>术语短解</h2>${listHtml(gloss, false)}</section>`
      : "";

  return `\n${parentBlock}\n${actionBlock}\n${citeBlock}\n${glossBlock}\n`;
}

/**
 * 基于画像与方案生成 HTML（mock，短版、可决策）
 * @param {object} snapshot profile snapshot 对象
 * @param {object} plan 结构化方案
 */
export function buildMockHtmlReport(snapshot, plan) {
  const summary = flattenSnapshotSummary(snapshot);
  const tiers = plan.tiers || {};
  const reach = tiers.reach || {};
  const match = tiers.match || {};
  const safety = tiers.safety || {};

  const merged = planCitations(plan);

  const parsed = {
    parent_summary: [
      `结论：以当前画像与方案为主轴，建议按「${reach.label || "冲刺"} / ${match.label || "匹配"} / ${safety.label || "保底"}」组合推进。`,
      `预算：方案中的费用与时间线为区间说明，请以家庭现金流与院校当年公示为准。`,
      `风险：请关注语言节点、材料认证周期与轮次截止，避免「卡点」导致被动。`,
    ],
    action_plan: {
      days_30: ["核对成绩单与在读证明是否与系统画像一致。", "列出目标项目清单并标注截止日期与考试要求。", "与父母对齐预算上限与地区偏好。"],
      days_60: ["完成语言/标化安排或确认免语言条件。", "起草简历与个人陈述主线，按项目差异列表迭代。", "落实推荐人并预留沟通时间。"],
      days_90: ["按轮次提交网申并核对附件与支付状态。", "准备面试常见问题与项目特定问题。", "对梯度组合做一次「最坏情况」推演（时间表与备选）。"],
    },
    plain_language_notes: [
      "冲刺/匹配/保底：分别指录取把握较低的主攻、把握中等的重心、用于托底的组合，不代表官方分类。",
    ],
  };

  const deliveryHtml = buildDeliverySectionsHtml(parsed, merged);

  const paragraphs = [];
  paragraphs.push(`执行摘要：${summary}。本报告将画像、策略梯度、风险与执行节奏压缩呈现，便于家长与学生分工推进。`);
  paragraphs.push(
    `申请人画像维度：请持续核对绩点、院校背景、语言与意向专业是否与纸质材料一致；待确认项请以官方证明为准，勿将对话推断当作事实。`
  );
  paragraphs.push(
    `申请目标与策略：以香港方向与当前意向为主线，三档用于组织梯度与心理预期，不是录取承诺；需到各项目页面核对先修与最低线。`
  );
  paragraphs.push(
    `梯度摘录：「${reach.label || "冲刺"}」${reach.summary || ""} ${reach.rationale || ""} 「${match.label || "匹配"}」${match.summary || ""} ${match.rationale || ""} 「${safety.label || "保底"}」${safety.summary || ""} ${safety.rationale || ""}`
  );
  paragraphs.push(
    `风险、预算与时间线：${escapeHtmlText(plan.risk_summary || "（见方案）")}；预算提示：${escapeHtmlText(plan.budget_suggestion || "")}；时间线：${escapeHtmlText(plan.timeline_suggestion || "")}。`
  );
  paragraphs.push(`材料与执行：先稳定事实，再打磨叙事，最后逐项目对齐差异点；提交前检查网申字段、附件与推荐人链接。`);
  paragraphs.push(
    `${escapeHtmlText(plan.disclaimer || DEFAULT_REPORT_DISCLAIMER)} 后续可做：① 更新画像；② 维护截止表；③ 分阶段考试与文书；④ 提交前全流程复查。`
  );

  const sections = CHAPTER_DEFS.map((ch, i) => {
    const body = paragraphs[i] || paragraphs[paragraphs.length - 1];
    const paras = body.split("\n\n").map((p) => `<p>${escapeHtmlText(p)}</p>`);
    return `<section class="report-chapter" id="${escapeHtmlText(ch.id)}"><h2>${escapeHtmlText(ch.title)}</h2>${paras.join("")}</section>`;
  });

  const coreHtml = sections.join("\n");
  const html = `<article class="study-report">${deliveryHtml}\n${coreHtml}\n</article>`;

  return {
    schemaVersion: REPORT_RESULT_SCHEMA_VERSION,
    title: "留学申请规划报告（自动生成）",
    chapters: CHAPTER_DEFS.map((c, i) => ({
      id: c.id,
      title: c.title,
      html: sections[i],
    })),
    html,
    wordCount: countReportTextChars(html),
    disclaimer: plan.disclaimer || DEFAULT_REPORT_DISCLAIMER,
    citations: merged,
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
 * }} opts
 */
export async function generateHtmlReport(snapshot, plan, opts) {
  const baseCites = planCitations(plan);

  if (opts.useMock) {
    const report = buildMockHtmlReport(snapshot, plan);
    let cites = normalizeCitations([...(report.citations || []), ...baseCites]);
    if (opts.intelItems?.length) {
      cites = filterCitationsAgainstIntelligenceItems(cites, opts.intelItems);
      if (!cites.length) {
        const fromIntel = filterCitationsAgainstIntelligenceItems(
          (opts.intelItems[0]
            ? [
                {
                  itemId: opts.intelItems[0].id,
                  url: opts.intelItems[0].canonicalUrl,
                  sourceTitle: opts.intelItems[0].locale?.titleZh,
                  publishedAt: opts.intelItems[0].publishedAt,
                },
              ]
            : []),
          opts.intelItems
        );
        cites = fromIntel;
      }
    }
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

  const system = `你是留学规划顾问写作助手。只输出一个 JSON 对象，不要 markdown。
JSON 必须包含：
schemaVersion（字符串，建议 "2.0"）,
title（报告标题）,
parent_summary：3–6 条短句，面向家长：结论方向、预算区间感知、主要风险与须拍板的点,
action_plan 对象，含 days_30、days_60、days_90（各为 2–5 条可执行短句）,
plain_language_notes：0–4 条，对专业术语用「术语 → 白话」或括号释义,
chapters：长度恰好为 7 的数组，每项含 title 与 body（正文纯文本，可换行）,
citations：0–8 条，对象含 url（http/https）、可选 sourceTitle、publishedAt、quoteOrSummary；须优先覆盖方案中关键事实所依据的来源，可无外链则留空数组,
disclaimer：免责声明段落。

写作要求：宁短勿冗；不要用套话堆字数；禁止承诺录取或精确概率；专业词首次出现尽量带短解释；最后一章 body 须含免责。

七章标题建议顺序（可微调）：
1 概述与执行摘要
2 申请人画像与关键事实
3 申请目标与策略框架
4 方案梯度说明（冲刺/匹配/保底）
5 风险、预算与时间线
6 材料准备与执行建议
7 免责声明与后续行动`;

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
  if (opts.intelItems?.length) {
    mergedCitations = filterCitationsAgainstIntelligenceItems(mergedCitations, opts.intelItems);
  }

  const deliveryHtml = buildDeliverySectionsHtml(parsed, mergedCitations);

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

  const html = `<article class="study-report">${deliveryHtml}\n${sectionHtmls.join("\n")}\n</article>`;
  const wordCount = countReportTextChars(html);

  const disclaimer =
    String(parsed.disclaimer || "").trim() || String(plan.disclaimer || DEFAULT_REPORT_DISCLAIMER);

  return {
    ok: true,
    report: {
      schemaVersion: String(parsed.schemaVersion || REPORT_RESULT_SCHEMA_VERSION),
      title: String(parsed.title || "留学申请规划报告（自动生成）"),
      chapters,
      html,
      wordCount,
      disclaimer,
      citations: mergedCitations,
    },
  };
}
