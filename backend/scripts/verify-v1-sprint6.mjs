/**
 * Sprint 6 gate: UX loading/skeleton CSS, mobile overflow guard, QA archive doc.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const css = readFileSync(join(repoRoot, "frontend", "src", "style.css"), "utf8");
for (const token of ["skeleton-line", "panel-loading-msg", "overflow-x: hidden", "empty-state"]) {
  if (!css.includes(token)) die(`verify-v1-sprint6: style.css missing ${token}`);
}

const loadingJs = readFileSync(join(repoRoot, "frontend", "src", "lib", "loading.js"), "utf8");
if (!loadingJs.includes("setPanelLoading")) die("verify-v1-sprint6: lib/loading.js must export setPanelLoading");

const qaDoc = join(repoRoot, "docs", "v1.verson", "V1-Sprint6-QA-归档-2026-05-28.md");
if (!existsSync(qaDoc)) die("verify-v1-sprint6: missing QA archive doc");

const roadmap = readFileSync(join(repoRoot, "docs", "v1.verson", "V1-迭代路线图.md"), "utf8");
if (!roadmap.includes("6 Tab")) die("verify-v1-sprint6: roadmap should mention 6 Tab product shape");

console.error("verify-v1-sprint6: OK (UX CSS; loading helper; QA doc present)");
