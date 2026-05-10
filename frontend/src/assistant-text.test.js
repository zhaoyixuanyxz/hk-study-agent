import test from "node:test";
import assert from "node:assert/strict";
import {
  extractAssistantDisplayText,
  stripMarkdownCodeFence,
  stripTrailingMarkdownJsonBlocks,
} from "./assistant-text.js";

test("stripTrailingMarkdownJsonBlocks removes one or more trailing fences", () => {
  const s = "你好\n\n```json\n{\"a\":1}\n```\n";
  assert.equal(stripTrailingMarkdownJsonBlocks(s).trim(), "你好");
});

test("extractAssistantDisplayText drops trailing json fence prose (legacy messages)", () => {
  const raw = `前面的自然语言。

\`\`\`json
{
  "reply": "应只展示内部正文",
  "gaps": []
}
\`\`\`
`;
  const out = extractAssistantDisplayText(raw);
  assert.equal(out, "应只展示内部正文");
  assert.ok(!out.includes("```"));
  assert.ok(!out.includes('"reply"'));
});

test("extractAssistantDisplayText unwraps full-message fence then reads reply", () => {
  const raw = `\`\`\`json
{"reply":"围栏整段","gaps":[]}
\`\`\``;
  assert.equal(extractAssistantDisplayText(raw), "围栏整段");
});

test("stripMarkdownCodeFence leaves plain text unchanged", () => {
  assert.equal(stripMarkdownCodeFence("no fence"), "no fence");
});
