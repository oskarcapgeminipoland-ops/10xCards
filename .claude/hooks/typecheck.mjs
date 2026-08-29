// Stop hook — run the project typecheck once, when the agent finishes a turn.
//
// Contract (see context/foundation/agent-hooks.md §5):
//   - reads the hook event as JSON on stdin -> stop_hook_active
//   - stop_hook_active === true -> exit 0 immediately (loop guard: the agent
//     already got one chance to fix type errors after stopping)
//   - otherwise run `npm run typecheck` (astro check)
//   - success        -> exit 0
//   - type errors    -> forward output to stderr, exit 2 (blocks the stop,
//                       agent sees the errors and fixes them)
//
// Zero deps beyond node: built-ins. ESM (package.json "type": "module").
// `npm run typecheck` is launched through a shell: it is a fixed, input-free
// command, and Node 22 will not spawn npm's .cmd shim without shell:true.
//
// Short-circuit: `astro check` costs ~25 s. Skip it entirely on turns that
// changed no type-relevant file (git working tree vs HEAD, tracked + untracked).
// Pure Q&A turns then cost ~0.2 s instead of ~25 s.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function readEvent() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

const evt = readEvent();
if (evt?.stop_hook_active === true) process.exit(0);

const TYPE_RELEVANT = /\.(ts|tsx|astro|mts|cts)$/;

const diff = spawnSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all"],
  { encoding: "utf8" },
);
if (!diff.error && diff.status === 0) {
  const changed = (diff.stdout || "")
    .split("\n")
    .map((l) => l.slice(3).trim())
    // porcelain rename form: "old -> new"
    .map((f) => (f.includes(" -> ") ? f.split(" -> ")[1] : f))
    .filter(Boolean);
  if (!changed.some((f) => TYPE_RELEVANT.test(f))) {
    process.exit(0); // clean tree, or nothing type-relevant changed this turn
  }
}

const res = spawnSync("npm run typecheck", {
  encoding: "utf8",
  shell: true,
});

if (res.error) {
  // Could not launch npm — non-blocking, don't trap the agent.
  process.stderr.write(`typecheck: could not run npm: ${res.error.message}\n`);
  process.exit(0);
}

if (res.status === 0) process.exit(0);

const report = `${res.stdout || ""}${res.stderr || ""}`.trim();
process.stderr.write(
  `\`npm run typecheck\` (astro check) failed:\n\n${report}\n`,
);
process.exit(2);
