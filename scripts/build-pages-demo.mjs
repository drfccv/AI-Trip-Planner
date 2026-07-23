import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const holding = "work/pages-demo-build";
const moves = [
  ["app/api", `${holding}/api`],
  ["proxy.ts", `${holding}/proxy.ts`],
];

mkdirSync(holding, { recursive: true });
try {
  for (const [from, to] of moves)
    if (existsSync(from)) renameSync(from, to);

  // Development route types still reference app/api after it is temporarily
  // removed for the static export. Rebuild Next's generated types from scratch.
  rmSync(".next", { recursive: true, force: true });

  const result = spawnSync(
    process.execPath,
    ["node_modules/next/dist/bin/next", "build"],
    {
    stdio: "inherit",
    env: {
      ...process.env,
      GITHUB_PAGES_DEMO: "true",
      NEXT_PUBLIC_DEMO_MODE: "true",
    },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status || 1;
} finally {
  for (const [from, to] of [...moves].reverse())
    if (existsSync(to)) renameSync(to, from);
}
