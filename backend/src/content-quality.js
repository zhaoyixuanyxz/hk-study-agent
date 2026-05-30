/**
 * Plan / Report 内容质量评分（CQ-C）。
 * 用于 mock 回归与可选 DeepSeek live 路径守门。
 */

export const FORBIDDEN_ADMISSION_PROMISE = [
  /一定录取/,
  /保证录取/,
  /确保录取/,
  /100%录取/,
  /录取概率\s*[≥>]?\s*\d{2,}%/,
  /必中/,
  /稳录/,
];

/**
 * @param {unknown} text
 */
export function containsForbiddenPromise(text) {
  const s = String(text || "");
  const cleaned = s
    .replace(/不等于[「""]?一定录取[」""]?/g, "")
    .replace(/非[「""]?一定录取/g, "")
    .replace(/不构成[^。；\n]{0,40}录取[^。；\n]{0,16}承诺/g, "")
    .replace(/不代表[^。；\n]{0,24}录取概率承诺/g, "")
    .replace(/勿将[^。；\n]{0,32}理解为录取承诺/g, "");
  return FORBIDDEN_ADMISSION_PROMISE.some((re) => re.test(cleaned));
}

/**
 * @param {unknown} html
 */
export function countActionPlanItemsFromHtml(html) {
  const s = String(html || "");
  const block = s.match(/id="action-plan"[\s\S]*?<\/section>/i);
  if (!block) return 0;
  const lis = block[0].match(/<li[\s>]/gi);
  return lis ? lis.length : 0;
}

/**
 * @param {object | null | undefined} plan
 */
export function scorePlanContent(plan) {
  const issues = [];
  const p = plan && typeof plan === "object" ? plan : {};
  const citations = Array.isArray(p.citations) ? p.citations : [];
  const tiers = p.tiers && typeof p.tiers === "object" ? p.tiers : {};
  const fitNoteCount = ["reach", "match", "safety"].filter((k) =>
    String(tiers[k]?.fit_note || "").trim()
  ).length;
  const tierComplete = ["reach", "match", "safety"].every(
    (k) => tiers[k]?.summary && tiers[k]?.rationale
  );
  const disclaimer = String(p.disclaimer || "").trim();
  const hasSafeDisclaimer =
    disclaimer.length > 20 && /不构成|仅供参考|非承诺|不以/.test(disclaimer);
  const forbidden = containsForbiddenPromise(
    [p.risk_summary, p.budget_suggestion, p.timeline_suggestion, disclaimer].join("\n")
  );
  if (forbidden) issues.push("forbidden_admission_promise");

  if (citations.length < 6) issues.push("citations_lt_6");
  if (fitNoteCount < 1) issues.push("missing_fit_note");
  if (!tierComplete) issues.push("incomplete_tiers");

  const visuals = p.visuals && typeof p.visuals === "object" ? p.visuals : null;
  const hasPlanVisuals =
    Boolean(visuals?.tierComparison) ||
    (Array.isArray(visuals?.timelineMilestones) && visuals.timelineMilestones.length > 0);

  const pass = issues.length === 0;
  return {
    pass,
    issues,
    metrics: {
      citationCount: citations.length,
      fitNoteCount,
      tierComplete,
      hasSafeDisclaimer,
      forbiddenPromise: forbidden,
      hasPlanVisuals,
      visualsBonus: hasPlanVisuals,
    },
  };
}

/**
 * @param {{ html?: string, citation_count?: number, disclaimer?: string }} report
 */
export function scoreReportContent(report) {
  const issues = [];
  const r = report && typeof report === "object" ? report : {};
  const html = String(r.html || "");
  const actionPlanItems = countActionPlanItemsFromHtml(html);
  const citationCount = Number(r.citation_count) || 0;
  const hasActionPlan = html.includes('id="action-plan"');
  const hasSevenChapters = (html.match(/class="report-chapter"/g) || []).length >= 7;
  const hasDisclaimerBlock =
    /免责声明|不构成.*承诺|仅供参考/.test(html) ||
    String(r.disclaimer || "").includes("不构成");
  const forbidden = containsForbiddenPromise(html);

  if (forbidden) issues.push("forbidden_admission_promise");
  if (actionPlanItems < 6) issues.push("action_plan_items_lt_6");
  if (!hasActionPlan) issues.push("missing_action_plan_section");
  if (!hasSevenChapters) issues.push("chapters_incomplete");
  if (citationCount < 6) issues.push("citations_lt_6");

  const hasRiskItemsHtml = html.includes('id="report-risk-items"');
  const hasReportVisuals =
    hasRiskItemsHtml ||
    html.includes('id="report-visuals-data"') ||
    html.includes("report-risk-matrix");

  const pass = issues.length === 0;
  return {
    pass,
    issues,
    metrics: {
      actionPlanItems,
      citationCount,
      hasActionPlan,
      chapterCount: (html.match(/class="report-chapter"/g) || []).length,
      hasDisclaimerBlock,
      forbiddenPromise: forbidden,
      hasRiskItemsHtml,
      hasReportVisuals,
      visualsBonus: hasReportVisuals,
    },
  };
}

/**
 * @param {{ pass?: boolean } | null} planScore
 * @param {{ pass?: boolean } | null} reportScore
 */
export function passesCombinedQaThreshold(planScore, reportScore) {
  return Boolean(planScore?.pass && reportScore?.pass);
}

/**
 * @param {number} passed
 * @param {number} total
 * @param {number} [minRatio=0.8]
 */
export function meetsLivePassRatio(passed, total, minRatio = 0.8) {
  if (total <= 0) return true;
  return passed / total >= minRatio;
}
