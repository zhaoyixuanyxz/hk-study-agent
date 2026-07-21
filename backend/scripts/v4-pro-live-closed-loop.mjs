/**
 * Live closed-loop probe: Chat (non-thinking) → Plan (thinking) → Report (thinking).
 * Requires DEEPSEEK_API_KEY in env or repo-root .env.
 */
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { buildApp } from "../src/app.js";
import { buildDeepseekChatBody, resolveDeepseekBaseUrl, resolveDeepseekModel } from "../src/deepseek-client.js";
import { loadCuratedSeedsIntoStore } from "../src/intelligence/seed-loader.js";
import { seedReadyPlanInputView } from "./cq-regression-helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

function loadKey() {
  const fromEnv = (process.env.DEEPSEEK_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  const envPath = resolve(repoRoot, ".env");
  if (!existsSync(envPath)) return "";
  const m = /(?:^|\n)\s*DEEPSEEK_API_KEY\s*=\s*([^\r\n#]+)/.exec(readFileSync(envPath, "utf8"));
  return m ? String(m[1] || "").trim().replace(/^["']|["']$/g, "") : "";
}

function loadModel() {
  const fromEnv = (process.env.DEEPSEEK_MODEL || "").trim();
  if (fromEnv) return fromEnv;
  const envPath = resolve(repoRoot, ".env");
  if (!existsSync(envPath)) return resolveDeepseekModel("");
  const m = /(?:^|\n)\s*DEEPSEEK_MODEL\s*=\s*([^\r\n#]+)/.exec(readFileSync(envPath, "utf8"));
  return m ? String(m[1] || "").trim().replace(/^["']|["']$/g, "") : resolveDeepseekModel("");
}

async function main() {
  const key = loadKey();
  if (!key) {
    console.error("v4-pro-live-closed-loop: no DEEPSEEK_API_KEY — abort");
    process.exit(1);
  }
  const model = loadModel();
  process.env.DEEPSEEK_API_KEY = key;
  process.env.DEEPSEEK_MODEL = model;

  const client = new OpenAI({
    apiKey: key,
    baseURL: resolveDeepseekBaseUrl(process.env.DEEPSEEK_BASE_URL),
    timeout: 180000,
    maxRetries: 0,
  });

  console.error(`probe model=${model}`);

  const off = await client.chat.completions.create(
    buildDeepseekChatBody({
      model,
      messages: [{ role: "user", content: "用不超过10个字回答：香港授课型硕士简称是什么？" }],
      thinking: false,
      max_tokens: 64,
    })
  );
  const offMsg = off.choices[0]?.message;
  const offReasoning = String(offMsg?.reasoning_content || "").trim();
  const offContent = String(offMsg?.content || "").trim();
  if (!offContent) {
    console.error("FAIL chat non-thinking: empty content", offMsg);
    process.exit(1);
  }
  if (offReasoning) {
    console.error("FAIL chat non-thinking: unexpected reasoning_content length", offReasoning.length);
    process.exit(1);
  }
  console.error("PASS chat non-thinking (no reasoning_content)");

  const on = await client.chat.completions.create(
    buildDeepseekChatBody({
      model,
      messages: [
        {
          role: "user",
          content: "比较港大与科大授课型硕士申请梯度差异，用一句话结论。",
        },
      ],
      thinking: true,
      reasoningEffort: "high",
      max_tokens: 400,
    })
  );
  const onMsg = on.choices[0]?.message;
  const onReasoning = String(onMsg?.reasoning_content || "").trim();
  const onContent = String(onMsg?.content || "").trim();
  if (!onContent) {
    console.error("FAIL thinking probe: empty content", onMsg);
    process.exit(1);
  }
  if (!onReasoning) {
    console.error("FAIL thinking probe: missing reasoning_content");
    process.exit(1);
  }
  console.error(`PASS thinking probe (reasoning_content chars=${onReasoning.length})`);

  const dir = mkdtempSync(join(tmpdir(), "v4-pro-loop-"));
  const dbPath = join(dir, "db.json");
  writeFileSync(dbPath, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  const app = buildApp({ dataFile: dbPath });
  await app.ready();

  const { createStore } = await import("../src/store.js");
  const store = createStore(dbPath);
  loadCuratedSeedsIntoStore(store, { force: true });

  const reg = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: `v4loop-${Date.now()}@test.local`, password: "secret12" },
  });
  if (reg.statusCode !== 200) {
    console.error("register failed", reg.body);
    process.exit(1);
  }
  const userId = reg.json().user_id;
  const headers = { Authorization: `Bearer ${reg.json().token}` };

  const thread = await app.inject({ method: "POST", url: "/api/v1/threads", headers });
  const threadId = thread.json().thread_id;

  const chat = await app.inject({
    method: "POST",
    url: `/api/v1/threads/${threadId}/messages`,
    headers: { ...headers, "content-type": "application/json" },
    payload: {
      content: "想申请香港授课型硕士，本科计算机，GPA 3.3，预算 35 万，2026 秋入学，目标港前三。",
    },
  });
  if (chat.statusCode !== 200 || !chat.json().assistant_message?.content) {
    console.error("FAIL app chat", chat.statusCode, chat.body?.slice?.(0, 500) || chat.body);
    process.exit(1);
  }
  console.error("PASS app chat turn");

  seedReadyPlanInputView(dbPath, userId);

  const plan = await app.inject({
    method: "POST",
    url: "/api/v1/plans/generate",
    headers: { ...headers, "content-type": "application/json" },
    payload: {},
  });
  if (plan.statusCode !== 200 || !plan.json().ok || !plan.json().plan) {
    console.error("FAIL app plan", plan.statusCode, String(plan.body).slice(0, 800));
    process.exit(1);
  }
  const planId = plan.json().plan_id;
  console.error(`PASS app plan plan_id=${planId}`);

  const report = await app.inject({
    method: "POST",
    url: "/api/v1/reports/generate",
    headers: { ...headers, "content-type": "application/json" },
    payload: { plan_id: planId },
  });
  if (report.statusCode !== 200 || !report.json().ok || !report.json().html) {
    console.error("FAIL app report", report.statusCode, String(report.body).slice(0, 800));
    process.exit(1);
  }
  console.error(`PASS app report report_id=${report.json().report_id}`);

  await app.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  console.error("v4-pro-live-closed-loop: ALL PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
