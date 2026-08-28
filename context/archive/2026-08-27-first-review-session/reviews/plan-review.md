<!-- PLAN-REVIEW-REPORT -->
# Plan Review: First Review Session (ts-fsrs) Implementation Plan

- **Plan**: context/changes/first-review-session/plan.md
- **Mode**: Deep
- **Date**: 2026-08-27
- **Verdict**: REVISE (at review time) → **SOUND** (after triage — all 3 findings fixed in `plan.md`, see Decision fields below)
- **Findings**: 1 critical, 2 warnings, 0 observations — all FIXED

## Verdicts

| Dimension | Verdict (at review time) | Verdict (after triage) |
|-----------|---------------------------|-------------------------|
| End-State Alignment | PASS | PASS |
| Lean Execution | PASS | PASS |
| Architectural Fitness | PASS | PASS |
| Blind Spots | FAIL | PASS |
| Plan Completeness | WARNING | PASS |

## Grounding

11/11 paths ✓, 4/4 symbols ✓, brief↔plan ✓

## Findings

### F1 — submitReview never verifies flashcardId belongs to the caller

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3, §1 "Review service" (plan.md:199) and §3 "Submit route" (plan.md:215)
- **Detail**: `flashcard_review_state` is a NEW table whose rows reference `flashcards` by FK. RLS's `WITH CHECK (auth.uid() = user_id)` on INSERT only validates the *new row's own* `user_id` — it never inspects what `flashcard_id` points to, and Postgres FK checks bypass RLS on the referenced table. So a caller can submit `{flashcardId: <someone else's id>, rating: 3}` and the insert succeeds with `user_id = caller`, `flashcard_id = victim's flashcard`. Confirmed live via sub-agent verification: no existing precedent for cross-table FK ownership enforcement exists anywhere in this 2-migration codebase — this is new territory the plan doesn't address.
  Worse, because `flashcard_id` is only `unique` (not `unique(flashcard_id, user_id)`) and submit upserts `on conflict (flashcard_id)`, a forged row can later block the *real* owner: their own first review of that card hits the same conflict target, but RLS's `update_own` policy rejects updating a row they don't own — a plausible denial-of-service against a specific victim's flashcard, not just stray data.
  This is also a **plan-internal contradiction**: Phase 3's Manual Verification (plan.md:229, Progress 3.6) already promises "submitting a flashcardId belonging to a different user returns 404," and the `submit.ts` route contract (plan.md:215) claims this 404 "comes from RLS on the underlying flashcards lookup" — but `submitReview`'s own contract (plan.md:199) never performs any such lookup. The plan asserts a safety property its own described implementation doesn't provide.
- **Fix A ⭐ Recommended**: App-layer ownership check in submitReview
  - Strength: `submitReview` first does a RLS-scoped `SELECT id FROM flashcards WHERE id = flashcardId` and treats zero rows as not-found (→ 404) before touching `flashcard_review_state` at all — mirrors the existing not-found-vs-not-owned convention already used in `[id].ts`. Delivers exactly the 404 behavior Phase 3's manual checklist already expects.
  - Tradeoff: Purely app-enforced — any future code path writing to `flashcard_review_state` directly (bypassing this service function) would reopen the hole.
  - Confidence: HIGH — directly modeled on an existing, working pattern.
  - Blind spot: None significant; `flashcards` SELECT RLS already gates this correctly for the check itself.
- **Fix B**: DB-level enforcement via a trigger on flashcard_review_state
  - Strength: Defense-in-depth — `before insert or update` trigger verifying `exists (select 1 from flashcards f where f.id = new.flashcard_id and f.user_id = new.user_id)` holds even for future code paths that bypass the service layer entirely.
  - Tradeoff: New trigger function to write and test (must set an explicit `search_path` per the existing lessons.md rule), plus mapping a raised Postgres exception to a clean API 404 is extra surface across both Phase 1 and Phase 3.
  - Confidence: MEDIUM — sound technique, but no precedent in this codebase to lean on; new ground.
  - Blind spot: Exact error-shape mapping from trigger exception → API 404 isn't designed yet.
- **Decision**: FIXED (via Fix A) — `submitReview` contract now performs the RLS-scoped ownership `select` before touching `flashcard_review_state`; `submit.ts` route contract and Critical Implementation Details updated to match.

### F2 — Queue ordering between never-reviewed and overdue cards is unspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 3, §1 "Review service" (plan.md:198)
- **Detail**: `getReviewSession`'s contract says results are "ordered so nulls (never-reviewed) and the most-overdue sort first" — without saying which wins when both exist. Under the 20/day cap this materially changes behavior: NULLS FIRST means a big AI-generation batch can crowd out a genuinely overdue backlog indefinitely; NULLS LAST protects overdue reviews but can delay a freshly generated batch's first exposure by a day or more.
- **Fix A ⭐ Recommended**: Overdue-first (`ORDER BY due ASC NULLS LAST`)
  - Strength: Matches standard SRS practice (protect retention of material already at risk of being forgotten first); avoids an unbounded overdue backlog under heavy generation usage.
  - Tradeoff: Freshly generated/created flashcards may sit unreviewed for a day+ if ≥20 cards are already overdue.
  - Confidence: MED-HIGH — well-grounded in general SRS/Anki practice.
  - Blind spot: No usage data yet on typical overdue-backlog size for this app's actual users.
- **Fix B**: Never-reviewed-first (`ORDER BY due ASC NULLS FIRST`)
  - Strength: Every newly generated/created flashcard gets its first review same-day — closes the roadmap's explicitly stated "generate → save → review" loop fastest.
  - Tradeoff: A user who lets overdue reviews pile up and then generates a large new batch can see their cap entirely consumed by new cards, starving the overdue backlog.
  - Confidence: MEDIUM.
  - Blind spot: Interacts badly with the 20/day cap under heavy generation usage — not stress-tested either way.
- **Decision**: FIXED (via Fix A) — `getReviewSession` contract now specifies `ORDER BY due ASC NULLS LAST` (overdue-reviewed cards prioritized over never-reviewed).

### F3 — Empty-state signal left undecided across two phases

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3 (plan.md:102) vs. Phase 4 §1 (plan.md:247)
- **Detail**: Phase 1 fixes `ReviewSessionResponse { items: ReviewCard[] }` with no field to distinguish "zero flashcards" from "zero due." Phase 4's contract then says to add a `hasAnyFlashcards` flag "if simpler," or do a second fetch instead — an unresolved decision left for the implementer, contradicting a type Phase 1 already declared fixed. (The brief's own "Open Risks" section already flags this as unsettled, confirming it wasn't accidentally dropped — just never closed out.)
- **Fix**: Decide now — add `hasAnyFlashcards: boolean` to `ReviewSessionResponse` in Phase 1's contract (populated by a cheap existence check in `getReviewSession`), and update Phase 4's contract to reference it directly instead of "pick whichever."
- **Decision**: FIXED — `ReviewSessionResponse` now includes `hasAnyFlashcards`; `getReviewSession` populates it; Phase 4's UI contract now derives both empty states directly from the single session response, no second fetch.
