<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Rollout Phase 1 — AI Generation Pipeline: Pure Validation & Parsing

- **Plan**: context/changes/testing-ai-generation-parsing/plan.md
- **Mode**: Deep
- **Date**: 2026-08-29
- **Verdict**: REVISE → SOUND (after triage 2026-08-29 — all 4 findings fixed in plan.md)
- **Findings**: 0 critical, 2 warnings, 2 observations — all FIXED

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | WARNING |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

7/7 paths ✓ (`flashcard-generation-parse.ts`, `flashcard.ts`, `vitest.config.ts`,
`CLAUDE.md`, `scheduler.test.ts`, `20260823134802_create_flashcards_table.sql`,
`i18n.ts`), 6/6 symbols ✓ (`parseGeneratedContent`, `stripCodeFence`,
`MAX_PROPOSALS`, `flashcardInputSchema`, `generateRequestSchema`, `t.validation.*`),
brief↔plan ✓.

Discovered during grounding: no `typecheck` npm script (→ F2); 3 migrations exist
and a constraint-only follow-up migration precedent is already present (→ F3);
ESLint runs with `projectService: true` so `npm run lint` is a genuine type-checked
gate for `.ts` files.

Step 3: verified inline — plan authored this session; all riskiest claims (parser
control flow read line-by-line, zod 4.4.3 semantics from research probe,
paths/symbols, the 2-file blast radius of `vitest.config.ts` + `flashcard.ts`)
already checked against code. No sub-agent launched.

## Findings

### F1 — Importer-identity check is tautological

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Lean Execution
- **Location**: Phase 3 — Changes Required #3 ("Importer-identity check")
- **Detail**: The change's Intent is "assert the routes and the client form import
  the same schema object". The specified Contract
  (`expect(flashcardInputSchema).toBe((await import("@/lib/schemas/flashcard")).flashcardInputSchema)`)
  imports the *same module* twice; ES modules are singletons so this is always
  true and proves nothing about `accept.ts` / `index.ts` / `[id].ts` /
  `FlashcardForm.tsx`. The enumerated importer paths are a comment, not a check.
  The change delivers no signal for the drift it claims to guard.
