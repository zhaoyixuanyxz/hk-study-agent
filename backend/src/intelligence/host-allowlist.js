/**
 * 八大官方域名白名单：发现链接不得跳出这些 origin。
 * 仅允许可爬的网页 URL（排除图片等静态资源）。
 */
import { SCHOOL_CRAWL_PROFILES } from "./crawl-registry.js";

/** 路径/查询串中视为非网页资源的扩展名 */
const NON_PAGE_EXT =
  /\.(?:png|jpe?g|gif|webp|svg|ico|bmp|avif|heic|heif|tiff?|mp4|webm|mov|mp3|wav|ogg|m4a|flac|woff2?|ttf|eot|otf|css|js|mjs|map|zip|rar|7z|gz|tar|exe|dmg|apk)(?:$|[?#])/i;

/**
 * @returns {Set<string>} lowercase origins e.g. https://www.hku.hk
 */
export function buildOfficialHostAllowlist() {
  const set = new Set();
  for (const profile of Object.values(SCHOOL_CRAWL_PROFILES)) {
    try {
      const origin = new URL(profile.baseHost).origin.toLowerCase();
      set.add(origin);
    } catch {
      /* ignore */
    }
    for (const url of Object.values(profile.pages || {})) {
      try {
        set.add(new URL(url).origin.toLowerCase());
      } catch {
        /* ignore */
      }
    }
  }
  return set;
}

/**
 * 是否为可爬「网页链接」（http/https，非图片/音视频/字体等静态资源）。
 * @param {string} url
 */
export function isCrawlableWebPageUrl(url) {
  const raw = String(url || "").trim();
  if (!raw || /^(?:data|blob|javascript):/i.test(raw)) return false;
  if (!/^https?:\/\//i.test(raw)) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const pathAndQuery = `${u.pathname || ""}${u.search || ""}`;
    if (NON_PAGE_EXT.test(pathAndQuery)) return false;
    if (/[?&](?:format|type)=(jpe?g|png|gif|webp|svg)/i.test(u.search)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * 官网白名单 + 网页链接（非图片资源）。
 * @param {string} url
 * @param {Set<string>} [allowlist]
 */
export function isUrlOnOfficialAllowlist(url, allowlist = buildOfficialHostAllowlist()) {
  if (!isCrawlableWebPageUrl(url)) return false;
  try {
    const u = new URL(String(url).trim());
    return allowlist.has(u.origin.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * @param {string} href
 * @param {string} baseUrl
 */
export function resolveAndNormalizeHttpUrl(href, baseUrl) {
  try {
    const u = new URL(String(href || "").trim(), baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    const abs = u.toString();
    if (!isCrawlableWebPageUrl(abs)) return null;
    return abs;
  } catch {
    return null;
  }
}
