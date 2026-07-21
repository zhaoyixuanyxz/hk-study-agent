import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DEEPSEEK_MODEL,
  buildDeepseekChatBody,
  resolveDeepseekModel,
} from "../src/deepseek-client.js";

describe("deepseek-client", () => {
  it("defaults model to deepseek-v4-pro", () => {
    const prev = process.env.DEEPSEEK_MODEL;
    delete process.env.DEEPSEEK_MODEL;
    assert.equal(resolveDeepseekModel(""), DEFAULT_DEEPSEEK_MODEL);
    assert.equal(DEFAULT_DEEPSEEK_MODEL, "deepseek-v4-pro");
    if (prev != null) process.env.DEEPSEEK_MODEL = prev;
  });

  it("chat/extraction body disables thinking and omits reasoning_effort", () => {
    const body = buildDeepseekChatBody({
      messages: [{ role: "user", content: "hi" }],
      thinking: false,
      temperature: 0.7,
      max_tokens: 100,
    });
    assert.equal(body.model, "deepseek-v4-pro");
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.equal(body.reasoning_effort, undefined);
    assert.equal(body.temperature, 0.7);
    assert.equal(body.max_tokens, 100);
  });

  it("plan/report body enables thinking with high effort", () => {
    const body = buildDeepseekChatBody({
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "plan" }],
      thinking: true,
      reasoningEffort: "high",
      temperature: 0.35,
    });
    assert.deepEqual(body.thinking, { type: "enabled" });
    assert.equal(body.reasoning_effort, "high");
  });
});
