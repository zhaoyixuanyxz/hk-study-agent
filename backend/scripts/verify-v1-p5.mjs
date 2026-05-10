/**
 * V1-P5 gate: citation helpers present; intelligence routes absent.
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

const citeSrc = readFileSync(join(backendRoot, "src", "citation-utils.js"), "utf8");
if (!citeSrc.includes("export function assertCitationsAgainstItems")) {
  die("verify-v1-p5: citation-utils missing assertCitationsAgainstItems");
}
if (citeSrc.includes("intelligenceItemsToAllowlistMap")) {
  die("verify-v1-p5: citation-utils must not reference intelligenceItemsToAllowlistMap");
}

const appSrc = readFileSync(join(backendRoot, "src", "app.js"), "utf8");
if (appSrc.includes("registerIntelligenceRoutes")) {
  die("verify-v1-p5: app.js must not call registerIntelligenceRoutes");
}

if (existsSync(join(backendRoot, "src", "intelligence"))) {
  die("verify-v1-p5: backend/src/intelligence must not exist");
}

const pkg = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8"));
const p5 = String(pkg.scripts["test:v1-p5"] || "");
if (p5.includes("v1-p7-intelligence.test.js")) {
  die("verify-v1-p5: package.json test:v1-p5 must not run intelligence tests");
}

console.error("verify-v1-p5: OK (citations; intelligence removed)");
