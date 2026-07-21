import assert from "node:assert/strict";
import { test } from "node:test";
import { mapIntelligenceItemForClient } from "../src/intelligence/item-dto.js";

test("mapIntelligenceItemForClient exposes original title and snippet", () => {
  const dto = mapIntelligenceItemForClient({
    id: "i1",
    sourceId: "s1",
    reviewStatus: "published",
    canonicalUrl: "https://example.com",
    publishedAt: "2026-01-01",
    schoolIds: ["hku"],
    infoType: "deadline",
    locale: {
      titleZh: "港大截止",
      summaryZh: "中文摘要",
      titleOriginal: "HKU Deadline",
      snippetOriginal: "Apply by March",
      contentText: "long text",
    },
  });
  assert.equal(dto.title_zh, "港大截止");
  assert.equal(dto.summary_zh, "中文摘要");
  assert.equal(dto.title_original, "HKU Deadline");
  assert.equal(dto.snippet_original, "Apply by March");
});
