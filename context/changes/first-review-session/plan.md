# First Review Session (ts-fsrs) Implementation Plan

## Overview

Implements FR-009 / roadmap slice S-02: a user starts a spaced-repetition review session where a ready-made algorithm (`ts-fsrs`, the TypeScript port of the FSRS algorithm) picks due flashcards from their own deck, walks them through question → reveal answer → self-rate (Again/Hard/Good/Easy), and persists the updated schedule per flashcard immediately after each rating.

## Current State Analysis

- `public.flashcards` (`supabase/migrations/20260823134802_create_flashcards_table.sql:24-33`) holds `id, user_id, question, answer, source('ai'|'manual'), status('active'), created_at, updated_at`, RLS-protected by 4 granular per-operation policies keyed on `auth.uid() = user_id` (`supabase/migrations/20260823134802_create_flashcards_table.sql:54-76`). No flashcard currently carries any spaced-repetition state.
- `src/lib/services/flashcards.ts` establishes the service-layer contract this plan extends: a thin wrapper around the request-scoped Supabase client, snake_case DB rows mapped to camelCase DTOs via an explicit `toX()` mapper, raw `PostgrestError` propagated on failure, and **no app-level ownership filtering** — RLS is the sole ownership boundary (`src/lib/services/flashcards.ts:6-11`).
- `src/lib/api-helpers.ts` provides `withApiErrorHandling`, `jsonError`, and `parseIdParam` — every existing `/api/flashcards/*` route wraps its handler in the first, uses the second for all error responses, and re-checks `context.locals.user` for a `401` even though `src/middleware.ts:4,18` already blocks unauthenticated page loads for any `/flashcards*` path (defense in depth for direct API calls).
- `src/components/flashcards/FlashcardGenerator.tsx` is the closest existing analog to a "step through items, act on each, persist per-item" flow: an explicit `Phase` state machine, per-item `Set`-based in-flight tracking around individual API calls (`FlashcardGenerator.tsx:149-168`), and a local `apiRequest<T>()` fetch helper duplicated per island (no shared data-fetching library, no custom hooks directory exists yet).
- The S-01 plan (`context/archive/2026-08-25-ai-flashcard-generation/plan.md`) established a precedent worth repeating here: pure logic with no I/O was split into its own file (`flashcard-generation-parse.ts`) specifically because its sibling imports `astro:env/server`, which only resolves inside Astro's runtime — blocking that logic from ever being unit-tested standalone otherwise.
- `ts-fsrs` is **not yet a dependency**. Confirmed via the npm registry and the library's own docs: current version `5.4.1`, zero runtime dependencies, requires Node ≥20 (project pins Node `22.14.0` via `.nvmrc`, and `wrangler.jsonc:7` already sets `compatibility_flags: ["nodejs_compat"]`) — no polyfill or bundling concerns expected. Public API confirmed: `fsrs(params?)` builds a scheduler; `createEmptyCard()` builds a fresh `Card`; `scheduler.repeat(card, now)` returns a preview of all four outcomes keyed by `Rating` (`preview[Rating.Good].card` / `.log`, no mutation); `scheduler.next(card, now, rating)` returns `{ card, log }` for the chosen outcome. `Rating` = `{ Manual: 0, Again: 1, Hard: 2, Good: 3, Easy: 4 }`; `State` = `{ New: 0, Learning: 1, Review: 2, Relearning: 3 }`. `Card` fields: `due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review?`.
- No test runner exists repo-wide (`CLAUDE.md`: "No test runner is configured yet"; confirmed absent from `package.json` devDependencies).

## Desired End State

A logged-in user with at least one flashcard can navigate to `/flashcards/review`, start a session, and be shown one due flashcard at a time: the question, a "Show answer" reveal, then four rating buttons (Again/Hard/Good/Easy) each labeled with the predicted next interval. Picking a rating immediately persists the new FSRS schedule for that flashcard and advances to the next one. The pool is capped at 20 flashcards/day, prioritizing the most overdue first; flashcards never reviewed before are eligible immediately. The session ends with a summary screen (count per rating) and a link back to the deck. Two distinct empty states exist: no flashcards at all (with a CTA to create/generate), and no flashcards currently due (a "come back later" message).

