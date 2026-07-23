import assert from "node:assert/strict";
import test from "node:test";
import { compactToolEvidence } from "../lib/ai/evidence.ts";

test("final evidence is deduplicated, compact, and valid JSON", () => {
  const call = {
    id: "call_1",
    function: {
      name: "maps_direction",
      arguments: '{"origin":"A","destination":"B"}',
    },
  };
  const evidence = compactToolEvidence([
    { role: "assistant", content: null, tool_calls: [call] },
    {
      role: "tool",
      tool_call_id: "call_1",
      content: JSON.stringify({
        distance: 1200,
        duration: 900,
        polyline: "x".repeat(5000),
      }),
    },
    { role: "assistant", content: null, tool_calls: [{ ...call, id: "call_2" }] },
    {
      role: "tool",
      tool_call_id: "call_2",
      content: '{"distance":1200}',
    },
  ]);
  const parsed = JSON.parse(evidence);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].result.distance, 1200);
  assert.equal("polyline" in parsed[0].result, false);
});
