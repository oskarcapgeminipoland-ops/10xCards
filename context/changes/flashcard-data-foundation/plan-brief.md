# Flashcard Data Foundation — Plan Brief

> Full plan: `context/changes/flashcard-data-foundation/plan.md`

## What & Why

Build the per-user-isolated data foundation for flashcards: a `flashcards` table with RLS, and a shared TypeScript type. This is roadmap item **F-01** — a pure data-layer prerequisite that S-01 (AI generation) and S-03 (manual management) both need before any UI or API work can start.

## Starting Point

The repo has no flashcard-related code at all: no migrations exist yet (only `supabase/config.toml`), no `src/types.ts`, and the only table is Supabase Auth's built-in `auth.users`. Auth itself (email/password, cookie-based sessions, `context.locals.user`) is fully working and gives us a reliable `auth.uid()` for RLS.

## Desired End State

A `flashcards` table exists with RLS enabled and four per-operation policies enforcing that each user sees/modifies only their own rows. A `Flashcard` TypeScript type exists in `src/types.ts` for downstream slices to import.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Metrics/acceptance tracking | Not in this change | Keeps F-01 minimal per its roadmap outcome; S-01 designs any generation-event log against its real flow instead of a guess. |
| `status` column | Single value `'active'`, reserved | No documented flow persists rejected proposals, so there's no live use for it yet — but the column exists so a future feature (soft-delete, SRS state) doesn't need a schema change. |
| Delete semantics | Hard delete | FR-008's confirm dialog is the safety net; no soft-delete/undo requirement exists. |
| `user_id` FK | `references auth.users(id) on delete cascade` | Matches the privacy guardrail — no orphaned flashcards if an account is ever deleted. |
| Content limits | CHECK constraints (non-empty, max length) | Cheap defense-in-depth since no app-layer (zod) validation exists yet. |
| RLS verification | Manual (two test users via Supabase Studio) | Matches repo's current state — no test runner/pgTAP infrastructure exists. |
| `source` enum | `'ai' \| 'manual'` only | Covers both success-metric ratios without speculating on a write-path (`ai-edited`) that doesn't exist until S-01 is built. |
| Timestamps | `created_at` + `updated_at` (trigger-maintained) | `updated_at` will be needed the moment S-03 ships edit — cheaper to add now than via a follow-up migration. |

## Scope

**In scope:**
- `flashcards` table migration (schema, constraints, trigger, RLS)
- `Flashcard` TypeScript type in `src/types.ts`

**Out of scope:**
- AI-generation/acceptance event logging (deferred to S-01)
- Soft-delete, `ai-edited` source tracking, generated Supabase types, pgTAP tests
- Any API routes, UI, or zod validation (owned by S-01/S-03)

## Architecture / Approach

One migration defines the whole table (columns + constraints + trigger + RLS policies) in a single file — there's no reason to split a brand-new table's definition. The TypeScript type follows once the column set is locked, since it depends on it directly.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migration — flashcards table + RLS | Table, constraints, trigger, 4 RLS policies | Migration can't be applied/tested by the implementer agent — Docker isn't available in this environment, so applying + RLS verification is a manual, human-run step |
| 2. Shared TypeScript entity type | `Flashcard` type in `src/types.ts` | Low risk — depends only on Phase 1's column set being final |

**Prerequisites:** None (F-01 has no upstream dependencies). Docker installed locally (for the human running Phase 1's manual verification).
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- Docker is unavailable in the agent's execution environment, so the migration cannot be applied or RLS-tested by the implementer — this falls entirely to manual verification by a human with Docker installed.
- `status`'s single reserved value is a light bet that a future feature (not yet planned) will want it; if that never materializes, the column is harmless dead weight rather than a blocker.

## Success Criteria (Summary)

- A `flashcards` table exists with RLS enabled, verified via two test users to fully isolate rows by owner.
- CHECK constraints reject empty and over-length `question`/`answer` content and invalid `source` values.
- `src/types.ts` exports a `Flashcard` type matching the table's columns, ready for S-01/S-03 to import.
