/**
 * V1-P6 gate: full-chain security tests + P6 documentation set + test:v1-p6 wired.
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

if (!existsSync(join(backendRoot, "tests", "v1-p6-fullchain-security.test.js"))) {
  die("verify-v1-p6: missing tests/v1-p6-fullchain-security.test.js");
}

const pkg = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8"));
const tv6 = String(pkg.scripts["test:v1-p6"] || "");
if (!tv6.includes("v1-p6-fullchain-security")) die("verify-v1-p6: package.json test:v1-p6 must run v1-p6-fullchain-security tests");
if (!tv6.includes("verify-v1-p6.mjs")) die("verify-v1-p6: package.json test:v1-p6 must run verify-v1-p6.mjs");

const docsDir = join(repoRoot, "docs", "v1.verson");
for (const name of [
  "V1-埋点事件字典.md",
  "V1-错误监控说明.md",
  "V1-上线检查清单.md",
  "V1-P6-发布说明.md",
  "V1-主链路QA用例.md",
]) {
  const p = join(docsDir, name);
  if (!existsSync(p)) die(`verify-v1-p6: missing ${p}`);
}

const readmePath = join(repoRoot, "README.md");
if (existsSync(readmePath)) {
  const readme = readFileSync(readmePath, "utf8");
  if (!/test:v1-p6/i.test(readme)) die("verify-v1-p6: README must mention test:v1-p6");
}

console.error("verify-v1-p6: OK (security tests + P6 docs + npm script)");
