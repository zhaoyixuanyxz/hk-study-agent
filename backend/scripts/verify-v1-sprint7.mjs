/**
 * Sprint 7 gate: Docker compose, production env template, backup, nginx, runbook.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const required = [
  "deploy/Dockerfile.backend",
  "deploy/Dockerfile.frontend",
  "deploy/nginx/gateway.conf",
  "deploy/nginx/frontend.conf",
  "docker-compose.prod.yml",
  ".env.production.example",
  "backend/scripts/backup-data.mjs",
  "backend/scripts/production-smoke.mjs",
  "docs/v1.verson/V1-云试点部署Runbook.md",
];

for (const rel of required) {
  if (!existsSync(join(repoRoot, rel))) die(`verify-v1-sprint7: missing ${rel}`);
}

const compose = readFileSync(join(repoRoot, "docker-compose.prod.yml"), "utf8");
if (!compose.includes("app-data")) die("verify-v1-sprint7: compose must define app-data volume");

const envEx = readFileSync(join(repoRoot, ".env.production.example"), "utf8");
for (const key of ["CORS_ORIGINS", "DEEPSEEK_API_KEY", "APP_RATE_LIMIT_MAX", "INTELLIGENCE_REVIEWER_EMAILS"]) {
  if (!envEx.includes(key)) die(`verify-v1-sprint7: .env.production.example missing ${key}`);
}

const pkg = JSON.parse(readFileSync(join(repoRoot, "backend", "package.json"), "utf8"));
if (!pkg.scripts["test:v1-sprint7"]) die("verify-v1-sprint7: package.json needs test:v1-sprint7");

const roadmap = readFileSync(join(repoRoot, "docs", "v1.verson", "V1-迭代路线图.md"), "utf8");
if (roadmap.includes("backend/src/intelligence/` **不存在**")) {
  die("verify-v1-sprint7: roadmap §6.2 still claims Intelligence missing");
}

console.error("verify-v1-sprint7: OK (deploy assets + runbook + roadmap audit)");
