import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function die(msg) {
  console.error(`verify-v1-v3-kb: FAIL — ${msg}`);
  process.exit(1);
}

const kbPath = join(root, "data", "intelligence", "external-kb.json");
const kb = JSON.parse(readFileSync(kbPath, "utf8"));
if (!Array.isArray(kb.entries) || kb.entries.length < 20) {
  die(`external-kb.json needs >=20 entries, got ${kb.entries?.length ?? 0}`);
}

for (const f of [
  "src/intelligence/external-kb-loader.js",
  "src/intelligence/profile-search-hints.js",
  "src/intelligence/intelContextPack.js",
]) {
  const p = join(root, f);
  if (!readFileSync(p, "utf8").includes("buildCombinedIntelContext") && f.includes("intelContextPack")) {
    /* buildCombinedIntelContext only in intelContextPack */
  }
}

const packSrc = readFileSync(join(root, "src/intelligence/intelContextPack.js"), "utf8");
if (!packSrc.includes("buildCombinedIntelContext")) die("intelContextPack missing buildCombinedIntelContext");
if (!packSrc.includes("relevanceReasonForItem")) die("intelContextPack missing relevanceReasonForItem");

const citeSrc = readFileSync(join(root, "src/citation-utils.js"), "utf8");
if (!citeSrc.includes("filterCitationsAgainstCombinedSources")) die("citation-utils missing combined filter");
const extLoader = readFileSync(join(root, "src/intelligence/external-kb-loader.js"), "utf8");
if (!extLoader.includes("ext_kb_")) die("external-kb-loader missing ext_kb_ id prefix");

const planRoute = readFileSync(join(root, "src/modules/plan-routes.js"), "utf8");
if (!planRoute.includes("buildCombinedIntelContext")) die("plan-routes must use buildCombinedIntelContext");

const cq = readFileSync(join(root, "src/content-quality.js"), "utf8");
if (!cq.includes("citations_lt_6")) die("content-quality must enforce citations_lt_6");

console.error("verify-v1-v3-kb: OK");
