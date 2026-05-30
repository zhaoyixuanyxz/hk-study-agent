/**
 * Sprint CQ-D gate: admission benchmarks + intelContextPack weighting + mock citations.
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

const benchPath = join(backendRoot, "data", "intelligence", "admission-benchmarks.json");
if (!existsSync(benchPath)) die("verify-v1-cq-d: missing admission-benchmarks.json");
const benchRaw = JSON.parse(readFileSync(benchPath, "utf8"));
if (!Array.isArray(benchRaw.items) || benchRaw.items.length < 20) {
  die(`verify-v1-cq-d: need >=20 benchmark items, got ${benchRaw.items?.length ?? 0}`);
}

for (const rel of [
  "src/intelligence/benchmark-loader.js",
  "src/intelligence/intelContextPack.js",
  "src/intelligence/structured-extract.js",
  "tests/v1-cq-benchmark.test.js",
  "../frontend/src/pages/intelligence.js",
  "../docs/v1.verson/V1-Intelligence技术附录.md",
]) {
  const p = rel.startsWith("..") ? join(repoRoot, rel.replace(/^\.\.\//, "")) : join(backendRoot, rel);
  if (!existsSync(p)) die(`verify-v1-cq-d: missing ${rel}`);
}

const intelPack = readFileSync(join(backendRoot, "src", "intelligence", "intelContextPack.js"), "utf8");
if (!intelPack.includes("rankIntelContextItems")) die("verify-v1-cq-d: intelContextPack must rank benchmarks");

const struct = readFileSync(join(backendRoot, "src", "intelligence", "structured-extract.js"), "utf8");
if (!struct.includes("benchmarkGpa")) die("verify-v1-cq-d: structured-extract must support benchmarkGpa");

const planSvc = readFileSync(join(backendRoot, "src", "planning-service.js"), "utf8");
if (!planSvc.includes('infoType === "benchmark"')) die("verify-v1-cq-d: mock plan must prefer benchmark citations");

const intelPage = readFileSync(join(repoRoot, "frontend", "src", "pages", "intelligence.js"), "utf8");
if (!intelPage.includes("intel-benchmark-block")) die("verify-v1-cq-d: intelligence UI must show benchmark block");

const appendix = readFileSync(join(repoRoot, "docs", "v1.verson", "V1-Intelligence技术附录.md"), "utf8");
if (!appendix.includes("admission-benchmarks")) die("verify-v1-cq-d: tech appendix must document benchmarks");

const pkg = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8"));
if (!pkg.scripts["test:v1-cq-d"]) die("verify-v1-cq-d: package.json must define test:v1-cq-d");

console.error("verify-v1-cq-d: OK (benchmark seeds + weighting + UI + docs)");
