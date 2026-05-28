/**
 * Sprint 5 gate: backend modules/* routers + frontend pages/* + LOC reduction.
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

function lineCount(relFromBackend) {
  return readFileSync(join(backendRoot, relFromBackend), "utf8").split(/\r?\n/).length;
}

function feLineCount(rel) {
  return readFileSync(join(repoRoot, "frontend", rel), "utf8").split(/\r?\n/).length;
}

const modules = [
  "src/modules/chat-routes.js",
  "src/modules/profile-routes.js",
  "src/modules/plan-routes.js",
  "src/modules/report-routes.js",
  "src/modules/history-routes.js",
  "src/modules/intelligence/router.js",
];
for (const m of modules) {
  if (!existsSync(join(backendRoot, m))) die(`verify-v1-sprint5: missing ${m}`);
}

const appSrc = readFileSync(join(backendRoot, "src", "app.js"), "utf8");
for (const fn of ["registerChatRoutes", "registerProfileRoutes", "registerPlanRoutes", "registerReportRoutes", "registerHistoryRoutes"]) {
  if (!appSrc.includes(fn)) die(`verify-v1-sprint5: app.js must call ${fn}`);
}

const appLines = lineCount("src/app.js");
const mainLines = feLineCount("src/main.js");
const legacyMain = feLineCount("src/main.legacy.js");
if (appLines > 410) die(`verify-v1-sprint5: app.js LOC ${appLines} must be <= 410 (60% reduction from ~1023)`);
if (mainLines > 810) die(`verify-v1-sprint5: main.js LOC ${mainLines} must be <= 810 (60% reduction from ${legacyMain})`);

for (const p of ["src/api/client.js", "src/pages/chat.js", "src/pages/profile.js", "src/pages/plan.js", "src/pages/report.js", "src/pages/history.js", "src/pages/intelligence.js"]) {
  if (!existsSync(join(repoRoot, "frontend", p))) die(`verify-v1-sprint5: missing frontend/${p}`);
}

console.error(`verify-v1-sprint5: OK (modules wired; app.js=${appLines} main.js=${mainLines} lines)`);
