# Rollout Phase 1 — AI Generation Pipeline: Pure Validation & Parsing — Plan Brief

> Full plan: `context/changes/testing-ai-generation-parsing/plan.md`
> Research: `context/changes/testing-ai-generation-parsing/research.md`

## What & Why

Phase 1 of the `context/foundation/test-plan.md` rollout. Write plain-Vitest unit
tests that lock two failure scenarios: **Risk #1** — a user pastes valid text and
gets an empty or uselessly short set of proposals because the parse pipeline
silently drops everything or a prompt change breaks the JSON contract, with no
error surfaced; **Risk #5 (part)** — the shared `question ≤500 / answer ≤1000 /
source-text ≤5000` validation limits drift between the schema, the DB `CHECK`, and
the i18n strings, producing either a raw HTTP 500 or acceptance of over-long
content. Both risks live in code that was deliberately split to be I/O-free, so
plain `import` + `vitest` is enough.

## Starting Point

The pure logic already exists and is import-clean: `parseGeneratedContent` /
`stripCodeFence` in `src/lib/services/flashcard-generation-parse.ts`, and
`flashcardInputSchema` / `generateRequestSchema` in `src/lib/schemas/flashcard.ts`
(no `astro:env/server` in the graph). There are **zero** tests for either — the
only test file in the repo is `src/lib/fsrs/scheduler.test.ts`, and
`vitest.config.ts` `include` is scoped to `src/lib/fsrs/` only.

## Desired End State

`npm run test` runs two new colocated suites alongside the fsrs one:
`flashcard-generation-parse.test.ts` proves the pipeline strips one `json` fence,
drops only schema-invalid items, caps to 5, counts `droppedCount` correctly, and
**never throws / never returns `[]` when valid items were present** — with
adversarial LLM payloads returning a deterministic `{data:null, error}` instead.
`flashcard.test.ts` proves the schemas reject empty-after-trim and `limit + 1`
with the right message, accept the boundary, and that `500 / 1000 / 5000` match an
independent oracle (the migration `CHECK` + PRD), checked against the migration
SQL and the i18n strings — never against `schema.max`. No production code changes.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Prose-wrapped / truncated / uppercase-tag JSON | Pin the current fail-closed-with-error behaviour as the contract | Plan-review F1 consciously chose to harden the prompt, not the parser; the visible 502 is the intended outcome, not a bug to mirror | Research + Plan |
| `>5` valid items → `slice(0,5)`, `droppedCount:0` | Document with a test, don't "fix" | F5: `droppedCount` exists only to feed the "formatting errors" toast, and cap-overflow isn't a formatting error | Research + Plan |
| `[]` / all-invalid array | Lock as non-error HTTP 200 + assert `droppedCount` is the distinguishing signal | Matches archived `plan.md:137` ("possibly empty array rather than throwing"); the UI has an empty state | Research + Plan |
| Route-level "400 not 500" assertion | Out of scope here — pure schema only; defer to §3 Phase 3 | Test-plan types Phase 1 as `unit`; Phase 3 already owns the route→DB-CHECK story with two seeded users | Plan |
| Parity-test oracle | Hard-code `500/1000/5000` from migration + PRD; triangulate against migration SQL + i18n strings; never `schema.max` | Test-plan §2 #5 explicitly forbids deriving the constant from schema introspection (mirror anti-pattern) | Research + Plan |

## Scope

**In scope:**
- Widen `vitest.config.ts` `include`; update `CLAUDE.md` + the config comment in lockstep
- `src/lib/services/flashcard-generation-parse.test.ts` — `stripCodeFence` + `parseGeneratedContent`
- `src/lib/schemas/flashcard.test.ts` — both schemas + 3-face limit-parity triangulation
- Fill `test-plan.md` §6.1 / §6.5 / §6.6; flip §3 Phase 1 status; update `change.md`

**Out of scope:**
- Any production code change (parser hardening, `droppedCount` semantics, schema edits)
- Route-handler / HTTP-status tests (§3 Phase 3), OpenRouter error mapping (§3 Phase 2)
- CI trigger fix — `master` vs `main` (§3 Phase 5)
- React/Astro render tests; asserting LLM behaviour ("≥3 proposals"); new test deps

## Architecture / Approach

Four dependency-ordered phases: (1) environment — widen the Vitest glob;
(2) Risk #1 tests, `it.each` for the adversarial-string set and the per-item
drop-reason set; (3) Risk #5 tests, schema in/out + a parity block that reads the
migration `.sql` from disk as its DB oracle and greps the i18n strings for the
number; (4) cookbook + rollout-status sync. Oracle rule throughout: every expected
value is hand-derived from PRD / migration / archived plan / documented zod-4.4.3
semantics — never recorded from the function under test.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Environment | Vitest discovers `src/lib/services` + `src/lib/schemas` tests; docs updated | Glob too broad picks up unintended files; doc drift left behind |
| 2. Risk #1 tests | Parse pipeline pinned: fence strip, drop+count, empty/all-invalid, cap-at-5, adversarial fail-closed | Accidentally writing a mirror test (expected value = recorded output) |
| 3. Risk #5 tests | Schema boundary/trim/message + 3-face limit parity against an independent oracle | Reading the migration path fails in CI; slipping into `schema.max` introspection |
| 4. Cookbook + sync | `test-plan.md` §6 filled, §3 Phase 1 → `complete`, `change.md` updated | Status vocabulary mismatch; stale "TBD" left in cookbook |

**Prerequisites:** none beyond a working `npm install` / Node 22; no Docker, no
local Supabase, no network.
**Estimated effort:** ~1–2 sessions across 4 phases (phases 2–3 are the bulk; 1
and 4 are small).

## Open Risks & Assumptions

- Assumes the four Open Questions from research stay resolved as "pin current
  behaviour" — if the team later decides prose-wrapped JSON must be salvaged, the
  Phase 2 adversarial tests change from "asserts error" to "asserts recovery".
- Assumes exactly one `*_create_flashcards_table.sql` migration exists (true
  today); a rename would break the Phase 3 parity test loudly — intended.
- The 4th limit copy (client display `const`s) is intentionally left uncovered as
  cosmetic-only drift; a reviewer must still eyeball it.
- `/10x-tdd` is viable for phases 2–3 (each assertion is nameable up front) even
  though the code already exists; phases 1 and 4 are `/10x-implement`.

## Success Criteria (Summary)

- `npm run test` runs three green suites; flipping any one pinned constant
  (`MAX_PROPOSALS`, a `.max(N)`, the fence regex, a migration CHECK number, an
  i18n string number) makes exactly the matching test fail.
- No test derives its expected value from the code under test, and no test reads
  `schema.max` — the parity oracle comes from the migration + PRD.
- `test-plan.md` §3 Phase 1 reads `complete`; §6.1 / §6.5 / §6.6 describe the
  landed conventions.
