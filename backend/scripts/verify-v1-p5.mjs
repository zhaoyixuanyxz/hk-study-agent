/**
 * V1-P5 gate: citation helpers + intelligence module + review routes registered.
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
if (!citeSrc.includes("export function intelligenceItemsToAllowlistMap")) {
  die("verify-v1-p5: citation-utils missing intelligenceItemsToAllowlistMap");
}

const intelDir = join(backendRoot, "src", "intelligence");
if (!existsSync(intelDir)) die("verify-v1-p5: backend/src/intelligence must exist");
if (!existsSync(join(intelDir, "intelContextPack.js"))) {
  die("verify-v1-p5: missing intelligence/intelContextPack.js");
}
if (!existsSync(join(intelDir, "routes.js"))) die("verify-v1-p5: missing intelligence/routes.js");
if (!existsSync(join(intelDir, "ingestion-service.js"))) die("verify-v1-p5: missing intelligence/ingestion-service.js");

const appSrc = readFileSync(join(backendRoot, "src", "app.js"), "utf8");
if (!appSrc.includes("registerIntelligenceRoutes")) {
  die("verify-v1-p5: app.js must call registerIntelligenceRoutes");
}
if (!appSrc.includes("registerChatRoutes")) die("verify-v1-p5: app.js must register modular chat routes");
const routesSrc = readFileSync(join(intelDir, "routes.js"), "utf8");
for (const path of [
  "/api/v1/intelligence/review/status",
  "/api/v1/intelligence/search",
  "/api/v1/intelligence/schools",
]) {
  if (!routesSrc.includes(path)) die(`verify-v1-p5: intelligence/routes.js must register ${path}`);
}

console.error("verify-v1-p5: OK (citations allowlist; intelligence review routes; intelContextPack)");
