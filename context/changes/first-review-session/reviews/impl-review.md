<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: First Review Session (ts-fsrs) Implementation Plan

- **Plan**: context/changes/first-review-session/plan.md
- **Scope**: Phase 4 of 4 (full plan — all phases complete)
- **Date**: 2026-08-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Automated verification (re-run during this review)

- `npm run test` — 6/6 tests pass
- `npm run lint` — 0 errors, 1 pre-existing warning unrelated to this diff (`src/lib/api-helpers.ts:53`, not a file touched by this plan)
- `npm run build` — succeeds

## Findings

### F1 — Non-atomic read-modify-write race in `submitReview`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/flashcard-reviews.ts:122-141
- **Detail**: `submitReview` reads the existing `flashcard_review_state` row, computes `nextCard` in application code, then upserts. The `upsert(..., { onConflict: "flashcard_id" })` only makes the *write* atomic — not the read-then-compute-then-write sequence. Two concurrent submits for the same flashcard (double-tab, retried request, second device) both read the same starting state and independently compute a "next" card; the second upsert silently overwrites the first, losing that rating's effect even though the client already got a success response.
- **Fix A ⭐ Recommended**: Accept as a documented risk at current scope — add an inline comment noting the race window is bounded by the UI's own submit-disables-buttons flow and only surfaces on multi-tab/multi-device use.
  - Strength: Zero-cost; matches actual usage pattern since the UI already serializes normal single-session traffic (Phase 4 contract: rating buttons disabled while `"submitting"`).
  - Tradeoff: A double-tab or multi-device race can still silently lose a rating's scheduling effect with no server-side detection.
  - Confidence: MED — plausible given the PRD's small/solo-use target scale, but no explicit multi-device requirement was confirmed either way.
  - Blind spot: Haven't checked whether the PRD treats concurrent multi-device access as in-scope.
- **Fix B**: Make the read-modify-write atomic via a `plpgsql` RPC function or an optimistic-concurrency check (compare-and-swap on `updated_at`).
  - Strength: Closes the race entirely; standard fix for compute-then-write flows against Postgres.
  - Tradeoff: Meaningfully more code — a new DB function or CAS logic, more surface to test and maintain, arguably premature at this app's stated "small" scale.
  - Confidence: MED — technically sound, but cost may outweigh actual risk here.
  - Blind spot: None significant.
- **Decision**: PENDING

### F2 — `getReviewSession` query mechanism diverges from the plan's LEFT JOIN design

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/flashcard-reviews.ts:50-101
- **Detail**: The plan's Critical Implementation Details specified a single `flashcards LEFT JOIN flashcard_review_state` SQL query. The implementation instead runs two unbounded `select("*")` queries (`flashcards`, `flashcard_review_state`) and stitches the "due" filter, sort, and `DAILY_REVIEW_LIMIT` cap in application code. This is disclosed in the file's header comment as a deliberate choice — PostgREST's embedded-resource syntax can't cleanly express "row is null OR due ≤ now" across a to-many embed, and the author notes this couldn't be verified against a live Postgres instance in this environment. Functionally equivalent (LEFT JOIN semantics preserved correctly), but the new `(user_id, due)` index this same plan added is now unused by this query, and the plan's "Performance Considerations" claim ("served by the new index") no longer describes what the code does.
- **Fix A ⭐ Recommended**: Accept as-is; update the plan's Performance Considerations section to describe the actual implementation (two selects bounded by deck size, not an indexed single query) since PRD scale is `small` and the code already documents the rationale.
  - Strength: Matches actual code; keeps the plan honest as a record for future maintainers instead of describing an index that isn't used by this path.
  - Tradeoff: The `(user_id, due)` index remains unused — harmless but dead weight.
  - Confidence: HIGH — the code comment gives a clear, defensible rationale for the deviation.
  - Blind spot: Haven't verified against a live Supabase/Postgres instance whether a working single-query LEFT JOIN was actually achievable — the implementer flagged it as unverified, not impossible.
- **Fix B**: Replace with a Postgres function (`supabase.rpc()`) doing the LEFT JOIN, filter, order, and limit in one indexed query server-side, exactly as originally planned.
  - Strength: Matches the plan's original design, restores index usage, bounds the fetch at the DB layer regardless of deck size.
  - Tradeoff: New DB function to write and test; moves logic out of the TS layer the unit tests currently mirror.
  - Confidence: MED — straightforward SQL, but introduces an RPC surface this project hasn't used elsewhere.
  - Blind spot: None significant — this is exactly what the plan called for.
- **Decision**: PENDING

### F3 — Roadmap S-02 left at "in-progress" despite full implementation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/roadmap.md (S-02 row + status line)
- **Detail**: `context/foundation/roadmap.md` was flipped from `planning` to `in-progress` for S-02 in the Phase 1 commit, but never updated to `done` even though all 4 phases are complete and `change.md` already shows `status: implemented`. Every other completed slice (F-01, F-02, S-01, S-03) shows `done` in the same table.
- **Fix**: Update `context/foundation/roadmap.md`'s S-02 table row and status line to `done`, matching the existing convention for completed slices.
- **Decision**: PENDING

### F4 — FSRS `enable_short_term: false` config drift leaves `Relearning` untested

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/fsrs/scheduler.ts:31, src/lib/fsrs/scheduler.test.ts:64-81
- **Detail**: The plan specified `fsrs({ request_retention: 0.9 })`; the implementation adds `enable_short_term: false`, disclosed in the module's top comment as a correction for a `learning_steps` field the plan's `ts-fsrs` research missed. Consequence (also disclosed): `State.Relearning` becomes practically unreachable, so the Phase 2 test case that was supposed to assert "a repeated `Again` rating ... moves state toward `Relearning`" instead only asserts `lapses` increments and `stability` shrinks — the literal planned assertion isn't covered.
- **Fix**: Accept as-is — the deviation fixes a real gap in the plan's research and doesn't affect user-facing correctness at this app's day-granularity scope; the in-code comment already documents the decision as the record.
- **Decision**: PENDING

### F5 — Redundant ownership filter contradicts the file's own documented convention

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/flashcard-reviews.ts:56
- **Detail**: The file's header comment states "no app-level ownership filtering on reads — RLS is the boundary," matching `flashcards.ts`'s convention, and the two main queries omit any `user_id` filter accordingly. The `hasAnyResult` query on the same line block adds `.eq("user_id", userId)` — harmless (it only narrows an already-RLS-scoped read) but inconsistent with the stated rule.
- **Fix**: Drop the `.eq("user_id", userId)` from the `hasAnyResult` query for consistency with the file's own documented convention.
- **Decision**: PENDING

### F6 — Not-found signaling diverges from `flashcards.ts` convention

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/flashcard-reviews.ts:119
- **Detail**: `submitReview` signals not-found by throwing `ApiError("Not found", 404)` directly from the service layer. The existing analog (`updateFlashcard`/`deleteFlashcard` in `flashcards.ts` + `src/pages/api/flashcards/[id].ts:38-41`) instead returns `null`/`false` from the service and lets the route map that to `jsonError("Flashcard not found", 404)`. Both are supported by `api-helpers.ts`, so this isn't a bug, but it's a genuine layering-style divergence, and the message text also differs ("Not found" vs. "Flashcard not found").
- **Fix**: Optional — align with the `flashcards.ts` convention (service returns `null`, route maps to `jsonError`) if this RPC-route pattern will be reused; otherwise accept as a one-off, since `ApiError` is a supported, centrally-caught mechanism.
- **Decision**: PENDING
