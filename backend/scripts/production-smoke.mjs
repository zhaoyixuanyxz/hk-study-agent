/**
 * Production-style smoke: health + auth + chat + intelligence search.
 * PRODUCTION_BASE_URL unset → Fastify inject (CI). Set URL for post-deploy check.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { loadCuratedSeedsIntoStore } from "../src/intelligence/seed-loader.js";

const BASE = (process.env.PRODUCTION_BASE_URL || "").replace(/\/$/, "");

async function fetchJson(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function runInject() {
  const dir = mkdtempSync(join(tmpdir(), "prod-smoke-"));
  const dbPath = join(dir, "db.json");
  const app = buildApp({ dataFile: dbPath });
  await app.ready();
  const { createStore } = await import("../src/store.js");
  loadCuratedSeedsIntoStore(createStore(dbPath), { force: true });

  const health = await app.inject({ method: "GET", url: "/health" });
  if (health.statusCode !== 200) throw new Error("health failed");

  const reg = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: `prod-${Date.now()}@smoke.local`, password: "secret12" },
  });
  if (reg.statusCode !== 200) throw new Error("register failed");
  const token = reg.json().token;
  const headers = { Authorization: `Bearer ${token}` };

  const thread = await app.inject({ method: "POST", url: "/api/v1/threads", headers });
  const threadId = thread.json().thread_id;
  const msg = await app.inject({
    method: "POST",
    url: `/api/v1/threads/${threadId}/messages`,
    headers: { ...headers, "content-type": "application/json" },
    payload: { content: "想申请香港硕士，请给建议。" },
  });
  if (msg.statusCode !== 200) throw new Error("chat failed");

  const search = await app.inject({
    method: "GET",
    url: "/api/v1/intelligence/search?q=%E6%B8%AF%E5%A4%A7&limit=3",
    headers,
  });
  if (search.statusCode !== 200) throw new Error("intelligence search failed");

  await app.close();
  rmSync(dir, { recursive: true, force: true });
  console.error("production-smoke: OK (inject mode)");
}

async function runLive() {
  const h = await fetchJson("/health");
  if (h.status !== 200) throw new Error(`health ${h.status}`);

  const reg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `prod-${Date.now()}@smoke.local`,
      password: "secret12",
    }),
  });
  if (reg.status !== 200) throw new Error(`register ${reg.status}`);
  const token = reg.body.token;
  const auth = { Authorization: `Bearer ${token}`, "content-type": "application/json" };

  const thread = await fetchJson("/api/v1/threads", { method: "POST", headers: auth });
  const threadId = thread.body.thread_id;
  const msg = await fetchJson(`/api/v1/threads/${threadId}/messages`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ content: "想申请香港硕士。" }),
  });
  if (msg.status !== 200) throw new Error(`chat ${msg.status}`);

  const search = await fetchJson(
    "/api/v1/intelligence/search?q=%E6%B8%AF%E5%A4%A7&limit=3",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (search.status !== 200) throw new Error(`search ${search.status}`);

  console.error(`production-smoke: OK (${BASE})`);
}

try {
  if (BASE) await runLive();
  else await runInject();
} catch (e) {
  console.error("production-smoke: FAIL", e.message);
  process.exit(1);
}
