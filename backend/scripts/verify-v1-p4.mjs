/**
 * V1-P4 / Sprint 1 gate: Intelligence foundation present (module, store, schema, static data).
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

const intelDir = join(backendRoot, "src", "intelligence");
if (!existsSync(intelDir)) {
  die("verify-v1-p4: backend/src/intelligence must exist");
}

for (const file of ["source-registry.js", "knowledge-store.js", "normalization-service.js"]) {
  if (!existsSync(join(intelDir, file))) {
    die(`verify-v1-p4: missing intelligence/${file}`);
  }
}

const schemaPath = join(repoRoot, "docs", "schemas", "v1-draft-intelligence-item.schema.json");
if (!existsSync(schemaPath)) die("verify-v1-p4: missing v1-draft-intelligence-item.schema.json");
try {
  JSON.parse(readFileSync(schemaPath, "utf8"));
} catch (e) {
  die(`verify-v1-p4: invalid intelligence item schema: ${e.message}`);
}

for (const rel of ["data/intelligence/sources.json", "data/intelligence/schools.json"]) {
  const p = join(backendRoot, rel);
  if (!existsSync(p)) die(`verify-v1-p4: missing ${rel}`);
  JSON.parse(readFileSync(p, "utf8"));
}

const storeSrc = readFileSync(join(backendRoot, "src", "store.js"), "utf8");
if (!storeSrc.includes("ensureIntelligenceCollections")) {
  die("verify-v1-p4: store.js must export ensureIntelligenceCollections");
}
if (!storeSrc.includes("upsertIntelligenceItem")) {
  die("verify-v1-p4: store.js must implement upsertIntelligenceItem");
}
if (storeSrc.includes("stripLegacyIntelligenceData")) {
  die("verify-v1-p4: store.js must not strip intelligence collections on migrate");
}

const pkg = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8"));
const sprint1 = String(pkg.scripts["test:v1-sprint1"] || "");
if (!sprint1.includes("v1-sprint1-intelligence-foundation")) {
  die("verify-v1-p4: package.json test:v1-sprint1 must run v1-sprint1-intelligence-foundation.test.js");
}

console.error("verify-v1-p4: OK (intelligence foundation: module, store, schema, static data)");
