/**
 * V1-P4 gate: Hong Kong study-intelligence module removed; legacy JSON keys still stripped in store.
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

const intelDir = join(backendRoot, "src", "intelligence");
if (existsSync(intelDir)) {
  die("verify-v1-p4: backend/src/intelligence must not exist after module removal");
}

const appSrc = readFileSync(join(backendRoot, "src", "app.js"), "utf8");
if (appSrc.includes("registerIntelligenceRoutes")) {
  die("verify-v1-p4: app.js must not call registerIntelligenceRoutes");
}

const storeSrc = readFileSync(join(backendRoot, "src", "store.js"), "utf8");
for (const token of ["stripLegacyIntelligenceData", "intelligenceSources"]) {
  if (!storeSrc.includes(token)) die(`verify-v1-p4: store.js missing ${token}`);
}

const pkg = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8"));
const p4 = String(pkg.scripts["test:v1-p4"] || "");
if (p4.includes("v1-p7-intelligence.test.js")) {
  die("verify-v1-p4: package.json test:v1-p4 must not run intelligence tests");
}

console.error("verify-v1-p4: OK (intelligence removed; legacy strip present)");
