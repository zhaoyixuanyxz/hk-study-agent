/**
 * Sprint CQ-A gate: fit_note normalize, plan/report prompt files, delivery schema, tests.
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
  "prompts/v1/plan.txt",
  "prompts/v1/report.txt",
  "../docs/schemas/plan-result.schema.json",
  "../docs/schemas/report-delivery.schema.json",
  "tests/v1-cq-plan-report.test.js",
]) {
  const p = rel.startsWith("..") ? join(repoRoot, rel.replace(/^\.\.\//, "")) : join(backendRoot, rel);
  if (!existsSync(p)) die(`verify-v1-cq-a: missing ${rel}`);
}

const planPrompt = readFileSync(join(backendRoot, "prompts", "v1", "plan.txt"), "utf8");
if (!planPrompt.includes("fit_note")) die("verify-v1-cq-a: plan.txt must mention fit_note");
if (!planPrompt.includes("JUPAS")) die("verify-v1-cq-a: plan.txt must include HK rules");

const reportPrompt = readFileSync(join(backendRoot, "prompts", "v1", "report.txt"), "utf8");
if (!reportPrompt.includes("action_plan")) die("verify-v1-cq-a: report.txt must mention action_plan");

const planningSrc = readFileSync(join(backendRoot, "src", "planning-service.js"), "utf8");
if (!planningSrc.includes("loadPromptText")) die("verify-v1-cq-a: planning-service must load plan.txt");
if (!planningSrc.includes("fit_note")) die("verify-v1-cq-a: planning-service must handle fit_note");

const reportSrc = readFileSync(join(backendRoot, "src", "report-service.js"), "utf8");
if (!reportSrc.includes("loadPromptText")) die("verify-v1-cq-a: report-service must load report.txt");
if (!reportSrc.includes("normalizeReportDelivery")) die("verify-v1-cq-a: report-service must export normalizeReportDelivery");

const planSchema = JSON.parse(
  readFileSync(join(repoRoot, "docs", "schemas", "plan-result.schema.json"), "utf8")
);
if (!planSchema?.$defs?.tier?.properties?.fit_note) {
  die("verify-v1-cq-a: plan-result.schema.json must define fit_note");
}

const deliverySchema = JSON.parse(
  readFileSync(join(repoRoot, "docs", "schemas", "report-delivery.schema.json"), "utf8")
);
if (!deliverySchema?.properties?.action_plan?.properties?.days_30) {
  die("verify-v1-cq-a: report-delivery.schema.json must define action_plan.days_30");
}

const pkg = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8"));
if (!pkg.scripts["test:v1-cq-a"]) die("verify-v1-cq-a: package.json must define test:v1-cq-a");

console.error("verify-v1-cq-a: OK (fit_note, prompt files, delivery schema, CQ-A tests)");
