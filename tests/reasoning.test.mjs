import assert from "node:assert/strict";
import test from "node:test";
import { reasoningRequestFields } from "../lib/ai/reasoning.ts";

test("maps DeepSeek thinking switch to the documented thinking object", () => {
  assert.deepEqual(reasoningRequestFields("deepseek", "https://api.deepseek.com/v1", false), {
    thinking: { type: "disabled" },
  });
  assert.deepEqual(reasoningRequestFields("deepseek", "https://api.deepseek.com/v1", true), {
    thinking: { type: "enabled" },
  });
});

test("maps SiliconFlow thinking switch to enable_thinking", () => {
  assert.deepEqual(reasoningRequestFields("siliconflow", "https://api.siliconflow.cn/v1", false), {
    enable_thinking: false,
  });
});

test("maps Volcengine Ark thinking switch to the thinking object", () => {
  assert.deepEqual(reasoningRequestFields("volcengine", "https://ark.cn-beijing.volces.com/api/v3", true), {
    thinking: { type: "enabled" },
  });
});

test("does not send vendor reasoning fields to unknown compatible APIs", () => {
  assert.deepEqual(reasoningRequestFields("openai-compatible", "https://example.com/v1", false), {});
});
