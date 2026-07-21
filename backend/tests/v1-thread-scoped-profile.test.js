import assert from "node:assert";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildApp } from "../src/app.js";
import { createStore } from "../src/store.js";

function headers(token) {
  return { authorization: `Bearer ${token}` };
}

test("store: memories and snapshots are isolated by threadId", () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-thread-prof-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  const store = createStore(db);
  const user = store.createUser();
  const t1 = store.createThread(user.id, { locale: "zh" });
  const t2 = store.createThread(user.id, { locale: "en" });

  store.upsertMemory({
    userId: user.id,
    kind: "confirmed",
    key: "gpa",
    value: "3.5",
    threadId: t1.id,
  });
  store.upsertMemory({
    userId: user.id,
    kind: "confirmed",
    key: "gpa",
    value: "3.9",
    threadId: t2.id,
  });

  const m1 = store.listMemoriesByThread(user.id, t1.id);
  const m2 = store.listMemoriesByThread(user.id, t2.id);
  assert.equal(m1.length, 1);
  assert.equal(m1[0].value, "3.5");
  assert.equal(m2.length, 1);
  assert.equal(m2[0].value, "3.9");

  store.appendProfileSnapshot({
    userId: user.id,
    threadId: t1.id,
    snapshot: { summary: "thread1", structuredFacts: { gpa: "3.5" }, gaps: [] },
    planInputView: { readiness: { ready: false } },
  });
  store.appendProfileSnapshot({
    userId: user.id,
    threadId: t2.id,
    snapshot: { summary: "thread2", structuredFacts: { gpa: "3.9" }, gaps: [] },
    planInputView: { readiness: { ready: false } },
  });

  assert.equal(store.getLatestProfileSnapshot(user.id, t1.id)?.snapshot?.summary, "thread1");
  assert.equal(store.getLatestProfileSnapshot(user.id, t2.id)?.snapshot?.summary, "thread2");
});

test("API: new thread progress does not inherit other thread profile", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-thread-api-"));
  const db = join(dir, "db.json");
  writeFileSync(db, JSON.stringify({ users: [], threads: [], messages: [] }), "utf8");
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const { token } = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);

  const t1 = JSON.parse(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/threads",
        headers: { ...headers(token), "content-type": "application/json" },
        payload: JSON.stringify({ locale: "zh" }),
      })
    ).body
  ).thread_id;

  for (const content of [
    "我想申请香港计算机授课型硕士，本科211，GPA 3.5。",
    "计划2026秋入学，雅思7分。",
    "预算大约25万港币，风险偏好均衡。",
  ]) {
    const r = await app.inject({
      method: "POST",
      url: `/api/v1/threads/${t1}/messages`,
      headers: { ...headers(token), "content-type": "application/json" },
      payload: JSON.stringify({ content }),
    });
    assert.equal(r.statusCode, 200, r.body);
  }

  const last1 = JSON.parse(
    (await app.inject({ method: "GET", url: `/api/v1/threads/${t1}`, headers: headers(token) })).body
  );
  const meta1 = [...(last1.messages || [])].reverse().find((m) => m.role === "assistant")?.meta;
  assert.ok(meta1?.profile_progress);
  assert.ok((meta1.profile_progress.summary_pct ?? 0) > 0);

  const t2 = JSON.parse(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/threads",
        headers: { ...headers(token), "content-type": "application/json" },
        payload: JSON.stringify({ locale: "en" }),
      })
    ).body
  ).thread_id;

  const r2 = await app.inject({
    method: "POST",
    url: `/api/v1/threads/${t2}/messages`,
    headers: { ...headers(token), "content-type": "application/json" },
    payload: JSON.stringify({ content: "Hi, I am just starting a new session." }),
  });
  assert.equal(r2.statusCode, 200, r2.body);
  const body2 = JSON.parse(r2.body);
  const pp2 = body2.assistant_message?.meta?.profile_progress;
  // New thread should not inherit ~full progress from t1
  assert.ok(!pp2 || (pp2.summary_pct ?? 0) < (meta1.profile_progress.summary_pct ?? 0));
  // Stronger: first-turn new thread progress should be well below the filled thread
  if (pp2) {
    assert.ok(
      pp2.summary_pct <= 40,
      `expected low progress on new thread, got ${pp2.summary_pct}`
    );
  }

  const prof1 = JSON.parse(
    (
      await app.inject({
        method: "GET",
        url: `/api/v1/profile?thread_id=${encodeURIComponent(t1)}`,
        headers: headers(token),
      })
    ).body
  );
  const prof2 = JSON.parse(
    (
      await app.inject({
        method: "GET",
        url: `/api/v1/profile?thread_id=${encodeURIComponent(t2)}`,
        headers: headers(token),
      })
    ).body
  );
  assert.ok(prof1.snapshot);
  assert.ok(
    !prof2.snapshot ||
      String(prof2.snapshot.summary || "") !== String(prof1.snapshot.summary || "") ||
      (prof2.memories || []).length < (prof1.memories || []).length
  );
});
