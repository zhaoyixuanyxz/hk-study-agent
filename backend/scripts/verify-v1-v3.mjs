/**
 * V3 总体验收：INTEL + CHAT + KB + VIS 文件与路由守门。
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, "..");
const repoRoot = join(backendRoot, "..");

function die(msg) {
  console.error(`verify-v1-v3: FAIL — ${msg}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8"));
for (const script of [
  "test:v1-intel-safe-merge",
  "test:v1-chat-scope",
  "test:v1-v3-kb",
  "test:v1-v3-vis",
  "test:v1-v3",
]) {
  if (!pkg.scripts[script]) die(`package.json missing npm script ${script}`);
}

for (const rel of [
  "src/intelligence/url-preflight.js",
  "src/chat-scope.js",
  "data/chat-scope-rules.json",
  "src/intelligence/external-kb-loader.js",
  "src/intelligence/profile-search-hints.js",
  "data/intelligence/external-kb.json",
  "src/visuals-normalize.js",
  "tests/v1-intel-safe-merge.test.js",
  "tests/v1-chat-scope.test.js",
  "tests/v1-v3-kb.test.js",
  "tests/v1-v3-vis.test.js",
  "scripts/verify-v1-intel.mjs",
  "scripts/verify-v1-chat-scope.mjs",
  "scripts/verify-v1-v3-kb.mjs",
  "scripts/verify-v1-v3-vis.mjs",
]) {
  if (!existsSync(join(backendRoot, rel))) die(`missing ${rel}`);
}

const extKb = JSON.parse(
  readFileSync(join(backendRoot, "data/intelligence/external-kb.json"), "utf8")
);
if (!Array.isArray(extKb.entries) || extKb.entries.length < 20) {
  die(`external-kb.json needs >=20 entries, got ${extKb.entries?.length ?? 0}`);
}

const intelPack = readFileSync(join(backendRoot, "src/intelligence/intelContextPack.js"), "utf8");
if (!intelPack.includes("buildCombinedIntelContext")) die("intelContextPack missing buildCombinedIntelContext");

const planRoutes = readFileSync(join(backendRoot, "src/modules/plan-routes.js"), "utf8");
if (!planRoutes.includes("buildCombinedIntelContext")) die("plan-routes must use buildCombinedIntelContext");

const agentSrc = readFileSync(join(backendRoot, "src/agent.js"), "utf8");
if (!agentSrc.includes("scope_redirect")) die("agent.js missing scope_redirect");

const reportSvc = readFileSync(join(backendRoot, "src/report-service.js"), "utf8");
if (!reportSvc.includes("buildRiskItemsSectionHtml")) die("report-service missing risk_items HTML");

const cq = readFileSync(join(backendRoot, "src/content-quality.js"), "utf8");
if (!cq.includes("citations_lt_6")) die("content-quality missing V3 citations_lt_6");

const qaMatrix = readFileSync(join(repoRoot, "docs/v1.verson/V1-CQ-内容质量QA矩阵.md"), "utf8");
if (!qaMatrix.includes("引用深度")) die("QA matrix missing 引用深度 dimension");
if (!qaMatrix.includes("可视化")) die("QA matrix missing 可视化 dimension");

const archive = join(repoRoot, "docs/v1.verson/V1-V3-Sprint-QA-归档-2026-05-30.md");
if (!existsSync(archive)) die("missing V1-V3-Sprint-QA-归档-2026-05-30.md");

const mainQa = readFileSync(join(repoRoot, "docs/v1.verson/V1-主链路QA用例.md"), "utf8");
if (!mainQa.includes("V3-")) die("V1-主链路QA用例 missing V3 section");

const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
if (!readme.includes("test:v1-v3")) die("README missing test:v1-v3");

const fePkg = JSON.parse(readFileSync(join(repoRoot, "frontend/package.json"), "utf8"));
if (!fePkg.dependencies?.["chart.js"]) die("frontend missing chart.js dependency");
for (const f of ["src/lib/plan-charts.js", "src/lib/report-charts.js"]) {
  if (!existsSync(join(repoRoot, "frontend", f))) die(`missing frontend/${f}`);
}

const smoke = readFileSync(join(backendRoot, "scripts/deepseek-regression-smoke.mjs"), "utf8");
if (!smoke.includes("plan_citations_ge_6")) {
  die("deepseek-regression-smoke missing V3 citation gate case");
}

console.error("verify-v1-v3: OK (V3 INTEL/CHAT/KB/VIS artifacts + docs + npm scripts)");
