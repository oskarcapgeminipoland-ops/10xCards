<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Manual Flashcard Management Implementation Plan

- **Plan**: context/changes/manual-flashcard-management/plan.md
- **Scope**: Phase 3 of 3 (full plan review — all phases complete)
- **Date**: 2026-08-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Unescaped PostgREST filter metacharacters in search query

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/flashcards.ts:51-53
- **Detail**: `listFlashcards` builds the PostgREST `.or()` filter by interpolating the user-supplied `search` string directly:
  ```
  const escaped = search.replace(/[%_]/g, (match) => `\\${match}`);
  query = query.or(`question.ilike.%${escaped}%,answer.ilike.%${escaped}%`);
  ```
  Only the SQL-LIKE wildcards `%`/`_` are escaped. PostgREST's `.or()` mini-language uses `,`, `.`, `(`, `)` as syntactic separators, and none of those are escaped — a search term containing one of them can inject additional filter clauses into the query (a PostgREST-filter-string analogue of SQL string concatenation). Blast radius is bounded by RLS (still scoped to the caller's own rows, so no cross-tenant leak) and query errors fall through to the generic 500 via `withApiErrorHandling`, so this isn't an active data-leak today — but it's untrusted input reaching a hand-built query-filter string, which is fragile against future schema/query changes.
- **Fix**: Also escape `,`, `.`, `(`, `)`, and the backslash itself (escape backslash first) before interpolating `search` into the `.or()` string — or replace the single `.or()` string with two `.ilike()`-based branches / a `.filter()` call that takes the value as a bound parameter instead of string interpolation.
- **Decision**: FIXED + ACCEPTED-AS-RULE: "Escapuj wszystkie metaznaki mini-języka filtrów PostgREST, nie tylko SQL-LIKE" (context/foundation/lessons.md). Applied via Fix now — the regex escaping `,`.`( )` and `\` before `%`/`_` interpolation into `.or()`; `npm run lint` re-verified clean (0 errors).

## Notes

- Plan-drift sub-agent found **no drift, no missing items, no material scope creep** across all 3 phases — package.json, types.ts, zod schemas, service module, api-helpers, middleware, both API route files, all 8 shadcn primitives, Layout.astro Toaster wiring, FlashcardForm, DeleteFlashcardDialog, FlashcardDeck, the `/flashcards` page, and Topbar/dashboard nav wiring all match the plan's stated contracts. Cross-cutting rules (same-404 for not-found-vs-not-owned, explicit 401 auth guard before every query, no redundant `user_id` filters outside insert) all hold.
- Safety/pattern sub-agent found auth guards, pagination bounds, AbortController/IntersectionObserver cleanup, delete-confirmation gating, and dependency hygiene (only `zod` + expected shadcn/radix/sonner/next-themes transitive deps, all in `dependencies` not `devDependencies`) all clean — only the one finding above.
- Automated verification re-run in this review: `npm run lint` passes (1 pre-existing-pattern `no-console` warning at src/lib/api-helpers.ts:53, not a new issue — the project's eslint config already treats `no-console` as `"warn"` by design, and this is the only console call in the diff, used for the intentional 500-fallback error log); `npm run build` passes cleanly.
- All Progress checkboxes across Phase 1-3 are `[x]` and align with observable diff evidence — no rubber-stamping detected.
