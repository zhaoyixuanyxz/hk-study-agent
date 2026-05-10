import OpenAI from "openai";
import { composeSystemPrompt } from "./promptLayer.js";

function parseJson(content) {
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
  return {};
}

function normalizeExtraction(data) {
  const pickArr = (x) => (Array.isArray(x) ? x : []);
  const normFacts = (arr) =>
    pickArr(arr)
      .map((it) => ({
        key: String(it.key || it.name || "").trim(),
        value: String(it.value || it.text || "").trim(),
      }))
      .filter((it) => it.key && it.value)
      .slice(0, 40);

  return {
    confirmed: normFacts(data.confirmed),
    candidate: normFacts(data.candidate),
    preference: normFacts(data.preference),
    insights: normFacts(data.insights),
    summary_delta: String(data.summary_delta || data.summary || "").trim(),
  };
}

const EXTRACTION_SYSTEM = `你是留学建档信息抽取器。根据用户与助手最近一轮对话，抽取结构化信息。
输出必须是一个 JSON 对象，不要 markdown。
字段：
- confirmed：用户明确陈述的事实，数组，每项 { key, value }，key 使用英文蛇形小写，如 target_region, field, gpa
- candidate：模型推断但待确认，格式同上
- preference：用户偏好/倾向（非硬事实），格式同上
- insights：简短洞察句，格式同上，key 可用 insight_1
- summary_delta：一句话补充到用户画像摘要（中文）

键名建议：target_region, field, intent_degree, school_background, gpa, language, budget_range, intake_or_season, risk_style, career_goal`;

/**
 * @param {object} opts
 * @param {string} opts.userMessage
 * @param {string} opts.assistantReply
 * @param {boolean} opts.useMock
 * @param {string} [opts.memoryContext]
 */
export async function runProfileExtraction({
  userMessage,
  assistantReply,
  useMock,
  deepseekApiKey,
  deepseekBaseUrl,
  deepseekModel,
  memoryContext,
}) {
  if (useMock) {
    return normalizeExtraction(mockExtraction(userMessage, assistantReply));
  }

  const client = new OpenAI({
    apiKey: deepseekApiKey,
    baseURL: deepseekBaseUrl,
  });
  const base = composeSystemPrompt("v1");
  const mem = memoryContext ? `\n\n[KNOWN_MEMORY]\n${memoryContext.slice(0, 6000)}` : "";
  const userBlock = `用户说：\n${userMessage}\n\n助手回复：\n${assistantReply}${mem}\n\n请抽取 JSON。`;

  const completion = await client.chat.completions.create({
    model: deepseekModel,
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM },
      { role: "system", content: base.slice(0, 1500) },
      { role: "user", content: userBlock },
    ],
    temperature: 0.2,
    max_tokens: 1200,
  });
  const raw = completion.choices[0]?.message?.content || "";
  return normalizeExtraction(parseJson(raw));
}

function mockExtraction(userMessage, assistantReply) {
  const u = `${userMessage}\n${assistantReply}`;
  const confirmed = [];
  const candidate = [];
  const preference = [];
  const insights = [];

  if (/香港|hk|hong\s*kong/i.test(u)) {
    confirmed.push({ key: "target_region", value: "香港" });
  }
  if (/计算机|cs|计科|软件/i.test(u)) {
    confirmed.push({ key: "field", value: "计算机相关" });
  }
  if (/硕士|master/i.test(u)) {
    confirmed.push({ key: "intent_degree", value: "硕士" });
  }
  if (/gpa|均分|绩点/i.test(u)) {
    const m = u.match(/(\d\.\d{1,2}|[0-9]{1,2}\s*分)/);
    if (m) candidate.push({ key: "gpa", value: m[0] });
  }
  if (/雅思|ielts|托福|toefl|语言/i.test(u)) {
    candidate.push({ key: "language", value: "已提及语言考试/成绩（待补充分数）" });
  }
  if (/预算|费用|万|rmb|港币/i.test(u)) {
    const m = u.match(/(\d+\s*万|\d+\s*W|港币|人民币)/i);
    candidate.push({ key: "budget_range", value: m ? m[0] : "已提及预算（待确认区间）" });
  }
  if (/春季|秋季|fall|spring|入学|申请季|202[5-9]/i.test(u)) {
    candidate.push({ key: "intake_or_season", value: "已提及入学/申请时间（待确认）" });
  }
  if (/冲|稳|保|风险|稳妥/i.test(u)) {
    preference.push({ key: "risk_style", value: "已表达选校风险偏好（待细化）" });
  }

  if (confirmed.length + candidate.length < 2) {
    insights.push({ key: "insight_1", value: "用户处于早期信息收集阶段，需继续补齐标化与时间线。" });
  }

  return {
    confirmed,
    candidate,
    preference,
    insights,
    summary_delta: confirmed.length ? `已记录：${confirmed.map((x) => `${x.key}`).join("、")} 等要点。` : "持续更新用户留学意向与背景。",
  };
}
