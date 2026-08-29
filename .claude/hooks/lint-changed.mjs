// PostToolUse (Write|Edit) hook — lint only the file the agent just edited.
//
// Contract (see context/foundation/agent-hooks.md §4):
//   - reads the hook event as JSON on stdin -> tool_input.file_path
//   - no-op (exit 0) when: no path / path outside the project / file missing /
//     extension not in {.ts,.tsx,.astro}
//   - runs eslint on that single file, WITHOUT --fix
//   - clean            -> exit 0
//   - eslint reports    -> write report to stderr, exit 2 (feeds the agent)
//
// Zero deps beyond node: built-ins. ESM (package.json "type": "module").
// eslint is launched as `node node_modules/eslint/bin/eslint.js` so it works
// without a shell on Windows (Node 22 refuses to spawn .cmd without shell:true).
//
// It runs against .claude/hooks/eslint.config.mjs (a light, NON-type-checked
// config) — not the project's eslint.config.js — so a single-file lint takes
// ~1.5 s instead of ~10 s. Type-aware rules stay in `npm run lint` / CI.

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, relative, extname, sep, isAbsolute } from "node:path";

const LINTABLE = new Set([".ts", ".tsx", ".astro"]);

function readEvent() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

const evt = readEvent();
const filePath = evt?.tool_input?.file_path;
if (!filePath || typeof filePath !== "string") process.exit(0);

const abs = resolve(filePath);
const rel = relative(process.cwd(), abs);

// outside the project (scratchpad, ~/.claude, sibling repos, another drive, ...)
if (
  rel === "" ||
  rel.startsWith("..") ||
  rel.split(sep).includes("..") ||
  isAbsolute(rel)
) {
  process.exit(0);
}
if (!existsSync(abs)) process.exit(0);
if (!LINTABLE.has(extname(abs))) process.exit(0);

const eslintCli = resolve("node_modules/eslint/bin/eslint.js");
const hookConfig = resolve(".claude/hooks/eslint.config.mjs");
const eslintArgs = ["--no-config-lookup", "--config", hookConfig, "--no-warn-ignored", abs];

let res;
if (existsSync(eslintCli)) {
  res = spawnSync(process.execPath, [eslintCli, ...eslintArgs], {
    encoding: "utf8",
  });
} else {
  // Fallback: no local install — go through npx (needs a shell on Windows).
  res = spawnSync(`npx eslint ${eslintArgs.map((a) => `"${a}"`).join(" ")}`, {
    encoding: "utf8",
    shell: true,
  });
}

if (res.error) {
  // Could not launch eslint at all — non-blocking, don't derail the agent.
  process.stderr.write(
    `lint-changed: could not run eslint: ${res.error.message}\n`,
  );
  process.exit(0);
}

if (res.status === 0) process.exit(0);

const report = `${res.stdout || ""}${res.stderr || ""}`.trim();
process.stderr.write(
  `ESLint found problems in ${rel} (hook did not modify the file):\n\n${report}\n`,
);
process.exit(2);
