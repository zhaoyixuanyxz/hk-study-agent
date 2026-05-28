/**
 * V1-P1 gate: Chat advisor prompts, progress/readiness modules, agent output shape.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, "..");
const promptsV1 = join(backendRoot, "prompts", "v1");
const repoRoot = join(backendRoot, "..");

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const advisor = join(promptsV1, "advisor.txt");
if (!existsSync(advisor)) die("verify-v1-p1: missing prompts/v1/advisor.txt");

const layerPath = join(backendRoot, "src", "promptLayer.js");
const layerSrc = readFileSync(layerPath, "utf8");
if (!layerSrc.includes("advisor.txt")) die("verify-v1-p1: promptLayer must load advisor.txt");
if (!layerSrc.includes("gap_items")) die("verify-v1-p1: promptLayer OUTPUT must mention gap_items");
if (!layerSrc.includes("citations")) die("verify-v1-p1: promptLayer OUTPUT must mention citations");

const agentPath = join(backendRoot, "src", "agent.js");
const agentSrc = readFileSync(agentPath, "utf8");
if (!agentSrc.includes("normalizeAgentOutput")) die("verify-v1-p1: agent.js must export normalizeAgentOutput");
if (!agentSrc.includes("normalizeCitations")) die("verify-v1-p1: agent.js must validate citations");

for (const rel of ["src/profile-progress.js", "src/report-readiness.js"]) {
  const p = join(backendRoot, rel);
  if (!existsSync(p)) die(`verify-v1-p1: missing ${rel}`);
}

const chatRoutes = join(backendRoot, "src", "modules", "chat-routes.js");
if (!existsSync(chatRoutes)) die("verify-v1-p1: missing modules/chat-routes.js");
const chatSrc = readFileSync(chatRoutes, "utf8");
if (!chatSrc.includes("profile_progress")) die("verify-v1-p1: chat routes must expose profile_progress");
if (!chatSrc.includes("report_readiness")) die("verify-v1-p1: chat routes must expose report_readiness");

const feMain = join(repoRoot, "frontend", "src", "main.js");
if (!existsSync(feMain)) die("verify-v1-p1: missing frontend/src/main.js");
const feSrc = readFileSync(feMain, "utf8");
const feChat = join(repoRoot, "frontend", "src", "pages", "chat.js");
if (!existsSync(feChat)) die("verify-v1-p1: missing frontend/src/pages/chat.js");
const chatFe = readFileSync(feChat, "utf8");
if (!chatFe.includes("renderChatAdvisoryPanels")) die("verify-v1-p1: chat page must render advisory panels");

console.error(
  "verify-v1-p1: OK (advisor prompt, OUTPUT_FORMAT fields, agent normalize, BE/FE wiring)"
);
