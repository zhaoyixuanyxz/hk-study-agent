/**
 * ② 同域发现：种子页抽链 → 白名单 →（可选）LLM 标注 → 候选池。
 * 未人工 approve 的候选不会进入爬取名单。
 */
import OpenAI from "openai";
import { createHash } from "node:crypto";
import {
  buildDeepseekChatBody,
  resolveDeepseekBaseUrl,
  resolveDeepseekModel,
} from "../deepseek-client.js";
import { INFO_TYPES, SCHOOL_CRAWL_PROFILES, buildCrawlFeeds } from "./crawl-registry.js";
import {
  buildOfficialHostAllowlist,
  isUrlOnOfficialAllowlist,
  resolveAndNormalizeHttpUrl,
} from "./host-allowlist.js";

/**
 * @returns {boolean}
 */
export function isLlmDiscoverEnabled(opts = {}) {
  if (opts.discover === true) return true;
  if (opts.discover === false) return false;
  const v = String(process.env.INTELLIGENCE_LLM_DISCOVER ?? "0").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

/**
 * @param {string} schoolId
 */
export function seedUrlsForSchool(schoolId) {
  const profile = SCHOOL_CRAWL_PROFILES[schoolId];
  if (!profile) return [];
  const urls = [];
  for (const key of ["admission", "program", "deadline", "policy"]) {
    if (profile.pages[key]) urls.push(profile.pages[key]);
  }
  return [...new Set(urls)].slice(0, 2);
}

/**
 * @param {string} html
 * @param {string} baseUrl
 * @param {Set<string>} allowlist
 * @param {Set<string>} knownUrls lowercase
 */
export function extractCandidateLinksFromHtml(html, baseUrl, allowlist, knownUrls = new Set()) {
  const out = [];
  const seen = new Set();
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(String(html || ""))) !== null) {
    const abs = resolveAndNormalizeHttpUrl(m[1], baseUrl);
    if (!abs) continue;
    const key = abs.toLowerCase();
    if (seen.has(key) || knownUrls.has(key)) continue;
    if (!isUrlOnOfficialAllowlist(abs, allowlist)) continue;
    seen.add(key);
    out.push(abs);
    if (out.length >= 40) break;
  }
  return out;
}

function feedIdForUrl(url) {
  const h = createHash("sha256").update(String(url).trim().toLowerCase()).digest("hex").slice(0, 12);
  return `discover:${h}`;
}

/**
 * @param {string[]} urls
 * @param {{ schoolId: string, sourceId: string, seedUrl: string }} ctx
 * @param {{ useLlm?: boolean, deepseekApiKey?: string }} opts
 */
export async function labelDiscoveredUrls(urls, ctx, opts = {}) {
  const key = String(opts.deepseekApiKey || process.env.DEEPSEEK_API_KEY || "").trim();
  if (!opts.useLlm || !key || !urls.length) {
    return urls.slice(0, 8).map((url) => ({
      url,
      infoType: "admission",
      reason: "rule_extract_same_host",
    }));
  }
  try {
    const client = new OpenAI({
      apiKey: key,
      baseURL: resolveDeepseekBaseUrl(opts.deepseekBaseUrl),
      timeout: 60000,
      maxRetries: 0,
    });
    const completion = await client.chat.completions.create(
      buildDeepseekChatBody({
        model: resolveDeepseekModel(opts.deepseekModel),
        thinking: false,
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          {
            role: "system",
            content:
              `你是港校官网链接分类器。只输出 JSON：{"items":[{"url":"...","infoType":"policy|deadline|tuition|admission|program|visa|scholarship","reason":"..."}]}。` +
              `规则：1) 只保留与授课型硕士申请相关的官网网页链接；2) url 必须来自输入列表；3) 禁止图片/音视频/CSS/JS 等静态资源；最多 8 条。`,
          },
          {
            role: "user",
            content: JSON.stringify({ schoolId: ctx.schoolId, seedUrl: ctx.seedUrl, urls: urls.slice(0, 30) }),
          },
        ],
      })
    );
    const raw = completion.choices?.[0]?.message?.content || "";
    let items = [];
    try {
      const o = JSON.parse(raw);
      items = Array.isArray(o?.items) ? o.items : [];
    } catch {
      const m = /\{[\s\S]*\}/.exec(raw);
      if (m) {
        try {
          items = JSON.parse(m[0])?.items || [];
        } catch {
          /* ignore */
        }
      }
    }
    const allow = new Set(urls.map((u) => u.toLowerCase()));
    const infoOk = new Set(INFO_TYPES);
    const out = [];
    for (const it of items) {
      const url = String(it?.url || "").trim();
      if (!allow.has(url.toLowerCase())) continue;
      if (!isUrlOnOfficialAllowlist(url)) continue;
      const infoType = infoOk.has(it.infoType) ? it.infoType : "admission";
      out.push({ url, infoType, reason: String(it.reason || "llm").slice(0, 200) });
      if (out.length >= 8) break;
    }
    if (out.length) return out;
  } catch {
    /* fallback below */
  }
  return urls.slice(0, 8).map((url) => ({
    url,
    infoType: "admission",
    reason: "llm_fallback_rule",
  }));
}

