import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  completionTokenFields,
  reasoningRequestFields,
  toolRequestFields,
} from "../lib/ai/reasoning.ts";
import { parseDsmlToolCalls } from "../lib/ai/dsml.ts";

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

test("uses provider-specific completion token fields", () => {
  assert.deepEqual(
    completionTokenFields("deepseek", "https://api.deepseek.com/v1", 512),
    { max_tokens: 512 },
  );
  assert.deepEqual(
    completionTokenFields("siliconflow", "https://api.siliconflow.cn/v1", 512),
    { max_tokens: 512 },
  );
  assert.deepEqual(
    completionTokenFields("openai-compatible", "https://api.openai.com/v1", 512),
    { max_completion_tokens: 512 },
  );
});

test("only sends documented parallel tool calls fields", () => {
  assert.deepEqual(
    toolRequestFields("deepseek", "https://api.deepseek.com/v1", true),
    { tool_choice: "required" },
  );
  assert.deepEqual(
    toolRequestFields("siliconflow", "https://api.siliconflow.cn/v1", true),
    { tool_choice: "auto" },
  );
  assert.deepEqual(
    toolRequestFields("openrouter", "https://openrouter.ai/api/v1", true),
    {
      tool_choice: "required",
      parallel_tool_calls: true,
      provider: { require_parameters: true },
    },
  );
});

test("planner preserves reasoning content across tool calls", () => {
  const planner = readFileSync(
    new URL("../lib/ai/planner.ts", import.meta.url),
    "utf8",
  );
  const jobs = readFileSync(
    new URL("../lib/ai/jobs.ts", import.meta.url),
    "utf8",
  );
  assert.match(planner, /reasoning_content\?: string \| null/);
  assert.match(planner, /reasoningContent: choice\.message\.reasoning_content/);
  assert.match(jobs, /reasoning_content: context\.assistantReasoningContent/);
});

test("structured no-tool generation streams with an idle timeout", () => {
  const planner = readFileSync(
    new URL("../lib/ai/planner.ts", import.meta.url),
    "utf8",
  );
  assert.match(planner, /stream: true/);
  assert.match(planner, /resetTimeout\(90000\)/);
  assert.match(planner, /onStreamProgress/);
  assert.match(planner, /streamedToolCalls/);
  assert.match(planner, /toolDelta\.function\?\.arguments/);
  assert.match(planner, /toolArgumentsAfter > toolArgumentsBefore/);
  assert.doesNotMatch(
    planner,
    /if \(done\) break;\s*resetTimeout\(90000\)/,
  );
});

test("parses textual DeepSeek DSML tool calls without leaking protocol text", () => {
  const result = parseDsmlToolCalls(
    `我先查询路线。
<|DSML|tool_calls>
<|DSML|invoke name="mcp_9">
<|DSML|parameter name="arguments" string="false">{"keywords":"苏州同得兴面馆","city":"苏州"}</|DSML|parameter>
</|DSML|invoke>
</|DSML|tool_calls>`,
  );

  assert.equal(result.detected, true);
  assert.equal(result.content, "我先查询路线。");
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].function.name, "mcp_9");
  assert.deepEqual(JSON.parse(result.toolCalls[0].function.arguments), {
    keywords: "苏州同得兴面馆",
    city: "苏州",
  });
});
