import assert from "node:assert";
import { test } from "node:test";
import {
  normalizeLocale,
  buildOutputLocaleBlock,
  resolveThreadLocale,
} from "../src/output-locale.js";

test("normalizeLocale accepts zh/en and defaults unknown to zh", () => {
  assert.equal(normalizeLocale("en"), "en");
  assert.equal(normalizeLocale("zh"), "zh");
  assert.equal(normalizeLocale("EN"), "en");
  assert.equal(normalizeLocale(undefined), "zh");
  assert.equal(normalizeLocale("fr"), "zh");
});

test("buildOutputLocaleBlock en mentions English and JSON user-facing fields", () => {
  const block = buildOutputLocaleBlock("en");
  assert.match(block, /\[OUTPUT_LOCALE\]/);
  assert.match(block, /locale=en/);
  assert.match(block, /English/i);
  assert.match(block, /plain_language_notes/);
});

test("buildOutputLocaleBlock zh asks for Simplified Chinese", () => {
  const block = buildOutputLocaleBlock("zh");
  assert.match(block, /locale=zh/);
  assert.match(block, /简体中文/);
});

test("resolveThreadLocale falls back to zh when missing", () => {
  assert.equal(resolveThreadLocale(null), "zh");
  assert.equal(resolveThreadLocale({}), "zh");
  assert.equal(resolveThreadLocale({ locale: "en" }), "en");
});