/**
 * @param {ReturnType<import("../store.js").createStore>} store
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   useLlm?: boolean,
 *   deepseekApiKey?: string,
 *   schoolIds?: string[],
 * }} opts
 */
export async function runCrawlDiscover(store, opts = {}) {
  const allowlist = buildOfficialHostAllowlist();
  const known = new Set(
    [
      ...buildCrawlFeeds().map((f) => String(f.url || "").toLowerCase()),
      ...store.listIntelligenceFeedUrls().map((f) => String(f.url || "").toLowerCase()),
      ...store.listCrawlCandidates({}).map((c) => String(c.canonicalUrl || "").toLowerCase()),
    ].filter(Boolean)
  );

  const schoolIds = opts.schoolIds || Object.keys(SCHOOL_CRAWL_PROFILES);
  const fetchImpl = opts.fetchImpl || fetch;
  let created = 0;
  const errors = [];

  for (const schoolId of schoolIds) {
    const profile = SCHOOL_CRAWL_PROFILES[schoolId];
    if (!profile) continue;
    for (const seedUrl of seedUrlsForSchool(schoolId)) {
      try {
        const res = await fetchImpl(seedUrl, {
          signal: AbortSignal.timeout(15000),
          headers: { "User-Agent": "StudyAgentIntel/1.0", Accept: "text/html" },
          redirect: "follow",
        });
        if (!res.ok) {
          errors.push(`${schoolId}: HTTP ${res.status}`);
          continue;
        }
        const html = await res.text();
        const finalUrl = res.url || seedUrl;
        const links = extractCandidateLinksFromHtml(html, finalUrl, allowlist, known);
        const labeled = await labelDiscoveredUrls(
          links,
          { schoolId, sourceId: profile.sourceId, seedUrl: finalUrl },
          { useLlm: opts.useLlm !== false, deepseekApiKey: opts.deepseekApiKey }
        );
        for (const row of labeled) {
          const key = row.url.toLowerCase();
          if (known.has(key)) continue;
          known.add(key);
          const r = store.upsertCrawlCandidate({
            feedId: feedIdForUrl(row.url),
            canonicalUrl: row.url,
            schoolId,
            sourceId: profile.sourceId,
            infoType: row.infoType,
            reason: row.reason,
            seedUrl: finalUrl,
            status: "pending",
          });
          if (r.created) created += 1;
        }
      } catch (e) {
        errors.push(`${schoolId}: ${e?.message || e}`);
      }
    }
  }

  return { created, errors, mode: "discover" };
}

/**
 * 已批准候选 → 可爬 feed 形状
 * @param {object[]} candidates
 */
export function approvedCandidatesToFeeds(candidates) {
  return (candidates || [])
    .filter((c) => c.status === "approved" && c.canonicalUrl)
    .map((c) => ({
      id: c.feedId || feedIdForUrl(c.canonicalUrl),
      url: c.canonicalUrl,
      sourceId: c.sourceId,
      schoolIds: c.schoolId ? [c.schoolId] : [],
      infoType: c.infoType || "admission",
    }));
}

export { feedIdForUrl };
