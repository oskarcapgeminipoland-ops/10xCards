<!-- PLAN-REVIEW-REPORT -->
# Plan Review: AI Provider Integration (OpenRouter) Implementation Plan

- **Plan**: context/changes/ai-provider-integration/plan.md
- **Mode**: Deep
- **Date**: 2026-08-23
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

Grounding: 7/7 paths ✓, 4/4 symbols ✓, brief↔plan ✓

Sub-agent verification (no findings, confirmatory evidence):
- Astro `_`-prefix routing exclusion — confirmed in source (`node_modules/astro/dist/core/util.js:80-88`, Astro 6.4.8 installed). The plan's Critical Implementation Details claim is correct: temp route must live at `src/pages/api/dev/openrouter-smoke.ts`, not under a `_`-prefixed path.
- `OPENROUTER_API_KEY` absent from `.github/workflows/ci.yml`'s build-step env — confirmed harmless (`node_modules/astro/dist/env/validators.js:127-141`: a missing `optional: true` var validates as `undefined`, no build failure), consistent with how the existing optional Supabase vars already behave. Not a plan gap.
- Blast radius — zero existing references to "openrouter"/"OpenRouter"/"OPENROUTER" anywhere in `src/` outside the already-known config files; no path collisions under `src/pages/api/dev/` or `*debug*`.
- Error-type pattern check — no existing discriminated-union error type in the repo to conform to; the plan's `OpenRouterClientError` shape is novel but reasonable, no inconsistency introduced.

## Findings

### F1 — Manual verification 1.4 assumes a route capability the Contract never specifies

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, Changes Required #3 (Contract) vs. Manual Verification 1.4
- **Detail**: Changes Required #3 specifies the temp dev route's Contract as a fixed call: `complete({ messages: [{ role: "user", content: "Reply with exactly the word: OK" }] })` — no parameterization. But Manual Verification bullet 1.4 says "Temporarily call complete({ ..., timeoutMs: 1 }) (e.g. via a query param on the same dev route, or a one-off edit)" — a capability the route's own Contract never defines. The implementer has to invent the mechanism on the spot; "or a one-off edit" is vague enough that two implementers could do this two different ways (temporarily hand-edit the route vs. wire a real query param).
- **Fix**: Extend the dev route's Contract in Changes Required #3 to read an optional `?timeoutMs=` query param (parsed as a number, falling through to the default when absent/invalid) and pass it to `complete()`. This makes 1.4 executable exactly as written without a judgment call.
- **Decision**: SKIPPED
