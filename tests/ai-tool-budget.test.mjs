import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const jobs = readFileSync(
  new URL("../lib/ai/jobs.ts", import.meta.url),
  "utf8",
);
const planner = readFileSync(
  new URL("../lib/ai/planner.ts", import.meta.url),
  "utf8",
);

test("conversation research remains uncapped while format detail lookup is bounded", () => {
  assert.doesNotMatch(jobs, /const MAX_TOOL_ROUNDS/);
  assert.doesNotMatch(jobs, /const MAX_TOOL_CALLS/);
  assert.doesNotMatch(jobs, /MAX_CALLS_PER_ROUND/);
  assert.doesNotMatch(jobs, /MCP_TOOL_BUDGET_EXHAUSTED/);
  assert.match(jobs, /FORMAT_MAX_TOOL_ROUNDS = 4/);
  assert.match(jobs, /FORMAT_MAX_TOOL_CALLS = 24/);
  assert.match(jobs, /mode === "format"/);
});

test("AI jobs still bound model context size", () => {
  assert.match(jobs, /MAX_TOOL_RESULT_CHARS = 8000/);
  assert.match(jobs, /MAX_TOOL_HISTORY_CHARS = 96000/);
  assert.match(planner, /\.slice\(0, 8000\)/);
});

test("AI jobs reuse duplicate tool calls without removing available tools", () => {
  assert.match(jobs, /cached\.set\(callSignature\(call\), toolResult\.content\)/);
  assert.match(jobs, /复用本任务中相同参数的既有结果/);
  assert.match(jobs, /FINISH_RESEARCH_TOOL/);
  assert.match(jobs, /job\.stage === "finalizing_itinerary"/);
  assert.match(jobs, /实时资料核验已经结束/);
  assert.match(jobs, /细节补充完成，开始按确认方案生成行程/);
  assert.match(jobs, /只允许为确认方案中的重点景点补充可靠介绍和直接对应图片/);
});
