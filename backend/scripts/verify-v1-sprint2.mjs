/**
 * Sprint 2 gate: ingestion, review API, daily script, p7 tests.
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

for (const file of ["ingestion-service.js", "routes.js", "reviewer-auth.js", "seed-loader.js"]) {
  if (!existsSync(join(backendRoot, "src", "intelligence", file))) {
    die(`verify-v1-sprint2: missing intelligence/${file}`);
  }
}

if (!existsSync(join(backendRoot, "scripts", "intelligence-daily.mjs"))) {
  die("verify-v1-sprint2: missing scripts/intelligence-daily.mjs");
}

if (!existsSync(join(backendRoot, "data", "intelligence", "feed-urls.json"))) {
  die("verify-v1-sprint2: missing data/intelligence/feed-urls.json");
}

const appSrc = readFileSync(join(backendRoot, "src", "app.js"), "utf8");
if (!appSrc.includes("registerIntelligenceRoutes")) {
  die("verify-v1-sprint2: app.js must call registerIntelligenceRoutes");
}

const storeSrc = readFileSync(join(backendRoot, "src", "store.js"), "utf8");
for (const token of ["decideIntelligenceItemReview", "listIntelligenceItemsByReviewStatus", "intelligenceFeedUrls"]) {
  if (!storeSrc.includes(token)) die(`verify-v1-sprint2: store.js missing ${token}`);
}

const pkg = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8"));
if (!pkg.scripts["intelligence:daily"]) die("verify-v1-sprint2: missing npm script intelligence:daily");
const s2 = String(pkg.scripts["test:v1-sprint2"] || "");
if (!s2.includes("v1-p7-intelligence.test.js")) {
  die("verify-v1-sprint2: test:v1-sprint2 must run v1-p7-intelligence.test.js");
}

console.error("verify-v1-sprint2: OK (ingestion, review API, daily script, p7 tests wired)");
