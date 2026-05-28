import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

test("Sprint6 UX: loading helper used in profile and plan pages", () => {
  const profile = readFileSync(join(repoRoot, "frontend", "src", "pages", "profile.js"), "utf8");
  const plan = readFileSync(join(repoRoot, "frontend", "src", "pages", "plan.js"), "utf8");
  assert.ok(profile.includes("setPanelLoading"));
  assert.ok(plan.includes("setPanelLoading"));
});

test("Sprint6 CSS mobile overflow guard present", () => {
  const css = readFileSync(join(repoRoot, "frontend", "src", "style.css"), "utf8");
  assert.ok(css.includes("max-width: 100vw"));
  assert.ok(css.includes("@media (max-width: 480px)"));
});

test("Sprint6 QA archive doc exists with checklist sections", () => {
  const p = join(repoRoot, "docs", "v1.verson", "V1-Sprint6-QA-归档-2026-05-28.md");
  assert.ok(existsSync(p));
  const doc = readFileSync(p, "utf8");
  assert.ok(doc.includes("QA-01"));
  assert.ok(doc.includes("QA-02"));
  assert.ok(doc.includes("DeepSeek"));
});
