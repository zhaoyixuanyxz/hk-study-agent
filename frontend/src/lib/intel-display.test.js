import assert from "node:assert/strict";
import { test } from "node:test";
import { setUiLocale } from "../i18n/index.js";
import { intelCardSummary, intelCardTitle } from "./intel-display.js";

test("intelCardTitle prefers original when UI is en", () => {
  setUiLocale("en");
  assert.equal(
    intelCardTitle({
      title_zh: "中文标题",
      title_original: "HKU Taught Postgraduate",
    }),
    "HKU Taught Postgraduate"
  );
  assert.equal(intelCardTitle({ title_zh: "仅中文" }), "仅中文");
  setUiLocale("zh");
  assert.equal(
    intelCardTitle({
      title_zh: "中文标题",
      title_original: "HKU Taught Postgraduate",
    }),
    "中文标题"
  );
});

test("intelCardSummary prefers snippet_original when UI is en", () => {
  setUiLocale("en");
  assert.equal(
    intelCardSummary({
      summary_zh: "中文摘要",
      snippet_original: "English snippet about deadlines",
    }),
    "English snippet about deadlines"
  );
  setUiLocale("zh");
  assert.equal(
    intelCardSummary({
      summary_zh: "中文摘要",
      snippet_original: "English snippet about deadlines",
    }),
    "中文摘要"
  );
});