Verification: `npm run lint`, `npm run build`, and `npm run test` all pass; a full manual walkthrough (see Testing Strategy) confirms the session flow, persistence, and both empty states.

### Key Discoveries:

- RLS + migration conventions to mirror exactly: `supabase/migrations/20260823134802_create_flashcards_table.sql:1-76` (header comment format, per-operation policy naming `<table>_<operation>_own`, index naming `<table>_<column>_idx`, reusable `public.set_updated_at()` trigger function bound via both a `before update` and a `before insert` trigger).
- `src/lib/schemas/flashcard.ts` shows the zod convention this plan's new schema must follow (schema mirrors DB CHECK constraints exactly, colocated per domain).
- `src/pages/api/flashcards/generate.ts` and `accept.ts` are the precedent for RPC-style (non-CRUD) routes under `/api/flashcards/*` — this plan's session/submit routes follow the same shape rather than inventing a new top-level `/api/reviews/*` namespace.
- `src/middleware.ts:4` (`PROTECTED_ROUTES = ["/dashboard", "/flashcards"]`) already covers `/flashcards/review` via prefix match — no middleware change needed.

## What We're NOT Doing

- No "upcoming reviews" / schedule / calendar view — only the review session itself (FR-009 scope).
- No user-configurable FSRS parameters (desired retention, learning steps, etc.) — fixed defaults in code.
- No skip or back navigation within a session — strictly forward, one rating per card.
- No batched rating submission — every rating is its own immediate API call.
- No backfill migration for flashcards created before this feature — FSRS state is created lazily on first review.
- No persistent review-history/log table or stats dashboard beyond the single session's own tally.
- No automated integration/E2E tests — this plan introduces `vitest` scoped only to the pure FSRS scheduling module; API/UI verification stays manual, consistent with the rest of the repo.

## Implementation Approach

Four phases, each independently shippable: (1) data foundation — migration + RLS + the `ts-fsrs` dependency + shared types/schemas; (2) a pure, dependency-free FSRS scheduling module with its own unit tests (introducing `vitest`, scoped narrowly); (3) the service layer + two RPC-style API routes reusing existing conventions; (4) the review-session UI plus navigation entry points and a `CLAUDE.md` correction now that a test runner exists. This ordering lets each phase build and lint-check independently and keeps the one genuinely new architectural piece (the pure FSRS module) isolated and tested before anything depends on it.

## Critical Implementation Details

- **Server-authoritative recompute at submit time.** `GET /api/flashcards/review/session` returns rating previews for UI display only. `POST /api/flashcards/review/submit` must always re-fetch the current state row and recompute via `scheduler.next(...)` itself — never trust a client-echoed preview or `card` payload. This is a trust boundary, not just a convenience: the request body only ever carries `flashcardId` + `rating`.
- **Lazy state means a `LEFT JOIN`, not an `INNER JOIN`, for the due-query.** A flashcard with no `flashcard_review_state` row is eligible immediately (it has never been reviewed). The session query must select `flashcards LEFT JOIN flashcard_review_state` and treat `state row is null OR due <= now()` as "due" — an `INNER JOIN` would silently exclude every never-reviewed flashcard from every session forever.
- **The FSRS module must stay import-clean.** `src/lib/fsrs/scheduler.ts` must not import `astro:env/server` or the Supabase client (directly or transitively) — this is what makes it unit-testable under plain `vitest` without spinning up Astro's runtime, mirroring the `flashcard-generation-parse.ts` precedent from S-01.

## Phase 1: Data foundation

### Overview

Creates the `flashcard_review_state` table with RLS, adds `ts-fsrs` as a dependency, and defines the shared TypeScript DTOs and zod schema that later phases build on.

### Changes Required:

#### 1. Review state migration

**File**: `supabase/migrations/<timestamp>_create_flashcard_review_state_table.sql` (create via `npx supabase migration new create_flashcard_review_state_table`)

**Intent**: Persists one FSRS `Card` per flashcard, created lazily on first review, isolated per-user via RLS exactly like `flashcards`.

**Contract**: Follows the header-comment format and conventions from `supabase/migrations/20260823134802_create_flashcards_table.sql` exactly.

