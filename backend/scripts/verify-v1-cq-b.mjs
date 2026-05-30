/**
 * Sprint CQ-B gate: Plan/Report frontend visualization modules.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const feRoot = join(repoRoot, "frontend");

function die(msg) {
  console.error(msg);
  process.exit(1);
}

for (const rel of [
  "src/lib/plan-ui.js",
  "src/lib/action-plan-ui.js",
  "src/lib/plan-ui.test.js",
  "src/lib/action-plan-ui.test.js",
]) {
  if (!existsSync(join(feRoot, rel))) die(`verify-v1-cq-b: missing frontend/${rel}`);
}

const planJs = readFileSync(join(feRoot, "src", "pages", "plan.js"), "utf8");
if (!planJs.includes("renderTierFitNoteHtml")) die("verify-v1-cq-b: plan.js must render fit_note");
if (!planJs.includes("renderTimelineUrgencyBarHtml")) die("verify-v1-cq-b: plan.js must render urgency bar");
if (!planJs.includes("renderPlanExecutionPathHtml")) die("verify-v1-cq-b: plan.js must render exec path");

const reportJs = readFileSync(join(feRoot, "src", "pages", "report.js"), "utf8");
if (!reportJs.includes("enhanceReportPage")) die("verify-v1-cq-b: report.js must enhance report page");

const css = readFileSync(join(feRoot, "src", "style.css"), "utf8");
if (!css.includes("report-risk-dashboard")) die("verify-v1-cq-b: style.css must include risk dashboard");
if (!css.includes("action-plan-checklist")) die("verify-v1-cq-b: style.css must include action plan checklist");

const reportRoutes = readFileSync(join(repoRoot, "backend", "src", "modules", "report-routes.js"), "utf8");
if (!reportRoutes.includes("citations: Array.isArray(r.citations)")) {
  die("verify-v1-cq-b: report GET must return citations array");
}

const fePkg = JSON.parse(readFileSync(join(feRoot, "package.json"), "utf8"));
if (!fePkg.scripts["test:cq-b"]) die("verify-v1-cq-b: frontend must define test:cq-b");

console.error("verify-v1-cq-b: OK (Plan/Report UI modules + styles + citations API)");
