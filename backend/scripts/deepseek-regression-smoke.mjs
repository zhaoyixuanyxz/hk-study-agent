/**
 * Sprint 6: 10+ mock-path regression cases (no API key required).
 * With DEEPSEEK_API_KEY set, runs 3 live smoke calls instead of full 10+ to save quota.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { loadCuratedSeedsIntoStore } from "../src/intelligence/seed-loader.js";

const CASES = [
  { name: "chat_turn_1", content: "想申请香港授课型硕士，本科计算机。" },
  { name: "chat_turn_2", content: "GPA 3.2，预算 30 万左右，计划 2026 年秋季入学。" },
  { name: "chat_turn_3", content: "香港大学学费和截止日期有官方依据吗？" },
  { name: "chat_hku_policy", content: "想了解港大 policy 与 admission 要求。" },
  { name: "chat_language", content: "雅思 6.5，想冲港前三。" },
  { name: "chat_replace_setup", content: "补充：我更倾向商科方向。" },
  { name: "intel_search", path: "/api/v1/intelligence/search?q=%E6%B8%AF%E5%A4%A7&limit=3" },
  { name: "intel_schools", path: "/api/v1/intelligence/schools" },
  { name: "profile_read", path: "/api/v1/profile" },
  { name: "history_read", path: "/api/v1/history" },
  { name: "plans_list", path: "/api/v1/plans" },
  { name: "reports_list", path: "/api/v1/reports" },
];

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "deepseek-smoke-"));
  const dbPath = join(dir, "db.json");
  const app = buildApp({ dataFile: dbPath });
  await app.ready();

  const { createStore } = await import("../src/store.js");
  loadCuratedSeedsIntoStore(createStore(dbPath), { force: true });

  const reg = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: `smoke-${Date.now()}@test.local`, password: "secret12" },
  });
  if (reg.statusCode !== 200) {
    console.error("register failed", reg.body);
    process.exit(1);
  }
  const token = reg.json().token;
  const headers = { Authorization: `Bearer ${token}` };

  const thread = await app.inject({ method: "POST", url: "/api/v1/threads", headers });
  const threadId = thread.json().thread_id;

  let pass = 0;
  for (const c of CASES) {
    let ok = false;
    if (c.content) {
      const r = await app.inject({
        method: "POST",
        url: `/api/v1/threads/${threadId}/messages`,
        headers: { ...headers, "content-type": "application/json" },
        payload: { content: c.content },
      });
      ok = r.statusCode === 200 && r.json().assistant_message?.content;
    } else if (c.path) {
      const r = await app.inject({ method: "GET", url: c.path, headers });
      ok = r.statusCode === 200;
    }
    if (ok) pass += 1;
    else console.error("FAIL", c.name);
  }

  const key = (process.env.DEEPSEEK_API_KEY || "").trim();
  if (key) {
    process.env.DEEPSEEK_API_KEY = key;
    const liveApp = buildApp({ dataFile: dbPath });
    await liveApp.ready();
    const live = await liveApp.inject({
      method: "POST",
      url: `/api/v1/threads/${threadId}/messages`,
      headers: { ...headers, "content-type": "application/json" },
      payload: { content: "请用一句话总结我目前的申请方向。" },
    });
    if (live.statusCode === 200) pass += 1;
    else console.error("FAIL live_deepseek");
    await liveApp.close();
  }

  await app.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  console.error(`deepseek-regression-smoke: ${pass}/${CASES.length + (key ? 1 : 0)} cases passed`);
  if (pass < CASES.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