- **Fix A ⭐ Recommended**: Make it a real file-level check
  - Approach: Drop the `.toBe` line. Add a test that reads each of the 5 importer
    files (node:fs — same technique as the parity block in #4) and asserts each
    contains an import from `"@/lib/schemas/flashcard"` referencing
    `flashcardInputSchema` (plus `generateRequestSchema` for the 2 generate-path
    files).
  - Strength: Actually catches a route swapping to a local/inline schema — the
    Risk #5 "copies diverge" failure. Reuses the file-read pattern the plan
    already commits to.
  - Tradeoff: Brittle to import-style refactors (`import * as`); needs a tolerant
    regex, not an exact string.
  - Confidence: HIGH — the importer list is grep-verified in research Area 5.
  - Blind spot: Proves import, not that the symbol is wired into `safeParse`.
- **Fix B**: Drop the assertion, keep only the documented path list
  - Approach: Replace change #3 with a plain comment block enumerating the 5
    importers + a note that route-level parity is covered by §3 Phase 3
    integration.
  - Strength: Honest about what a unit test can prove; zero brittle code; Phase 3
    genuinely owns cross-route behaviour.
  - Tradeoff: No mechanical guard until Phase 3 lands.
  - Confidence: HIGH — matches the plan's own "defer route surface to Phase 3".
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — Phase 3 change #3 rewritten as an `it.each`
  file-level source check over the 7 grep-verified `(file, symbol)` importer pairs.

### F2 — `npx tsc --noEmit` is not a project gate

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Success Criteria 1.3, 2.3, 3.3 (and Progress 1.3 / 2.3 / 3.3)
- **Detail**: Three automated-verification bullets say "`npx tsc --noEmit` passes".
  No `typecheck` script exists. `tsconfig.json` extends `astro/tsconfigs/strict`
  with `include: ["**/*"]`, so bare `tsc --noEmit` tries to compile `.astro` files
  and emits unrelated "Cannot find module './X.astro'" errors. The real type gates
  are `npm run lint` (typescript-eslint `projectService: true`) and `npm run build`
  (CI gate per CLAUDE.md).
- **Fix**: Replace the three `npx tsc --noEmit` bullets — drop the redundant tsc
  line (rely on the adjacent `npm run lint` bullet), and add one `npm run build`
  bullet to Phases 2 and 3 as the fuller type check. Update matching Progress
  entries. Criterion 1.3's "(or the build type step)" hedge becomes the actual
  instruction.
- **Decision**: FIXED — all three `npx tsc --noEmit` bullets (criteria 1.3 / 2.3 /
  3.3 + Progress) replaced with `npm run build`; `npm run lint` bullets annotated
  as the type-checked-ESLint gate.

### F3 — Parity test reads only the CREATE TABLE migration

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 #4 "migration face"; Critical Implementation Details
  ("there is exactly one such migration")
- **Detail**: The parity block regexes the CHECK bound out of
  `20260823134802_create_flashcards_table.sql`. A constraint-only follow-up
  migration precedent already exists
  (`20260823153107_enforce_server_side_flashcard_timestamps.sql`). A future
  `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT (length(question) <= 600)`
  would leave this test asserting the stale 500 from the CREATE TABLE line and
  passing — false confidence in exactly the Risk #5 drift scenario. "Exactly one
  such migration" is true only for the `*_create_flashcards_table.sql` glob; the
  effective DB constraint is not single-file by this project's convention.
- **Fix**: Glob all `supabase/migrations/*.sql`, collect every CHECK touching
  `length(question)` / `length(answer)`, assert the *last* one equals the oracle —
  or, minimum: add an inline comment stating the "CHECK is never altered by a
  later migration" assumption and why it's acceptable for MVP. Soften the "exactly
  one such migration" wording.
- **Decision**: FIXED (minimal variant) — kept the single-file read; Critical
  Implementation Details now flags the constraint-only-migration precedent as a
  Known limitation and mandates an inline comment stating the "CHECK defined once,
  never altered later" assumption, with glob-all-migrations named as the escape
  hatch. "Exactly one such migration" wording softened.

### F4 — Phase 4 references stale rollout status `researched`

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 #4 (Contract), Success Criterion 4.3; Desired End State /
  Phase 4 #5 (change.md status)
- **Detail**: Commit 9ee66a0 already moved `test-plan.md` §3 Phase 1 to `planned`.
  Phase 4 #4 still says "`researched` → `complete`" and criterion 4.3 greps for
  `researched` — which no longer matches that row, making the criterion a no-op.
  Separately, Desired End State says "change.md status → implementing" while
  Phase 4 #5 sets it to `complete`; `/10x-plan-review` and `/10x-implement` own
  that field.
- **Fix**: Phase 4 #4 → "`planned` → `complete`"; criterion 4.3 → assert
  `| planned | testing-ai-generation-parsing |` is absent from the Phase 1 row.
  Trim the change.md status prescriptions from Desired End State and Phase 4 #5;
  note that the 10x skills manage `change.md`.
- **Decision**: FIXED — Phase 4 #4 + criteria 4.3 now key off `planned`; Desired
  End State and Phase 4 #5 no longer prescribe `change.md` transitions (left to
  `/10x-implement` / `/10x-archive`); Progress 4.2 / 4.3 / 4.6 synced.

## Notes — what's solid

The oracle discipline is the strong part: every phase names its independent oracle
source, the "flip a constant → matching test must fail" manual checks (2.6, 2.7,
3.6–3.8) are a real guard against mirror tests, and the scope boundaries (no prod
code; route surface → Phase 3; OpenRouter → Phase 2) are clean and consistently
held. All four findings are quick edits; none change the approach.
