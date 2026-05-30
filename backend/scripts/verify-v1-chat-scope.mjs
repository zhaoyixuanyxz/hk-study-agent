/**
 * V3-CHAT gate: chat-scope module, prompts, routes, tests.
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
  "src/chat-scope.js",
  "data/chat-scope-rules.json",
  "tests/v1-chat-scope.test.js",
  "prompts/v1/system.txt",
  "prompts/v1/collection.txt",
  "prompts/v1/advisor.txt",
]) {
  if (!existsSync(join(backendRoot, rel))) die(`verify-v1-chat-scope: missing ${rel}`);
}

const system = readFileSync(join(backendRoot, "prompts/v1/system.txt"), "utf8");
if (!/授课型硕士/.test(system) || !/不包含/.test(system)) {
  die("verify-v1-chat-scope: system.txt must declare HK taught master scope");
}

const collection = readFileSync(join(backendRoot, "prompts/v1/collection.txt"), "utf8");
if (/国家\/地区偏好/.test(collection)) {
  die("verify-v1-chat-scope: collection.txt should not ask country/region first");
}

const advisor = readFileSync(join(backendRoot, "prompts/v1/advisor.txt"), "utf8");
if (/intel_pending/.test(advisor)) {
  die("verify-v1-chat-scope: advisor.txt must not reference intel_pending");
}

const agent = readFileSync(join(backendRoot, "src/agent.js"), "utf8");
if (!agent.includes("assessChatScope")) die("verify-v1-chat-scope: agent.js must use assessChatScope");

const chatRoutes = readFileSync(join(backendRoot, "src/modules/chat-routes.js"), "utf8");
if (!chatRoutes.includes("scope_redirect")) die("verify-v1-chat-scope: chat-routes must expose scope_redirect");

const qa = join(repoRoot, "docs/v1.verson/V1-CQ-内容质量QA矩阵.md");
if (!existsSync(qa)) die("verify-v1-chat-scope: missing QA matrix doc");
if (!readFileSync(qa, "utf8").includes("范围合规")) {
  die("verify-v1-chat-scope: QA matrix needs 范围合规 section");
}

const smoke = readFileSync(join(backendRoot, "scripts/deepseek-regression-smoke.mjs"), "utf8");
if (!smoke.includes("chat_scope_out")) die("verify-v1-chat-scope: smoke needs scope cases");

console.log("verify-v1-chat-scope: OK");
