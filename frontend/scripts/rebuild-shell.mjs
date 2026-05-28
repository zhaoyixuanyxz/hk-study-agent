import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const legacy = readFileSync(join(src, "main.legacy.js"), "utf8").split(/\r?\n/);

const chatHdr = `import { track } from "../track.js";
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
import { api, LS_THREAD, LS_TOKEN } from "../api/client.js";
import { el, setStatus } from "../lib/dom.js";
import * as appState from "../app-state.js";
`;

let chatBody = [...legacy.slice(199, 506), ...legacy.slice(1113, 1178)].join("\n");
chatBody = chatBody
  .replace(/\bcomposerReplacementUserMessageId\b/g, "appState.composerReplacementUserMessageId")
  .replace(/\bcomposerCorrectionBackfill\b/g, "appState.composerCorrectionBackfill")
  .replace(/\bcomposerCorrectionThreadId\b/g, "appState.composerCorrectionThreadId");
writeFileSync(join(src, "pages", "chat.js"), chatHdr + "\n" + chatBody, "utf8");

const navHdr = `import { api, LS_TOKEN, clearStoredSession } from "../api/client.js";
import { el } from "../lib/dom.js";
import { resetComposerReplaceDraftQuiet } from "../pages/chat.js";
`;
writeFileSync(join(src, "shell", "navigation.js"), navHdr + "\n" + legacy.slice(506, 561).join("\n"), "utf8");

const routerHdr = `import { track } from "../track.js";
import { LS_THREAD, LS_TOKEN } from "../api/client.js";
import { el, setStatus } from "../lib/dom.js";
import { loadIntelligencePage, loadAdminIntelligencePage } from "../pages/intelligence.js";
import { loadProfile } from "../pages/profile.js";
import { loadPlanPage } from "../pages/plan.js";
import { loadReportPage } from "../pages/report.js";
import { loadHistoryPage } from "../pages/history.js";
import { loadThread } from "../pages/chat.js";
import { showAuth, showAppShell } from "./navigation.js";
`;
writeFileSync(
  join(src, "shell", "router.js"),
  routerHdr + "\n" + legacy.slice(572, 630).join("\n") + "\n\n" + legacy.slice(1179, 1212).join("\n"),
  "utf8"
);

console.log("rebuild-shell: ok");
