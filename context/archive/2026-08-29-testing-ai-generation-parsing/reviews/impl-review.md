<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Rollout Phase 1 — AI Generation Pipeline: Pure Validation & Parsing

- **Plan**: context/changes/testing-ai-generation-parsing/plan.md
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-08-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Automated verification

| Command | Result |
|---|---|
| `npm run test` | PASS — 3 files, 56 tests, all green (fsrs suite still collected) |
| `npm run lint` | PASS — 0 errors; 1 pre-existing `no-console` warning in `src/lib/api-helpers.ts` (untouched by this change) |
| `npm run build` | PASS — Astro server build + type check complete |

All 25 `## Progress` checkboxes are `[x]` with commit SHAs; manual mutation-bite checks (2.6/2.7, 3.6/3.7/3.8) are recorded as performed-and-reverted.

## Findings

### F1 — stripCodeFence uppercase-tag test diverges from the plan contract (plan oracle was wrong)

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/flashcard-generation-parse.test.ts:50-56
- **Detail**: Plan Phase 2 change #1 specifies `` ```JSON `` uppercase tag → "returned unchanged (`(?:json)?` is lowercase-only)". The implementation actually returns `"JSON\n[]"` — the outer ` ``` ` markers ARE stripped, only the tag word stays glued to the payload (the lazy body + `\s*```$` anchor still matches). The test correctly pins real behaviour and carries an explanatory comment; the user-facing contract (uppercase → `error: "AI response was not valid JSON"`) is independently oracle-backed at test:154-157. So the code is right and the plan's stated expectation was factually wrong — but the deviation is only recorded inside a test comment, not in the plan or PR. The expected value `"JSON\n[]"` is also derived by tracing the regex rather than from an external source; acceptable here because for a strip-util the regex *is* the spec and manual-check 2.7 (`/i` flag) confirms it bites.
- **Fix**: Add a one-line note to the plan's Phase 2 change #1 (or the PR description) that the uppercase-fence case was corrected from "returned unchanged" to "outer fence stripped, tag word retained → fails closed downstream". No code change.
- **Decision**: FIXED — corrected the uppercase-tag bullet in plan.md Phase 2 change #1 to describe the real `"JSON\n[]"` behaviour and note it still fails closed downstream.

### F2 — schema message assertions use `t.validation.*` where the plan called for the literal Polish string

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/schemas/flashcard.test.ts:46,53,60,84,91
- **Detail**: Plan Phase 3 change #1/#2 specifies asserting `message === "Pytanie może mieć maksymalnie 500 znaków"` (literal, as an independent oracle). The tests instead assert `.toBe(t.validation.questionTooLong)` — the exact expression the schema is configured with at `flashcard.ts:14`. That is a mirror assertion: it proves zod surfaces the configured message and that `.max` (not `.min`) fired first, but it does not independently verify the message text. Partial mitigation: the i18n-face parity block (test:172-176) asserts `t.validation.questionTooLong` contains `"500"`, so number + key wiring are triangulated. Still weaker than the plan's intent — a reword of the i18n string keeps these green even though "the right message" changed. This is the `test-plan.md` §2 Risk #5 mirror anti-pattern the plan explicitly set out to avoid.
- **Fix**: In the boundary tests (changes #1/#2) assert against the literal Polish strings; keep `t.validation.*` references only inside the i18n-face parity block.
- **Decision**: FIXED — swapped the 5 message assertions (`flashcard.test.ts:46,53,60,84,91`) to literal Polish strings with a comment explaining why; `t.validation.*` now only appears in the i18n-face parity block. 56 tests still green.

### F3 — `expect(sql).not.toContain("5000")` over-reaches the stated intent

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/schemas/flashcard.test.ts:169
- **Detail**: Plan change #4 "migration face" asks the test to assert the migration has no source-text column / CHECK. Line 168 already does that well (`expect(sql).not.toMatch(/source_?text/i)`). Line 169 additionally forbids the substring `"5000"` appearing anywhere in the migration for any reason — a future unrelated `VARCHAR(5000)`, numeric default, or comment would fail this with a misleading message. Currently passes; low risk, but the assertion does not match its stated purpose.
- **Fix**: Drop the raw-number check on line 169 (the `/source_?text/i` assertion on line 168 already covers the intent), or scope it to a CHECK-clause regex.
- **Decision**: FIXED — removed `expect(sql).not.toContain(String(LIMITS.sourceText))` from the migration-face test; the `/source_?text/i` absence check remains and now carries a comment explaining why the bare-number check was dropped.
