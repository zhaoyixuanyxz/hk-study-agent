/**
 * V1-P3 gate: Report delivery (PDF, share, public), History fields, report template (no word padding).
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

for (const rel of ["src/pdf-service.js", "src/report-service.js"]) {
  const p = join(backendRoot, rel);
  if (!existsSync(p)) die(`verify-v1-p3: missing ${rel}`);
}

const repSrc = readFileSync(join(backendRoot, "src", "report-service.js"), "utf8");
if (repSrc.includes("while (wordCount < 1000)")) die("verify-v1-p3: report-service must not use 1000-char padding loop");
if (!repSrc.includes("parent-summary")) die("verify-v1-p3: report-service must include parent-summary section");
if (!repSrc.includes("action-plan")) die("verify-v1-p3: report-service must include action-plan section");
if (!repSrc.includes("report-citations")) die("verify-v1-p3: report-service must include report-citations section");

const appSrc = readFileSync(join(backendRoot, "src", "app.js"), "utf8");
if (!appSrc.includes("/api/v1/public/reports/")) die("verify-v1-p3: app must expose public report share route");
if (!appSrc.includes("/pdf")) die("verify-v1-p3: app must expose report PDF route");
if (!appSrc.includes("/share")) die("verify-v1-p3: app must expose share routes");
const healthIdx = appSrc.indexOf('app.get("/health"');
const pubIdx = appSrc.indexOf("/api/v1/public/reports/");
if (healthIdx === -1 || pubIdx === -1 || pubIdx < healthIdx) {
  die("verify-v1-p3: public reports route must appear after /health registration");
}

const storeSrc = readFileSync(join(backendRoot, "src", "store.js"), "utf8");
if (!storeSrc.includes("enableReportShare")) die("verify-v1-p3: store must implement enableReportShare");
if (!storeSrc.includes("getReportByShareToken")) die("verify-v1-p3: store must implement getReportByShareToken");
if (!storeSrc.includes("normalizeReportResultInPlace") || !storeSrc.includes("reportResults")) {
  die("verify-v1-p3: store must normalize reportResults on load for legacy rows");
}

const p3test = join(backendRoot, "tests", "v1-p3-report-history.test.js");
if (!existsSync(p3test) || !readFileSync(p3test, "utf8").includes("rep_legacy_only")) {
  die("verify-v1-p3: v1-p3 tests must include legacy report fixture rep_legacy_only");
}

const runE2e = join(backendRoot, "scripts", "run-v1p3-pdf-e2e.mjs");
if (!existsSync(runE2e)) die("verify-v1-p3: missing scripts/run-v1p3-pdf-e2e.mjs");

const readme = join(repoRoot, "README.md");
if (existsSync(readme)) {
  const rd = readFileSync(readme, "utf8");
  if (!/PDF_DISABLED|PUPPETEER_EXECUTABLE_PATH/i.test(rd)) {
    die("verify-v1-p3: README.md must mention PDF_DISABLED or PUPPETEER_EXECUTABLE_PATH for PDF/Chromium");
  }
  if (!/test:v1-p3-pdf-e2e|RUN_PDF_E2E/i.test(rd)) {
    die("verify-v1-p3: README.md must mention optional PDF E2E (test:v1-p3-pdf-e2e or RUN_PDF_E2E)");
  }
}

console.error("verify-v1-p3: OK (report template, share/public/pdf, store, README PDF env)");
