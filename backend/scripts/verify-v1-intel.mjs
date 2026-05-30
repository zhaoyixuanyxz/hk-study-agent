/**
 * V3-INTEL gate: url-preflight module, safe merge, admin APIs, tests.
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

for (const rel of [
  "src/intelligence/url-preflight.js",
  "tests/v1-intel-safe-merge.test.js",
  "src/store.js",
  "src/intelligence/real-crawler.js",
  "src/intelligence/routes.js",
]) {
  const p = join(backendRoot, rel);
  if (!existsSync(p)) die(`verify-v1-intel: missing ${rel}`);
}

const routes = readFileSync(join(backendRoot, "src/intelligence/routes.js"), "utf8");
if (!routes.includes("preflight-urls")) die("verify-v1-intel: routes need admin/preflight-urls");
if (!routes.includes("preflight-last")) die("verify-v1-intel: routes need admin/preflight-last");
if (!routes.includes("skipped_preflight")) die("verify-v1-intel: collect must return skipped_preflight");

const store = readFileSync(join(backendRoot, "src", "store.js"), "utf8");
if (!store.includes("quality_degraded")) die("verify-v1-intel: store safe merge missing quality_degraded");
if (!store.includes("passesExtractionQuality")) die("verify-v1-intel: store must use passesExtractionQuality");

const crawler = readFileSync(join(backendRoot, "src/intelligence/real-crawler.js"), "utf8");
if (!crawler.includes("skippedPreflight")) die("verify-v1-intel: real-crawler needs skippedPreflight");

const html = readFileSync(join(repoRoot, "frontend/index.html"), "utf8");
if (!html.includes("admin-intel-preflight")) die("verify-v1-intel: admin preflight button missing");
if (!html.includes("admin-intel-collect")) die("verify-v1-intel: admin collect button missing");
if (!html.includes("刷新列表")) die("verify-v1-intel: user tab should say 刷新列表");

const intelPage = readFileSync(join(repoRoot, "frontend/src/pages/intelligence.js"), "utf8");
if (!intelPage.includes("runAdminPreflightUrls")) die("verify-v1-intel: intelligence.js handlers missing");

const appendix = join(repoRoot, "docs/v1.verson/V1-Intelligence技术附录.md");
if (!existsSync(appendix)) die("verify-v1-intel: missing intelligence appendix");
const appendixText = readFileSync(appendix, "utf8");
if (!appendixText.includes("preflight")) die("verify-v1-intel: appendix must document preflight workflow");

console.log("verify-v1-intel: OK");
