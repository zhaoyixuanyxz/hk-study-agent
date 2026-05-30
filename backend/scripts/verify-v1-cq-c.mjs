/**
 * Sprint CQ-C gate: content quality scoring, regression smoke, QA docs.
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

for (const rel of [
  "src/content-quality.js",
  "scripts/content-quality-score.mjs",
  "scripts/cq-regression-helpers.mjs",
  "tests/v1-cq-content-quality.test.js",
  "../docs/v1.verson/V1-CQ-内容质量QA矩阵.md",
  "../docs/v1.verson/V1-CQ-Sprint-QA-归档-2026-05-28.md",
]) {
  const p = rel.startsWith("..") ? join(repoRoot, rel.replace(/^\.\.\//, "")) : join(backendRoot, rel);
  if (!existsSync(p)) die(`verify-v1-cq-c: missing ${rel}`);
}

const smoke = readFileSync(join(backendRoot, "scripts", "deepseek-regression-smoke.mjs"), "utf8");
if (!smoke.includes("plan_generate_mock")) die("verify-v1-cq-c: smoke must include plan_generate_mock");
if (!smoke.includes("report_action_plan_6plus")) die("verify-v1-cq-c: smoke must include report action plan case");
if (!smoke.includes("LIVE_CASES")) die("verify-v1-cq-c: smoke must define LIVE_CASES");

const pkg = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8"));
if (!pkg.scripts["test:v1-cq-regression"]) die("verify-v1-cq-c: package.json must define test:v1-cq-regression");

const planPrompt = readFileSync(join(backendRoot, "prompts", "v1", "plan.txt"), "utf8");
if (!planPrompt.includes("输出示例")) die("verify-v1-cq-c: plan.txt must include output examples (CQ-C-06)");

console.error("verify-v1-cq-c: OK (content quality + regression + QA docs)");
