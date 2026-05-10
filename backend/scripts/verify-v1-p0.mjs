/**
 * V1-P0 documentation gate: required files, JSON schemas parse, product spec criteria count.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const docsV1 = join(repoRoot, "docs", "v1.verson");
const schemasDir = join(repoRoot, "docs", "schemas");

const requiredDocs = [
  "V1-产品规格.md",
  "V1-架构与模块边界.md",
  "V1-API-草案.md",
  "V1-数据模型草案.md",
  "V1-回归测试范围.md",
  "V1-阶段验收模板.md",
];

function die(msg) {
  console.error(msg);
  process.exit(1);
}

for (const name of requiredDocs) {
  const p = join(docsV1, name);
  if (!existsSync(p)) die(`verify-v1-p0: missing required doc ${name}`);
}

const schemaFiles = readdirSync(schemasDir).filter((f) => f.startsWith("v1-draft-") && f.endsWith(".schema.json"));
if (schemaFiles.length < 1) die("verify-v1-p0: expected at least one docs/schemas/v1-draft-*.schema.json");

for (const f of schemaFiles) {
  const p = join(schemasDir, f);
  try {
    JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    die(`verify-v1-p0: invalid JSON in ${f}: ${e.message}`);
  }
}

const productPath = join(docsV1, "V1-产品规格.md");
const productMd = readFileSync(productPath, "utf8");
const sections = [...productMd.matchAll(/^### (3\.[1-6]) /gm)].map((m) => ({
  num: m[1],
  start: m.index,
}));
if (sections.length !== 6) die(`verify-v1-p0: expected 6 tab sections ### 3.1–3.6, found ${sections.length}`);

for (let i = 0; i < sections.length; i++) {
  const { num, start } = sections[i];
  const end = i + 1 < sections.length ? sections[i + 1].start : productMd.length;
  const slice = productMd.slice(start, end);
  const criteria = [...slice.matchAll(/^\s*(\d+)\.\s+.+/gm)];
  const maxNum = criteria.length ? Math.max(...criteria.map((c) => Number(c[1]))) : 0;
  if (criteria.length < 3 || maxNum < 3) {
    die(
      `verify-v1-p0: section ### ${num} must have at least 3 numbered 可测标准 lines "N. ..." (got ${criteria.length} matches, max index ${maxNum})`
    );
  }
}

if (!/独立子系统/.test(productMd)) die("verify-v1-p0: V1-产品规格.md must state Intelligence as 独立子系统");

console.error("verify-v1-p0: OK (docs present, schemas parse, §3 tab criteria ≥ 3 each, Intelligence subsystem mentioned)");
