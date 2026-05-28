import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, "..");
const repoRoot = join(backendRoot, "..");

test("buildApp registers modular routes and health still works", async () => {
  const app = buildApp();
  await app.ready();
  const res = await app.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, "ok");
  await app.close();
});

test("backend module files exist", () => {
  for (const f of [
    "src/modules/chat-routes.js",
    "src/modules/profile-routes.js",
    "src/modules/plan-routes.js",
    "src/modules/report-routes.js",
    "src/modules/history-routes.js",
  ]) {
    assert.ok(existsSync(join(backendRoot, f)), f);
  }
});

test("frontend pages and api client exist", () => {
  for (const f of ["src/api/client.js", "src/pages/chat.js", "src/shell/router.js"]) {
    assert.ok(existsSync(join(repoRoot, "frontend", f)), f);
  }
  const main = readFileSync(join(repoRoot, "frontend", "src", "main.js"), "utf8");
  assert.ok(main.includes('from "./api/client.js"'));
  assert.ok(main.split(/\r?\n/).length < 350);
});
