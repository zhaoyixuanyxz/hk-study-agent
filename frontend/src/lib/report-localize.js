/**
 * Rewrite known report delivery-shell strings so stored HTML follows UI locale.
 * Content bullets stay as generated; only fixed chrome / risk-level chips swap.
 */

const ZH_TO_EN = [
  ["家长决策摘要", "Parent Decision Summary"],
  ["以下为面向家庭决策者的结论速览（预算、风险与方向）。", "Conclusion scan for family decision-makers (budget, risk, and direction)."],
  ["风险仪表盘", "Risk Dashboard"],
  ["结构化风险条目（由报告生成，非录取承诺）。", "Structured risk items (report-generated, not admission promises)."],
  ["学生行动计划（30 / 60 / 90 天）", "Student Action Plan (30 / 60 / 90 days)"],
  ["未来 30 天", "Next 30 days"],
  ["第 31–60 天", "Days 31-60"],
  ["第 31-60 天", "Days 31-60"],
  ["第 61–90 天", "Days 61-90"],
  ["第 61-90 天", "Days 61-90"],
  ["引用与参考来源", "Citations & References"],
  ["术语短解", "Term Glossary"],
  ["本报告未引用外部知识库条目；策略依据主要来自建档对话与方案结构。若方案页展示引用，可重新生成报告以同步。", "This report cites no external KB entries; strategy relies on onboarding chat and plan structure. If citations appear on the plan page, regenerate the report to sync."],
];

const EN_TO_ZH = ZH_TO_EN.map(([zh, en]) => [en, zh]);

const RISK_ZH_TO_EN = { 高: "High", 中: "Medium", 低: "Low" };
const RISK_EN_TO_ZH = { High: "高", Medium: "中", Med: "中", Low: "低" };

/**
 * @param {string} html
 * @param {"zh"|"en"|string} locale
 */
export function localizeReportShellHtml(html, locale) {
  let out = String(html || "");
  if (!out) return out;
  const toEn = String(locale || "").toLowerCase() === "en";
  const pairs = toEn ? ZH_TO_EN : EN_TO_ZH;
  for (const [from, to] of pairs) {
    out = out.split(from).join(to);
  }
  const riskMap = toEn ? RISK_ZH_TO_EN : RISK_EN_TO_ZH;
  out = out.replace(
    /(<span class="risk-level">)(高|中|低|High|Medium|Med|Low)(<\/span>)/g,
    (_, a, label, c) => `${a}${riskMap[label] || label}${c}`
  );
  return out;
}
