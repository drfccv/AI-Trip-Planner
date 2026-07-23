import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../app/AiAssistant.tsx", import.meta.url),
  "utf8",
);

test("AI job timer accepts PostgreSQL timezone offsets without minutes", () => {
  assert.match(source, /\[\+-\]\\d\\d\(\?::\?\\d\\d\)\?\$/);
  assert.match(source, /Number\.isFinite\(timestamp\)/);
});

test("AI job timer prefers the numeric server timestamp", () => {
  const publicJobSource = readFileSync(
    new URL("../lib/ai/job-public.ts", import.meta.url),
    "utf8",
  );
  assert.match(publicJobSource, /createdAtMs: timestampMs\(job\.createdAt\)/);
  assert.match(source, /Number\.isFinite\(job\.createdAtMs\)/);
});

test("AI job timer never renders a non-finite elapsed value", () => {
  assert.match(
    source,
    /Number\.isFinite\(elapsed\) \? Math\.max\(0, elapsed\) : 0/,
  );
  assert.match(source, /elapsedJobSeconds\(clock, job\)/);
});
