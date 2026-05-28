/**
 * One-shot helper: splits main.js into api/client + pages/* + shell/router + thin main.js
 * Run: node scripts/build-modular-main.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, "..", "src");
const mainPath = join(srcDir, "main.js");
const backupPath = join(srcDir, "main.legacy.js");

if (!existsSync(backupPath)) {
  writeFileSync(backupPath, readFileSync(mainPath, "utf8"), "utf8");
}
const legacy = readFileSync(backupPath, "utf8");

mkdirSync(join(srcDir, "api"), { recursive: true });
mkdirSync(join(srcDir, "lib"), { recursive: true });
mkdirSync(join(srcDir, "shell"), { recursive: true });
mkdirSync(join(srcDir, "pages"), { recursive: true });

function sliceBetween(startMarker, endMarker) {
  const start = legacy.indexOf(startMarker);
  const end = legacy.indexOf(endMarker, start + 1);
  if (start < 0 || end < 0) throw new Error(`markers not found: ${startMarker} -> ${endMarker}`);
  return legacy.slice(start, end);
}

const apiBlock = sliceBetween("const LS_TOKEN", "function fullUrlFromApiPath");
const afterApi = legacy.slice(legacy.indexOf("function fullUrlFromApiPath"));

writeFileSync(
  join(srcDir, "api", "client.js"),
  `import { track } from "../track.js";

${apiBlock}

${afterApi.split("function onWindowLoad")[0]}
`,
  "utf8"
);

const navBlock = sliceBetween("function parseHash()", "function renderIntelItemCard");
const intelBlock = sliceBetween("function renderIntelItemCard(item)", "function statusLabel(s)");
const profileHelpers = sliceBetween("function statusLabel(s)", "function escapeHtml(s)");
const escapeAndSession = sliceBetween("function escapeHtml(s)", "function hidePlanError()");
const planBlock = sliceBetween("function hidePlanError()", "function hideReportError()");
const reportBlock = sliceBetween("function hideReportError()", "async function loadHistoryPage()");
const historyBlock = sliceBetween("async function loadHistoryPage()", "function onWindowLoad()");

writeFileSync(
  join(srcDir, "shell", "navigation.js"),
  `import { track } from "../track.js";
import { api, LS_LAST_PLAN, LS_LAST_REPORT, LS_THREAD, LS_TOKEN, clearStoredSession, fullUrlFromApiPath } from "../api/client.js";
import { el, escapeHtml, prettyTime, setStatus, shortId } from "../lib/dom.js";
import { setPanelLoading } from "../lib/loading.js";
import { loadIntelligencePage, loadAdminIntelligencePage } from "../pages/intelligence.js";
import { loadProfile } from "../pages/profile.js";
import { loadPlanPage } from "../pages/plan.js";
import { loadReportPage } from "../pages/report.js";
import { loadHistoryPage } from "../pages/history.js";
import { loadThread, resetComposerReplaceDraftQuiet } from "../pages/chat.js";

${navBlock}
`,
  "utf8"
);

writeFileSync(
  join(srcDir, "lib", "dom.js"),
  `export function el(id) {
  return document.getElementById(id);
}

export function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function prettyTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("zh-CN", { hour12: false });
}

export function shortId(value) {
  const s = String(value || "");
  return s.length > 8 ? s.slice(0, 8) + "…" : s || "—";
}

export function setStatus(text, isErr) {
  const s = el("status");
  if (!s) return;
  s.textContent = text;
  s.className = isErr ? "status err" : "status";
}
`,
  "utf8"
);

writeFileSync(
  join(srcDir, "lib", "loading.js"),
  `import { el } from "./dom.js";

export function skeletonHtml(lines = 3) {
  const rows = Array.from({ length: lines }, () => '<div class="skeleton-line"></div>').join("");
  return \`<div class="panel-loading skeleton-block" aria-busy="true">\${rows}</div>\`;
}

export function setPanelLoading(containerId, message = "加载中…") {
  const node = el(containerId);
  if (!node) return;
  node.innerHTML = skeletonHtml(4) + \`<p class="panel-loading-msg">\${message}</p>\`;
}

export function clearPanelLoading(containerId) {
  const node = el(containerId);
  if (!node) return;
  const sk = node.querySelector(".panel-loading");
  if (sk) sk.remove();
}
`,
  "utf8"
);

console.log("build-modular-main: wrote api/client.js shell/navigation.js lib/* — run manual page extraction or use legacy main");
