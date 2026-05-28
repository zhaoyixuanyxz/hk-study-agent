/**
 * Sprint 3 gate: search + schools API + product routes wired.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, "..");
const repoRoot = join(backendRoot, "..");

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const intelDir = join(backendRoot, "src", "intelligence");
for (const file of ["searchItems.js", "schoolDashboard.js", "routes.js"]) {
  if (!existsSync(join(intelDir, file))) die(`verify-v1-sprint3: missing intelligence/${file}`);
}

const routesSrc = readFileSync(join(intelDir, "routes.js"), "utf8");
for (const path of ["/api/v1/intelligence/search", "/api/v1/intelligence/schools"]) {
  if (!routesSrc.includes(path)) die(`verify-v1-sprint3: routes.js missing ${path}`);
}

const indexHtml = readFileSync(join(repoRoot, "frontend", "index.html"), "utf8");
if (!indexHtml.includes('data-panel="intelligence"') || !indexHtml.includes("panel-intelligence")) {
  die("verify-v1-sprint3: frontend index.html missing intelligence panel");
}
if (!indexHtml.includes("panel-admin-intelligence")) {
  die("verify-v1-sprint3: frontend index.html missing admin intelligence panel");
}
const stepIntel = (indexHtml.match(/data-panel="intelligence"/g) || []).length;
if (stepIntel < 1) die("verify-v1-sprint3: intelligence nav step missing");

const mainSrc = readFileSync(join(repoRoot, "frontend", "src", "main.js"), "utf8");
if (mainSrc.includes('panel: "chat", reportId: null, schoolSlug: null }') && /intelligence.*panel:\s*"chat"/s.test(mainSrc)) {
  die("verify-v1-sprint3: main.js must not redirect #/intelligence to chat");
}
if (!mainSrc.includes("loadIntelligencePage")) {
  die("verify-v1-sprint3: main.js missing loadIntelligencePage");
}

const pkg = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8"));
if (!String(pkg.scripts["test:v1-sprint3"] || "").includes("v1-sprint3-intelligence-product")) {
  die("verify-v1-sprint3: package.json test:v1-sprint3 must run sprint3 tests");
}

console.error("verify-v1-sprint3: OK (search, schools, frontend intelligence tabs)");
