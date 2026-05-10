/**
 * Cross-platform: enable RUN_PDF_E2E and run v1-p3 report tests (includes optional PDF binary case).
 * Requires: PDF_DISABLED unset; Puppeteer/Chromium usable.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
process.env.RUN_PDF_E2E = "1";
if (process.env.PDF_DISABLED === "1") {
  console.error("run-v1p3-pdf-e2e: unset PDF_DISABLED first.");
  process.exit(1);
}
const r = spawnSync("node", ["--test", join(root, "tests", "v1-p3-report-history.test.js")], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});
process.exit(r.status ?? 1);