- `id uuid primary key default gen_random_uuid()`
- `flashcard_id uuid not null unique references public.flashcards(id) on delete cascade`
- `user_id uuid not null references auth.users(id) on delete cascade` (denormalized, mirrors the `flashcards` RLS pattern rather than a subquery through the FK)
- `due timestamptz not null`
- `stability double precision not null`
- `difficulty double precision not null`
- `elapsed_days integer not null default 0`
- `scheduled_days integer not null default 0`
- `reps integer not null default 0`
- `lapses integer not null default 0`
- `state smallint not null check (state in (1, 2, 3))` — values match `ts-fsrs`'s `State` enum (`Learning=1, Review=2, Relearning=3`; `New=0` is never stored since a missing row already means "new" — document this mapping in the migration's `-- Notes:` block)
- `last_review timestamptz`
- `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`
- Index `flashcard_review_state_user_id_due_idx on (user_id, due)` to serve the due-query directly
- RLS: `alter table ... enable row level security` + 4 policies named `flashcard_review_state_select_own` / `_insert_own` / `_update_own` / `_delete_own`, each `auth.uid() = user_id`, matching `flashcards`' exact policy shape
- Reuse `public.set_updated_at()` (already defined, no redefinition needed) bound via `flashcard_review_state_set_updated_at` (`before update`) and `flashcard_review_state_set_created_at` (`before insert`) triggers, matching the `flashcards_set_updated_at` / `flashcards_set_created_at` naming

#### 2. `ts-fsrs` dependency

**File**: `package.json`

**Intent**: Adds the FSRS scheduling library.

**Contract**: Add `"ts-fsrs": "^5.4.1"` under `dependencies`; run `npm install` to update the lockfile.

#### 3. Shared DTOs

**File**: `src/types.ts`

**Intent**: Typed contracts shared by the service layer, API routes, and the review-session UI — same role `Flashcard`/`FlashcardInput` play for the existing CRUD flow.

**Contract**:

