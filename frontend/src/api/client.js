import { resolveApiUrl } from "./base.js";

export const LS_TOKEN = "study_agent_token";
export const LS_THREAD = "study_agent_thread_id";
export const LS_LAST_PLAN = "study_agent_last_plan_id";
export const LS_LAST_REPORT = "study_agent_last_report_id";

export function clearStoredSession() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_THREAD);
  localStorage.removeItem(LS_LAST_PLAN);
  localStorage.removeItem(LS_LAST_REPORT);
}

/** @param {string} path */
export function isPublicApiPath(path) {
  return (
    path.startsWith("/api/v1/auth/login") ||
    path.startsWith("/api/v1/auth/register") ||
    path.startsWith("/api/v1/users/register")
  );
}

/** @param {unknown} data */
export function formatApiErrorMessage(data, text, status) {
  if (data && typeof data === "object" && "raw" in data) {
    if (typeof text === "string" && text.length > 0 && text.length < 800) return text;
    return `HTTP ${status}`;
  }
  if (data && typeof data === "object") {
    if (typeof data.message === "string" && data.message) return data.message;
    if (typeof data.code === "string" && data.code) return data.code;
    if ("detail" in data && data.detail !== undefined) {
      const d = data.detail;
      if (typeof d === "string") return d;
      if (Array.isArray(d)) {
        return d
          .map((x) => (x && typeof x === "object" && "msg" in x ? String(x.msg) : JSON.stringify(x)))
          .join("; ");
      }
    }
  }
  if (typeof text === "string" && text.length > 0 && text.length < 800) return text;
  return `HTTP ${status}`;
}

export async function api(path, opts = {}) {
  const headers = { ...opts.headers };
  const token = localStorage.getItem(LS_TOKEN);
  if (token && !isPublicApiPath(path)) headers.Authorization = `Bearer ${token}`;
  if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    opts = { ...opts, body: JSON.stringify(opts.body) };
  }
  const r = await fetch(resolveApiUrl(path), { ...opts, headers });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    let msg = formatApiErrorMessage(data, text, r.status);
    if (r.status === 401 && data && typeof data === "object" && data.code === "invalid_token") {
      clearStoredSession();
      msg = "登录已失效（与服务器不同步）。请重新登录。";
      if (typeof location !== "undefined" && !String(location.hash || "").includes("/login")) {
        location.hash = "#/login";
      }
    }
    const looksFastApi = Boolean(
      data && typeof data === "object" && "detail" in data && typeof data.message !== "string"
    );
    if (looksFastApi) {
      msg +=
        "（提示：该响应格式通常不是本项目的 Node（Fastify）后端。请确认本仓库 backend 已启动（默认端口 8010，与 frontend/vite.config.js 代理一致），浏览器访问 http://127.0.0.1:8010/health 应返回 {\"status\":\"ok\"}。）";
    }
    if (
      r.status === 404 &&
      typeof msg === "string" &&
      /^Route\s+\w+:\//.test(msg) &&
      msg.includes("not found")
    ) {
      msg =
        "该 API 路由在后端未注册，多为正在运行的 API 仍是旧版本。请先结束占用 8010 端口的旧进程，在本仓库 backend 目录执行 npm run dev（或 npm start）后再试。";
    }
    const err = new Error(msg);
    if (data && typeof data === "object") {
      if (data.code) err.code = data.code;
      if (data.suggestion) err.suggestion = data.suggestion;
      if (data.retryable !== undefined) err.retryable = data.retryable;
      if (data.meta) err.meta = data.meta;
    }
    err.status = r.status;
    throw err;
  }
  return data;
}

export function fullUrlFromApiPath(path) {
  if (!path || typeof path !== "string") return "";
  const resolved = resolveApiUrl(path);
  try {
    return new URL(resolved, window.location.origin).href;
  } catch {
    return resolved;
  }
}

/** @param {unknown} st */
export function shareStatusLabel(st) {
  if (st === "active") return "已分享";
  if (st === "revoked") return "已关闭分享";
  return "未分享";
}

export async function downloadReportPdf(reportId) {
  const token = localStorage.getItem(LS_TOKEN);
  const r = await fetch(resolveApiUrl(`/api/v1/reports/${encodeURIComponent(String(reportId))}/pdf`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const text = await r.text();
    let msg = `HTTP ${r.status}`;
    try {
      const j = JSON.parse(text);
      if (j && typeof j.message === "string") msg = j.message;
    } catch {
      /* */
    }
    throw new Error(msg);
  }
  const buf = await r.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const sig = bytes.length >= 4 ? String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) : "";
  if (sig !== "%PDF") {
    throw new Error("服务器返回的不是有效 PDF。若在本机开发，请确认已安装 Puppeteer 所需的 Chromium。");
  }
  const blob = new Blob([buf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = String(reportId).replace(/[^\w-]/g, "").slice(0, 12) || "report";
  a.href = url;
  a.download = `report-${safe}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export function setupReportDeliveryUi() {
  const root = document.getElementById("report-delivery");
  if (!root) return;
  const detail = root.closest(".panel")?.querySelector("#report-content");
  if (!detail) return;
  const blocks = detail.querySelectorAll(".report-delivery-block");
  if (!blocks.length) return;
  root.classList.remove("hidden");
  root.innerHTML = "";
  for (const b of blocks) {
    const clone = b.cloneNode(true);
    root.appendChild(clone);
  }
}
