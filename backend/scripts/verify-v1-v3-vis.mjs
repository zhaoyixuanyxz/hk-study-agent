import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function die(msg) {
  console.error(`verify-v1-v3-vis: FAIL — ${msg}`);
  process.exit(1);
}

const planSchema = JSON.parse(
  readFileSync(join(root, "..", "docs", "schemas", "plan-result.schema.json"), "utf8")
);
if (!planSchema.properties.visuals) die("plan-result.schema missing visuals");

const deliverySchema = JSON.parse(
  readFileSync(join(root, "..", "docs", "schemas", "report-delivery.schema.json"), "utf8")
);
if (!deliverySchema.properties.visuals) die("report-delivery.schema missing visuals");

const reportSrc = readFileSync(join(root, "src", "report-service.js"), "utf8");
if (!reportSrc.includes("buildRiskItemsSectionHtml")) die("report-service missing buildRiskItemsSectionHtml");

const planSrc = readFileSync(join(root, "src", "planning-service.js"), "utf8");
if (!planSrc.includes("normalizePlanVisuals")) die("planning-service missing visuals normalize");

const fePlan = readFileSync(join(root, "..", "frontend", "src", "lib", "plan-charts.js"), "utf8");
if (!fePlan.includes("chart.js")) die("plan-charts missing chart.js import");

const feReport = readFileSync(join(root, "..", "frontend", "src", "lib", "report-charts.js"), "utf8");
if (!feReport.includes("risk-matrix-grid")) die("report-charts missing risk matrix");

console.error("verify-v1-v3-vis: OK");
