import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, "..", "src");
const legacy = readFileSync(join(src, "main.legacy.js"), "utf8").split(/\r?\n/);

function slice(start, end) {
  return legacy.slice(start - 1, end).join("\n");
}

mkdirSync(join(src, "api"), { recursive: true });
mkdirSync(join(src, "lib"), { recursive: true });
mkdirSync(join(src, "pages"), { recursive: true });
mkdirSync(join(src, "shell"), { recursive: true });

const apiHeader = `import { track } from "../track.js";

`;

writeFileSync(join(src, "api", "client.js"), apiHeader + slice(15, 177), "utf8");

writeFileSync(
  join(src, "lib", "dom.js"),
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
  join(src, "lib", "loading.js"),
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
`,
  "utf8"
);

const pageImports = `import { track } from "../track.js";
import { extractAssistantDisplayText } from "../assistant-text.js";
import {
  formatFactLabel,
  formatFlowState,
  formatPlanCitationsHint,
  formatReadinessCopy,
  formatSourceHintLabel,
  formatThreadMeta,
  formatTimelineUrgencyLine,
  formatTruthStatusLabel,
  truthStatusTagClass,
} from "../copy.js";
import {
  api,
  LS_LAST_PLAN,
  LS_LAST_REPORT,
  LS_THREAD,
  LS_TOKEN,
  clearStoredSession,
  fullUrlFromApiPath,
  downloadReportPdf,
  shareStatusLabel,
  setupReportDeliveryUi,
} from "../api/client.js";
import { el, escapeHtml, prettyTime, setStatus, shortId } from "../lib/dom.js";
import { setPanelLoading } from "../lib/loading.js";

`;

writeFileSync(join(src, "pages", "chat.js"), pageImports + slice(20, 506) + "\n\n" + slice(1114, 1178), "utf8");
writeFileSync(join(src, "pages", "intelligence.js"), pageImports + slice(631, 802), "utf8");
writeFileSync(join(src, "pages", "profile.js"), pageImports + slice(803, 1096), "utf8");
writeFileSync(join(src, "pages", "plan.js"), pageImports + slice(1338, 1509), "utf8");
writeFileSync(join(src, "pages", "report.js"), pageImports + slice(1510, 1698), "utf8");
writeFileSync(join(src, "pages", "history.js"), pageImports + slice(1699, 1956), "utf8");

const shellImports = `import { track } from "../track.js";
import { api, LS_TOKEN, clearStoredSession } from "../api/client.js";
import { el, setStatus } from "../lib/dom.js";
import { loadIntelligencePage, loadAdminIntelligencePage } from "../pages/intelligence.js";
import { loadProfile } from "../pages/profile.js";
import { loadPlanPage } from "../pages/plan.js";
import { loadReportPage } from "../pages/report.js";
import { loadHistoryPage } from "../pages/history.js";
import { loadThread, resetComposerReplaceDraftQuiet } from "../pages/chat.js";

`;

writeFileSync(join(src, "shell", "router.js"), shellImports + slice(507, 630) + "\n\n" + slice(1180, 1212), "utf8");

console.log("extract-pages: done");