- `ReviewRating = 1 | 2 | 3 | 4` (mirrors `ts-fsrs`'s `Rating.Again..Easy`; `Manual = 0` is never exposed to the UI)
- `ReviewIntervalPreview { rating: ReviewRating; dueAt: string; intervalDays: number }`
- `ReviewCard { flashcard: Flashcard; previews: ReviewIntervalPreview[] }`
- `ReviewSessionResponse { items: ReviewCard[] }`
- `SubmitReviewRequest { flashcardId: string; rating: ReviewRating }`
- `SubmitReviewResponse { dueAt: string; state: "learning" | "review" | "relearning" }`

#### 4. Submit-review validation schema

**File**: `src/lib/schemas/review.ts`

**Intent**: Validates `POST /api/flashcards/review/submit` request bodies, following the `flashcard.ts` schema convention (colocated per domain, reused client- and server-side).

**Contract**: `submitReviewSchema` — `flashcardId: z.uuid()`, `rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])`.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against local Supabase: `npx supabase db reset`
- Type check / build succeeds: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- In Supabase Studio (or `psql`), confirm `flashcard_review_state` exists with the expected columns, the 4 RLS policies, and the `user_id_due` index
- As two different test users, confirm a row inserted for user A's flashcard is not selectable by user B (RLS smoke test)

---

## Phase 2: Pure FSRS scheduling module

### Overview

Wraps `ts-fsrs` behind a single, dependency-free module that the service layer (Phase 3) depends on instead of importing `ts-fsrs` directly — and introduces `vitest`, scoped to this module, to lock in scheduling correctness.

### Changes Required:

#### 1. FSRS scheduler wrapper

**File**: `src/lib/fsrs/scheduler.ts`

**Intent**: The single place `ts-fsrs` is imported; translates between the DB row shape (or its absence, for never-reviewed cards) and the library's `Card` type, and exposes preview/apply operations. Must not import `astro:env/server` or the Supabase client, directly or transitively — this is what keeps it unit-testable standalone (see Critical Implementation Details).

**Contract**:

- A module-level `scheduler = fsrs({ request_retention: 0.9 })` (the one fixed, non-configurable parameter set per this plan's scope)
- `toCard(row: ReviewStateRow | null): Card` — returns `createEmptyCard()` when `row` is `null`; otherwise maps DB fields straight across (numeric `state` is already a valid `ts-fsrs` `State` value)
- `fromCard(flashcardId: string, userId: string, card: Card): ReviewStateRow` — inverse mapping, used to build the upsert payload
- `previewAll(card: Card, now: Date): ReviewIntervalPreview[]` — thin wrapper over `scheduler.repeat(card, now)`, mapping all 4 `Rating` outcomes to `{ rating, dueAt, intervalDays }`
- `applyRating(card: Card, now: Date, rating: ReviewRating): Card` — thin wrapper over `scheduler.next(card, now, rating).card`

#### 2. Unit tests

**File**: `src/lib/fsrs/scheduler.test.ts`

**Intent**: Locks in the scheduling behavior this feature depends on, since it's the one piece of new logic with no existing precedent in the codebase to lean on.

**Contract**: Covers — round-trip stability of `toCard`/`fromCard` for a reviewed card; a never-reviewed card (`row = null`) previews all 4 ratings with `dueAt` in the future; interval ordering holds for a fixed starting card (`Again` interval ≤ `Hard` ≤ `Good` ≤ `Easy`, not asserting exact FSRS constants — those are the library's responsibility); a repeated `Again` rating increases `lapses` and moves `state` toward `Relearning`.

#### 3. Test runner setup

**File**: `package.json`, `vitest.config.ts`

**Intent**: First test runner in the repo, deliberately scoped — no Astro/React test integration is added, since only the dependency-free FSRS module is covered.

**Contract**: Add `vitest` to `devDependencies`; add script `"test": "vitest run"`; minimal `vitest.config.ts` (default Node environment, no plugins needed since the covered module has no Astro/React imports).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Type check / build succeeds: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Spot-check a realistic multi-review sequence (`Good, Good, Again, Good`) via a scratch script or REPL and confirm intervals look sane (growing on `Good`, resetting/shrinking after `Again`)

---

## Phase 3: Review service layer + API routes

### Overview

Adds the due-card queue query and rating-submission persistence, exposed via two RPC-style routes under `/api/flashcards/review/*`, following the exact conventions `flashcards.ts` / `generate.ts` / `accept.ts` established.

### Changes Required:

#### 1. Review service

**File**: `src/lib/services/flashcard-reviews.ts`

**Intent**: Selects the day's due-card queue and persists a submitted rating, mirroring `flashcards.ts`'s conventions (thin wrapper over the request-scoped Supabase client, raw `PostgrestError` propagated, no app-level ownership filtering — RLS is the boundary).

**Contract**:

- `const DAILY_REVIEW_LIMIT = 20`
- `getReviewSession(supabase, userId): Promise<ReviewCard[]>` — selects `flashcards` for `userId` `LEFT JOIN flashcard_review_state`, keeping rows where the state row is absent or `due <= now()`, ordered so nulls (never-reviewed) and the most-overdue sort first, capped at `DAILY_REVIEW_LIMIT`; for each row, builds a `Card` via `toCard` and attaches `previewAll(card, now)`
- `submitReview(supabase, userId, flashcardId, rating): Promise<SubmitReviewResponse>` — fetches the existing `flashcard_review_state` row for `flashcardId` (if any), builds the current `Card` via `toCard`, calls `applyRating`, upserts the result (`on conflict (flashcard_id)`) with `user_id` set from the authenticated caller (never from the request body), returns the new `dueAt`/`state`

#### 2. Session route

**File**: `src/pages/api/flashcards/review/session.ts`

**Intent**: `GET` handler exposing `getReviewSession`.

**Contract**: Same handler shape as every existing `/api/flashcards/*` route — `withApiErrorHandling`, Supabase-client-missing → `500`, `context.locals.user` missing → `401`, `Response.json({ items } satisfies ReviewSessionResponse)`.

#### 3. Submit route

**File**: `src/pages/api/flashcards/review/submit.ts`

**Intent**: `POST` handler exposing `submitReview`.

**Contract**: Same handler shape, validating the body against `submitReviewSchema` (`400` on failure via `jsonError`), calling `submitReview`, returning `Response.json(result satisfies SubmitReviewResponse)`. A `flashcardId` that doesn't resolve to a row owned by the caller surfaces as `404` (RLS returns zero rows on the underlying `flashcards` lookup), matching the existing not-found-vs-not-owned convention in `[id].ts`.

### Success Criteria:

#### Automated Verification:

- Type check / build succeeds: `npm run build`
- Linting passes: `npm run lint`
- Unit tests still pass: `npm run test`

#### Manual Verification:

- As an authenticated user with a mix of never-reviewed and previously-reviewed flashcards, call `GET /api/flashcards/review/session` and confirm the returned queue, ordering, and cap of 20
- Call `POST /api/flashcards/review/submit` with each of the 4 ratings across different flashcards and confirm `flashcard_review_state` rows are created/updated accordingly
- Confirm submitting a `flashcardId` belonging to a different user returns `404`

---

## Phase 4: Review session UI + navigation

### Overview

The user-facing review flow: a dedicated page, a React island driving the session state machine, and entry points from existing navigation — plus correcting `CLAUDE.md` now that a test runner exists.

### Changes Required:

#### 1. Review session island

**File**: `src/components/flashcards/ReviewSession.tsx`

**Intent**: Drives the full session — fetch queue, show one card at a time, reveal answer, submit rating, advance, handle both empty states and the completion screen — mirroring `FlashcardGenerator.tsx`'s `Phase` state-machine and local `apiRequest<T>()` fetch-helper conventions (no shared data-fetching library exists in this codebase).

**Contract**: `Phase = "loading" | "empty-no-cards" | "empty-none-due" | "active" | "submitting" | "complete" | "error"`; per-card `revealed: boolean` local state; a running `Record<ReviewRating, number>` tally incremented on each successful submit, shown on the `"complete"` screen. While `"submitting"`, rating buttons are disabled and a failed submit shows a retry-able toast without advancing (per the confirmed block-and-retry decision — no optimistic advance). Rating buttons show each `ReviewIntervalPreview.intervalDays` from the current card's `previews`. `"empty-no-cards"` vs `"empty-none-due"` are distinguished by whether the fetched queue is empty because the user has zero flashcards at all (checked via a lightweight existing-flashcards signal, e.g. an empty `GET /api/flashcards?limit=1` check, or a `hasAnyFlashcards` flag included in `ReviewSessionResponse` if simpler) vs. simply none currently due — pick whichever keeps `ReviewSessionResponse` self-contained rather than requiring a second fetch.

#### 2. Review page

**File**: `src/pages/flashcards/review.astro`

**Intent**: Page shell mounting the island, matching `flashcards/index.astro` / `flashcards/generate.astro`'s `Layout` + `Topbar` wrapper and `client:load` mounting pattern exactly. Already covered by the existing `/flashcards` prefix in `PROTECTED_ROUTES` (`src/middleware.ts:4`) — no middleware change needed.

**Contract**: `<Layout><Topbar user={user} /><ReviewSession client:load /></Layout>`, same shell classes as the sibling pages.

#### 3. Navigation entry points

**Files**: `src/components/Topbar.astro`, `src/pages/flashcards/index.astro`

**Intent**: Surfaces the new `/flashcards/review` route, following the same precedent as S-01's post-review addition of nav entry points for `/flashcards/generate`.

**Contract**: A nav link in `Topbar.astro` alongside the existing ones, and a CTA button on the flashcards list page linking to `/flashcards/review`.

#### 4. `CLAUDE.md` correction

**File**: `CLAUDE.md`

**Intent**: The repo now has a test runner (scoped to FSRS logic) — the blanket "No test runner is configured yet" line is now stale and would mislead a future agent.

**Contract**: In the `## Commands` section, add `npm run test` — vitest, scoped to `src/lib/fsrs/`; amend the sentence in `## Project` accordingly instead of leaving it unqualified.

### Success Criteria:

#### Automated Verification:

- Type check / build succeeds: `npm run build`
- Linting passes: `npm run lint`
- Unit tests still pass: `npm run test`

#### Manual Verification:

- Full walkthrough: navigate to `/flashcards/review` via the new nav entry point, review a due card end-to-end (reveal answer, see interval hints on all 4 buttons, submit a rating), confirm immediate advance to the next card
- Exhaust the queue and confirm the completion screen shows the correct per-rating tally and a working link back to `/flashcards`
- Verify both empty states independently: a fresh account with zero flashcards (see the "create/generate" CTA) vs. an account whose flashcards are all freshly reviewed and not yet due (see the "come back later" message)
- Confirm a simulated submit failure (e.g. throttle network in devtools) disables buttons during the request and shows a retryable error without silently advancing

---

## Testing Strategy

### Unit Tests:

- `src/lib/fsrs/scheduler.test.ts` — see Phase 2 Contract for exact cases covered (round-trip mapping, never-reviewed preview, interval ordering, lapse handling on repeated `Again`)

### Integration Tests:

- None — no integration/E2E test runner exists in this repo; API and UI behavior are verified manually per phase (consistent with S-01/S-03 precedent)

### Manual Testing Steps:

1. As a fresh user with zero flashcards, visit `/flashcards/review` and confirm the "no flashcards yet" empty state with a CTA to create/generate
2. Create or generate a few flashcards, revisit `/flashcards/review`, and confirm they're all immediately eligible (never-reviewed = due now)
3. Step through a full session: reveal each answer, check the 4 interval-preview labels look plausible, submit varied ratings
4. Confirm each submit immediately persists (reload mid-session isn't required to work, but check the flashcard's new `flashcard_review_state` row via Supabase Studio after a submit)
5. Exhaust the queue, confirm the completion tally matches what was actually submitted
6. Immediately restart the session and confirm the "none due right now" empty state (everything was just reviewed)
7. Confirm the review link is reachable from both the Topbar and the `/flashcards` list page

## Performance Considerations

The due-card query is capped at 20 rows and served by the new `(user_id, due)` index — no pagination or additional performance work needed at this scale (PRD `target_scale.data_volume: small`).

## Migration Notes

No backfill: flashcards created before this feature simply have no `flashcard_review_state` row yet, which the lazy-init design already treats as "due now." No data migration step is required.

## References

- Related prior plans: `context/archive/2026-08-25-ai-flashcard-generation/plan.md`, `context/archive/2026-08-23-manual-flashcard-management/plan.md`
- Flashcards schema: `supabase/migrations/20260823134802_create_flashcards_table.sql`
- Service/API conventions: `src/lib/services/flashcards.ts`, `src/lib/api-helpers.ts`, `src/pages/api/flashcards/generate.ts`, `src/pages/api/flashcards/accept.ts`
- Closest UI analog: `src/components/flashcards/FlashcardGenerator.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data foundation

#### Automated

- [ ] 1.1 Migration applies cleanly: `npx supabase db reset`
- [ ] 1.2 Type check / build succeeds: `npm run build`
- [ ] 1.3 Linting passes: `npm run lint`

#### Manual

- [ ] 1.4 `flashcard_review_state` table, RLS policies, and index confirmed in Supabase Studio
- [ ] 1.5 RLS smoke test: user A's row not selectable by user B

### Phase 2: Pure FSRS scheduling module

#### Automated

- [ ] 2.1 Unit tests pass: `npm run test`
- [ ] 2.2 Type check / build succeeds: `npm run build`
- [ ] 2.3 Linting passes: `npm run lint`

#### Manual

- [ ] 2.4 Spot-check a realistic multi-review sequence for sane intervals

### Phase 3: Review service layer + API routes

#### Automated

- [ ] 3.1 Type check / build succeeds: `npm run build`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Unit tests still pass: `npm run test`

#### Manual

- [ ] 3.4 `GET /api/flashcards/review/session` returns expected queue, ordering, and 20-item cap
- [ ] 3.5 `POST /api/flashcards/review/submit` persists correctly for each of the 4 ratings
- [ ] 3.6 Cross-user `flashcardId` submission returns 404

### Phase 4: Review session UI + navigation

#### Automated

- [ ] 4.1 Type check / build succeeds: `npm run build`
- [ ] 4.2 Linting passes: `npm run lint`
- [ ] 4.3 Unit tests still pass: `npm run test`

#### Manual

- [ ] 4.4 Full session walkthrough via nav entry point works end-to-end
- [ ] 4.5 Completion screen shows correct tally and working return link
- [ ] 4.6 Both empty states verified independently
- [ ] 4.7 Submit failure blocks + shows retryable error without silent advance
