import assert from "node:assert/strict";
import test from "node:test";
import {
  deterministicDispatch,
  dispatchAction,
  looksLikePlanCandidate,
} from "../lib/ai/dispatch.ts";

test("accepts a pending plan when the user declines extras and keeps it", () => {
  const messages = [
    "不用了，就这样吧",
    "不了，就这样吧。",
    "不用修改，按这个就行",
    "没有修改，就按此方案",
    "这样就行",
  ];
  for (const message of messages) {
    const decision = deterministicDispatch(message, true);
    assert.deepEqual(decision, {
      pendingPlanDecision: "accept",
      requestKind: "none",
    });
    assert.deepEqual(dispatchAction(decision, true), {
      action: "apply",
      intent: "accept_pending_plan",
    });
  }
});

test("recognizes a full itinerary returned through a reply job as pending", () => {
  const plan = `## 南昌三日游完整行程方案\n### Day 1\n${"景点和交通安排。".repeat(80)}\n### Day 2\n你觉得这个方案怎么样？`;
  assert.equal(looksLikePlanCandidate(plan), true);
  assert.equal(looksLikePlanCandidate("好的，就这么定了。"), false);
});

test("does not treat the same vague phrase as acceptance without a pending plan", () => {
  assert.equal(deterministicDispatch("不用了，就这样吧", false), null);
});

test("routes explicit revisions and rejection separately", () => {
  assert.deepEqual(deterministicDispatch("把第二天的景点调整一下", true), {
    pendingPlanDecision: "revise",
    requestKind: "plan",
  });
  assert.deepEqual(deterministicDispatch("不要这个方案", true), {
    pendingPlanDecision: "reject",
    requestKind: "none",
  });
});

test("leaves questions and ambiguous controls to semantic dispatch", () => {
  assert.equal(deterministicDispatch("酒店多少钱？", true), null);
  assert.equal(deterministicDispatch("不用了", true), null);
});
