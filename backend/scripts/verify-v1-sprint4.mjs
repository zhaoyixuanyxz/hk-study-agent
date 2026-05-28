/**
 * Sprint 4 gate: intelContextPack + intelligence allowlist wired into Chat/Plan/Report.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, "..");

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const intelPack = join(backendRoot, "src", "intelligence", "intelContextPack.js");
if (!existsSync(intelPack)) die("verify-v1-sprint4: missing intelContextPack.js");

const citeSrc = readFileSync(join(backendRoot, "src", "citation-utils.js"), "utf8");
for (const fn of [
  "intelligenceItemsToAllowlistMap",
  "filterCitationsAgainstIntelligenceItems",
  "assertCitationsAgainstItems",
]) {
  if (!citeSrc.includes(`export function ${fn}`)) {
    die(`verify-v1-sprint4: citation-utils missing ${fn}`);
  }
}

const chatSrc = readFileSync(join(backendRoot, "src", "modules", "chat-routes.js"), "utf8");
const planRoutesSrc = readFileSync(join(backendRoot, "src", "modules", "plan-routes.js"), "utf8");
if (!chatSrc.includes("buildIntelContextPack")) die("verify-v1-sprint4: chat routes must use buildIntelContextPack");
if (!chatSrc.includes("intelContextText")) die("verify-v1-sprint4: chat routes must pass intelContextText");
if (!planRoutesSrc.includes("intelContextText")) die("verify-v1-sprint4: plan routes must pass intelContextText");

const agentSrc = readFileSync(join(backendRoot, "src", "agent.js"), "utf8");
if (!agentSrc.includes("intelItems")) die("verify-v1-sprint4: agent.js must accept intelItems");

const planningSrc = readFileSync(join(backendRoot, "src", "planning-service.js"), "utf8");
if (!planningSrc.includes("citationRefs")) die("verify-v1-sprint4: planning-service must emit citationRefs");

const intelPage = readFileSync(join(backendRoot, "..", "frontend", "src", "pages", "intelligence.js"), "utf8");
for (const ev of ["intelligence_view", "intelligence_search"]) {
  if (!intelPage.includes(`track("${ev}"`)) die(`verify-v1-sprint4: intelligence page missing track ${ev}`);
}

console.error("verify-v1-sprint4: OK (intel context pack; citation allowlist; analytics hooks)");
