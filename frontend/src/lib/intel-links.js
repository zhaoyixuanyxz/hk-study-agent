import { escapeHtml } from "./dom.js";

const DEMO_SEED_HOST = "seed.study-agent.local";

export function isDemoSeedSourceUrl(url) {
  try {
    return new URL(String(url || "")).hostname === DEMO_SEED_HOST;
  } catch {
    return String(url || "").includes(DEMO_SEED_HOST);
  }
}

/** @param {string} url */
export function renderIntelSourceLink(url) {
  const raw = String(url || "").trim();
  if (!raw || raw === "#") {
    return '<span class="intel-card-link intel-card-link--muted">暂无官方链接</span>';
  }
  if (isDemoSeedSourceUrl(raw)) {
    return `<span class="intel-card-link intel-card-link--muted" title="演示数据旧链接，请重启后端以自动修复">来源链接待更新（请刷新页面）</span>`;
  }
  const safe = escapeHtml(raw);
  return `<a class="intel-card-link" href="${safe}" target="_blank" rel="noopener noreferrer">查看来源</a>`;
}
