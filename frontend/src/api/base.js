/**
 * GitHub Pages / 静态托管：API 与页面不同源时，构建期设置 VITE_API_BASE（无尾部斜杠）。
 * 本地 dev 留空，走 vite.config.js 代理。
 */
export function getApiBase() {
  const raw = import.meta.env?.VITE_API_BASE ?? "";
  return String(raw).trim().replace(/\/+$/, "");
}

/** @param {string} base @param {string} path */
export function joinApiBase(base, path) {
  if (!path || typeof path !== "string") return path;
  if (/^https?:\/\//i.test(path)) return path;
  const b = String(base || "").trim().replace(/\/+$/, "");
  if (!b) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/** @param {string} path */
export function resolveApiUrl(path) {
  return joinApiBase(getApiBase(), path);
}

export function isGithubPagesHost() {
  if (typeof location === "undefined") return false;
  return /\.github\.io$/i.test(location.hostname);
}

export function maybeShowGithubPagesApiHint() {
  if (!import.meta.env?.PROD || getApiBase() || !isGithubPagesHost()) return;
  if (document.getElementById("pages-api-hint")) return;
  const el = document.createElement("div");
  el.id = "pages-api-hint";
  el.className = "pages-api-hint";
  el.setAttribute("role", "alert");
  el.innerHTML =
    "<strong>静态页已加载，但未连接后端 API。</strong> 请在 GitHub 仓库 Variables 设置 <code>VITE_API_BASE</code>（指向你的 Fastify 公网地址，如 Tailscale/云主机），并在后端 <code>CORS_ORIGINS</code> 加入本 Pages 地址后重新部署。本地完整功能请用 <code>启动项.bat</code>。";
  document.body.prepend(el);
}
