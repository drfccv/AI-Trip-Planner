import assert from "node:assert/strict";
import test from "node:test";
import { buildBudgetGuidance } from "../lib/ai/budget-guidance.ts";

test("budget guidance changes choices for a high CNY budget", () => {
  const guidance = buildBudgetGuidance({
    budgetTotal: 20000,
    currency: "CNY",
    dayCount: 4,
    travelers: 2,
  });
  assert.match(guidance, /高品质型/);
  assert.match(guidance, /高档或特色酒店/);
  assert.match(guidance, /人均每天约 2,500 CNY/);
});

test("budget guidance favors value choices for a low CNY budget", () => {
  const guidance = buildBudgetGuidance({
    budgetTotal: 2400,
    currency: "CNY",
    dayCount: 3,
    travelers: 2,
  });
  assert.match(guidance, /经济型/);
  assert.match(guidance, /公共交通/);
  assert.match(guidance, /人均每天约 400 CNY/);
});
