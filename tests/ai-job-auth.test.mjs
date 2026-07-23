import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const requestUserSource = readFileSync(
  new URL("../lib/auth/request-user.ts", import.meta.url),
  "utf8",
);

test("background AI job requests forward anonymous identity", () => {
  assert.match(requestUserSource, /"x-lvji-anonymous-id"/);

  const source = readFileSync(
    new URL("../app/api/ai/jobs/[id]/advance/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /requestIdentityHeaders\(request\)/);
});

test("AI job advancement starts a continuous loop after the response", () => {
  const source = readFileSync(
    new URL("../app/api/ai/jobs/[id]/advance/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /after\(\(\) => runAiJobLoop\(/);
  assert.match(source, /status: 202/);
});

test("every successfully checkpointed stage tells the worker loop to continue", () => {
  const source = readFileSync(
    new URL("../lib/ai/jobs.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /status: "queued",[\s\S]*?where\(and\(eq\(aiJobs\.id, jobId\), eq\(aiJobs\.status, "running"\)\)\);[\s\S]*?return true;[\s\S]*?} catch \(error\)/,
  );
});

test("job creation starts the worker loop and polling remains read-only", () => {
  const collectionRoute = readFileSync(
    new URL("../app/api/ai/jobs/route.ts", import.meta.url),
    "utf8",
  );
  const routeSource = readFileSync(
    new URL("../app/api/ai/jobs/[id]/route.ts", import.meta.url),
    "utf8",
  );
  const clientSource = readFileSync(
    new URL("../app/AiAssistant.tsx", import.meta.url),
    "utf8",
  );
  assert.match(collectionRoute, /after\(\(\) => runAiJobLoop\(/);
  assert.doesNotMatch(routeSource, /advanceAiJob|runAiJobLoop/);
  assert.doesNotMatch(clientSource, /activeJobId}\/advance/);
});
