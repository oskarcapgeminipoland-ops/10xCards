# First Review Session (ts-fsrs) — Plan Brief

> Full plan: `context/changes/first-review-session/plan.md`

## What & Why

Implements FR-009: a logged-in user starts a spaced-repetition review session where `ts-fsrs` (a ready-made FSRS algorithm implementation) picks due flashcards from their own deck, walks them through question → reveal answer → self-rate, and reschedules each flashcard immediately. This is the second half of the roadmap's "core validation loop" (S-01 generate → S-02 review), sequenced right after AI generation to validate the full first-time-user journey in one pass.

## Starting Point

`public.flashcards` exists (id, user_id, question, answer, source, status, timestamps) with per-operation RLS, built by F-01/S-01/S-03. No flashcard currently carries any spaced-repetition state, `ts-fsrs` isn't installed, and no test runner exists in the repo. Established conventions to extend: thin service-layer modules over the Supabase client, `withApiErrorHandling`/`jsonError` API routes, RLS as the sole ownership check, and a `Phase`-state-machine React island pattern (`FlashcardGenerator.tsx`) for stepping through items one at a time.

## Desired End State

A user with flashcards can open `/flashcards/review`, get shown one due card at a time (capped at 20/day), reveal the answer, pick Again/Hard/Good/Easy (each labeled with its predicted next interval), and see the schedule update immediately. The session ends with a tally screen; two distinct empty states cover "no flashcards at all" vs. "nothing due right now."

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| SRS library | `ts-fsrs` v5.4.1 | User-decided outside roadmap planning; zero runtime deps, Node ≥20 (matches project). | Plan |
| Session pool | Due-only, capped at 20/day | Bounds session length without a second "new cards" axis of config. | Plan |
| FSRS state init | Lazy, on first review | No backfill migration; missing row = "due now" for never-reviewed cards. | Plan |
| Rating persistence | Immediate, per card | Survives interruption; matches existing per-item accept pattern. | Plan |
| In-session navigation | Forward only, no skip/back | Simplest state model; every exposure gets a rating. | Plan |
| Session end | Summary screen with per-rating tally | Closure signal without building a stats dashboard. | Plan |
| Empty states | Two distinct messages | "No flashcards yet" needs a different CTA than "none due today." | Plan |
| Rating button UX | Show predicted interval per button | `ts-fsrs.repeat()` gives this for free; standard, well-understood SRS UX. | Plan |
| FSRS parameters | Fixed defaults, no settings UI | Matches MVP speed goal; out of PRD (FR-009) scope. | Plan |
| Submit failure handling | Block + retry, no optimistic advance | Zero risk of losing/misrepresenting a rating. | Plan |
| Automated testing | Introduce `vitest`, scoped to pure FSRS module only | Locks in scheduling correctness; mirrors S-01's I/O-free-module split precedent. | Plan |
| Scope: schedule/browse view | Out of scope | Stays inside FR-009; a future slice if needed. | Plan |
| Session queue priority | Overdue-reviewed cards before never-reviewed | Protects retention of at-risk material first, standard SRS practice; prevents new-card bursts from starving the overdue backlog. | Plan review |
| Cross-user flashcardId | Explicit ownership check in `submitReview` before touching review state | RLS alone doesn't validate what a new row's FK points to; without this, a caller could create review state against another user's flashcard. | Plan review |

## Scope

**In scope:** `flashcard_review_state` migration + RLS, `ts-fsrs` integration behind a pure wrapper module + unit tests, due-card queue + submit-rating service/API routes, `/flashcards/review` page + UI + nav entry points, a `CLAUDE.md` correction for the new test runner.

**Out of scope:** configurable FSRS parameters, skip/back navigation, batched submission, backfill for pre-existing flashcards, review-history log / stats dashboard, upcoming-schedule/calendar view, automated integration/E2E tests.

## Architecture / Approach

Data flows one direction, server-authoritative: `flashcards` LEFT JOIN `flashcard_review_state` (lazy rows) → service layer builds `ts-fsrs` `Card` objects via a pure wrapper module (`src/lib/fsrs/scheduler.ts`, no Astro/Supabase imports — unit-testable standalone) → two RPC-style API routes (`GET .../review/session`, `POST .../review/submit`) → a `Phase`-state-machine React island renders the queue and always re-derives the true next state server-side on submit rather than trusting client-echoed previews.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data foundation | Migration + RLS for `flashcard_review_state`, `ts-fsrs` dependency, shared types/schema | Getting the RLS/trigger pattern exactly right the first time (mirrors `flashcards` closely, low risk) |
| 2. Pure FSRS module | `src/lib/fsrs/scheduler.ts` + `vitest` + unit tests | Accidentally importing `astro:env`/Supabase into the pure module, breaking standalone testability |
| 3. Service + API routes | Due-queue query, submit-rating persistence, 2 routes | Using an `INNER JOIN` instead of `LEFT JOIN` would silently hide all never-reviewed flashcards |
| 4. UI + navigation | `/flashcards/review` page, `ReviewSession.tsx`, nav entries, `CLAUDE.md` fix | Getting the two empty states and completion tally right without over-building a stats view |

**Prerequisites:** S-01 and F-01 (both `done`) — the flashcards table and AI-generation flow already exist.
**Estimated effort:** ~1 session per phase, 4 phases total — fits comfortably inside the PRD's 3-week after-hours budget.

## Open Risks & Assumptions

- `ts-fsrs` v5.4.1's exact API (confirmed via its README/registry during planning) is assumed stable through implementation; if it changes on install, Phase 2's wrapper module is the single point of adjustment.
- `submitReview`'s ownership pre-check (added post-plan-review, see below) is app-layer only — a future code path writing to `flashcard_review_state` directly, bypassing this service function, would need the same check re-applied.

## Success Criteria (Summary)

- A user can complete a full review session end-to-end and see their flashcards' due dates change accordingly.
- Both empty states and the completion tally render correctly.
- `npm run lint`, `npm run build`, and `npm run test` all pass after every phase.
