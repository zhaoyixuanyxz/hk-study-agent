/**
 * ① 本轮爬取选题：LLM（非思考）或启发式回退。
 */
import OpenAI from "openai";
import {
  buildDeepseekChatBody,
  resolveDeepseekBaseUrl,
  resolveDeepseekModel,
} from "../deepseek-client.js";

/**
 * @returns {number}
 */
export function getSelectMaxFeeds() {
  const n = Number(process.env.INTELLIGENCE_SELECT_MAX);
  if (Number.isFinite(n) && n >= 1 && n <= 56) return Math.floor(n);
  return 12;
}

/**
 * @returns {boolean}
 */
export function isLlmSelectEnabled(opts = {}) {
  if (opts.llmSelect === false) return false;
  if (opts.llmSelect === true) return true;
  const v = String(process.env.INTELLIGENCE_LLM_SELECT ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

/**
 * 最久未更新优先；无历史则保持原序截断。
 * @param {object[]} feeds
 * @param {{ max?: number, items?: object[] }} opts
 */
export function selectFeedsHeuristic(feeds, opts = {}) {
  const max = opts.max ?? getSelectMaxFeeds();
  const items = Array.isArray(opts.items) ? opts.items : [];
  const lastByFeed = new Map();
  for (const it of items) {
    const fid = String(it.feedId || "").trim();
    if (!fid) continue;
    const t = Date.parse(it.updatedAt || it.publishedAt || "") || 0;
    const prev = lastByFeed.get(fid) || 0;
    if (t >= prev) lastByFeed.set(fid, t);
  }
  const scored = feeds.map((f, i) => ({
    feed: f,
    i,
    last: lastByFeed.get(String(f.id || "")) || 0,
  }));
  scored.sort((a, b) => a.last - b.last || a.i - b.i);
  return scored.slice(0, max).map((x) => x.feed);
}

/**
 * @param {string} raw
 * @param {object[]} feeds
 * @param {number} max
 */
export function parseSelectFeedIds(raw, feeds, max) {
  const byId = new Map(feeds.map((f) => [String(f.id), f]));
  let ids = [];
  const s = String(raw || "").trim();
  try {
    const o = JSON.parse(s);
    if (Array.isArray(o)) ids = o.map(String);
    else if (o && Array.isArray(o.feedIds)) ids = o.feedIds.map(String);
    else if (o && Array.isArray(o.feed_ids)) ids = o.feed_ids.map(String);
  } catch {
    const m = /\{[\s\S]*\}/.exec(s);
    if (m) {
      try {
        const o = JSON.parse(m[0]);
        if (Array.isArray(o?.feedIds)) ids = o.feedIds.map(String);
      } catch {
        /* ignore */
      }
    }
  }
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (!byId.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(byId.get(id));
    if (out.length >= max) break;
  }
  return out;
}

/**
 * @param {object[]} feeds
 * @param {{
 *   max?: number,
 *   items?: object[],
 *   useLlm?: boolean,
 *   deepseekApiKey?: string,
 *   deepseekBaseUrl?: string,
 *   deepseekModel?: string,
 * }} opts
 */
export async function selectFeedsForCrawl(feeds, opts = {}) {
  const max = opts.max ?? getSelectMaxFeeds();
  const list = Array.isArray(feeds) ? feeds.filter((f) => f?.id && f?.url) : [];
  if (!list.length) return { feeds: [], mode: "empty", reasons: [] };

  const key = String(opts.deepseekApiKey || process.env.DEEPSEEK_API_KEY || "").trim();
  const useLlm = opts.useLlm !== false && Boolean(key);

  if (!useLlm) {
    return {
      feeds: selectFeedsHeuristic(list, { max, items: opts.items }),
      mode: "heuristic",
      reasons: ["no_api_key_or_llm_disabled"],
    };
  }

  try {
    const client = new OpenAI({
      apiKey: key,
      baseURL: resolveDeepseekBaseUrl(opts.deepseekBaseUrl),
      timeout: 60000,
      maxRetries: 0,
    });
    const catalog = list.slice(0, 56).map((f) => ({
      id: f.id,
      schoolIds: f.schoolIds,
      infoType: f.infoType,
      url: f.url,
    }));
    const completion = await client.chat.completions.create(
      buildDeepseekChatBody({
        model: resolveDeepseekModel(opts.deepseekModel),
        thinking: false,
        temperature: 0.2,
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content:
              "你是港校授课型硕士情报采集调度器。只输出 JSON：{\"feedIds\":[\"...\"],\"reasons\":[\"...\"]}。" +
              `从给定目录中选出最多 ${max} 条本轮应爬取的 feedId（优先截止日期/学费/招生、久未更新的）。` +
              "禁止编造 id；只选官网网页类 feed，不要选图片或非页面资源。",
          },
          { role: "user", content: JSON.stringify({ max, catalog }) },
        ],
      })
    );
    const raw = completion.choices?.[0]?.message?.content || "";
    const selected = parseSelectFeedIds(raw, list, max);
    if (selected.length) {
      return { feeds: selected, mode: "llm", reasons: [`selected_${selected.length}`] };
    }
  } catch (e) {
    return {
      feeds: selectFeedsHeuristic(list, { max, items: opts.items }),
      mode: "heuristic_fallback",
      reasons: [String(e?.message || e).slice(0, 120)],
    };
  }

  return {
    feeds: selectFeedsHeuristic(list, { max, items: opts.items }),
    mode: "heuristic_fallback",
    reasons: ["llm_empty_or_invalid"],
  };
}
