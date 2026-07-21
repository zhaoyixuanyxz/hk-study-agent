import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogs } from "./catalogs.js";
import {
  normalizeUiLocale,
  t,
  setUiLocale,
  getUiLocale,
  applyUiLocale,
  resolveUiLocaleFromThread,
} from "./index.js";

test("zh and en catalogs share the same keys", () => {
  const zhKeys = Object.keys(catalogs.zh).sort();
  const enKeys = Object.keys(catalogs.en).sort();
  assert.deepEqual(enKeys, zhKeys);
});

test("normalizeUiLocale maps en variants and defaults to zh", () => {
  assert.equal(normalizeUiLocale("en"), "en");
  assert.equal(normalizeUiLocale("EN"), "en");
  assert.equal(normalizeUiLocale("zh"), "zh");
  assert.equal(normalizeUiLocale(undefined), "zh");
  assert.equal(normalizeUiLocale("fr"), "zh");
});

test("t returns catalog string for current locale", () => {
  setUiLocale("zh");
  assert.equal(t("nav.chat.strong"), "和我聊聊");
  setUiLocale("en");
  assert.equal(t("nav.chat.strong"), "Chat");
  assert.equal(t("missing.key.that.does.not.exist"), "missing.key.that.does.not.exist");
});

test("t interpolates template vars", () => {
  setUiLocale("en");
  assert.equal(t("chat.progress_head", { pct: 64 }), "Profile progress · ~64%");
  setUiLocale("zh");
  assert.equal(t("chat.progress_head", { pct: 64 }), "建档进度 · 总览约 64%");
});

test("resolveUiLocaleFromThread prefers thread locale then falls back", () => {
  assert.equal(resolveUiLocaleFromThread({ locale: "en" }), "en");
  assert.equal(resolveUiLocaleFromThread({ locale: "zh" }), "zh");
  assert.equal(resolveUiLocaleFromThread(null), "zh");
});

test("applyUiLocale sets documentElement.lang and data-i18n text", () => {
  if (typeof document === "undefined") {
    setUiLocale("en");
    assert.equal(getUiLocale(), "en");
    return;
  }
  document.documentElement.innerHTML =
    `<body><span data-i18n="nav.chat.strong"></span><input data-i18n-placeholder="chat.input.placeholder" /></body>`;
  applyUiLocale("en");
  assert.equal(document.documentElement.lang, "en");
  assert.equal(document.querySelector("[data-i18n]")?.textContent, "Chat");
  applyUiLocale("zh");
  assert.equal(document.documentElement.lang, "zh-CN");
});
