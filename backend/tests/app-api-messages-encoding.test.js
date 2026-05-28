import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appPath = join(__dirname, "..", "src", "app.js");

/** 历史乱码片段（UTF-8 被误读后的典型残留） */
const MOJIBAKE_FRAGMENTS = ["璇锋", "缂哄", "鏃犳", "浼氳", "鎶ュ", "鏂规", "涓嶈兘", "鏈\u200b"];

test("app.js API messages must not contain known mojibake fragments", () => {
  const src = readFileSync(appPath, "utf8");
  for (const frag of MOJIBAKE_FRAGMENTS) {
    assert.equal(
      src.includes(frag),
      false,
      `app.js still contains mojibake fragment: ${frag}`
    );
  }
});

test("app.js includes expected UTF-8 Chinese error messages", () => {
  const src = readFileSync(appPath, "utf8");
  assert.ok(src.includes("请求过于频繁，请稍后再试"));
  assert.ok(src.includes("该邮箱已注册"));
  assert.ok(src.includes("会话不存在或无权访问"));
  assert.ok(src.includes("报告不存在或无权访问"));
});
