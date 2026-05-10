import assert from "node:assert";
import { writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildApp } from "../src/app.js";

function headers(token) {
  return { authorization: `Bearer ${token}` };
}

test("POST /api/v1/profile/full-reset wipes user archive and returns new thread", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-full-reset-"));
  const db = join(dir, "db.json");
  writeFileSync(
    db,
    JSON.stringify({ users: [], threads: [], messages: [], analyticsEvents: [] }),
    "utf8",
  );
  process.env.DEEPSEEK_API_KEY = "";
  const app = buildApp({ dataFile: db });

  const reg = JSON.parse((await app.inject({ method: "POST", url: "/api/v1/users/register" })).body);
  assert.ok(reg.token && reg.user_id);

  let r = await app.inject({
    method: "POST",
    url: "/api/v1/threads",
    headers: headers(reg.token),
  });
  const tid = JSON.parse(r.body).thread_id;

  await app.inject({
    method: "POST",
    url: `/api/v1/threads/${tid}/messages`,
    headers: { ...headers(reg.token), "content-type": "application/json" },
    payload: JSON.stringify({ content: "hello hk" }),
  });

  const bad = await app.inject({
    method: "POST",
    url: "/api/v1/profile/full-reset",
    headers: { ...headers(reg.token), "content-type": "application/json" },
    payload: JSON.stringify({ confirm: false }),
  });
  assert.equal(bad.statusCode, 400);

  const ok = await app.inject({
    method: "POST",
    url: "/api/v1/profile/full-reset",
    headers: { ...headers(reg.token), "content-type": "application/json" },
    payload: JSON.stringify({ confirm: true }),
  });
  assert.equal(ok.statusCode, 200, ok.body);
  const body = JSON.parse(ok.body);
  assert.equal(body.ok, true);
  assert.ok(body.thread_id && body.thread_id !== tid);
  assert.ok(body.removed);
  assert.ok(body.removed.messages >= 1);
  assert.ok(body.removed.threads >= 1);

  const gone = await app.inject({
    method: "GET",
    url: `/api/v1/threads/${tid}`,
    headers: headers(reg.token),
  });
  assert.equal(gone.statusCode, 404);

  const prof = JSON.parse(
    (await app.inject({ method: "GET", url: "/api/v1/profile", headers: headers(reg.token) })).body,
  );
  assert.equal(prof.snapshot, null);

  const open = await app.inject({
    method: "GET",
    url: `/api/v1/threads/${body.thread_id}`,
    headers: headers(reg.token),
  });
  assert.equal(open.statusCode, 200);
  const th = JSON.parse(open.body);
  assert.equal(Array.isArray(th.messages), true);
  assert.equal(th.messages.length, 0);
});
