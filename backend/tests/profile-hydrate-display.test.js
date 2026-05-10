import assert from "node:assert";
import { test } from "node:test";

import { hydrateProfileSnapshotFromMemories } from "../src/profile-service.js";

test("hydrateProfileSnapshotFromMemories ignores stale frozen confirmation rows when memories are empty", () => {
  /** @type {Record<string, unknown>} */
  const frozen = {
    summary: "会话摘要仍会保留用于展示",
    gaps: [],
    structuredFacts: { gpa: "3.5" },
    confirmationState: {
      facts: [
        { id: "fact_gpa", key: "gpa", value: "3.5", status: "pending" },
        { id: "fact_field", key: "field", value: "AI", status: "pending" },
      ],
    },
    updatedAt: new Date().toISOString(),
  };

  const out = hydrateProfileSnapshotFromMemories(frozen, []);
  assert.ok(out);
  const facts = out.confirmationState?.facts || [];
  assert.equal(facts.length, 0);
});
