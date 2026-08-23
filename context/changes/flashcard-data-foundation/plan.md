# Flashcard Data Foundation Implementation Plan

## Overview

Add the persistent, per-user-isolated data model for flashcards: a single Supabase migration creating the `flashcards` table with constraints, an `updated_at` trigger, and four granular RLS policies (select/insert/update/delete) scoped to `auth.uid() = user_id`; plus a hand-written `Flashcard` TypeScript entity type in `src/types.ts` so downstream slices (S-01 AI generation, S-03 manual management) have a typed contract to build against. This is a pure data-layer foundation — no UI, no API routes, no business logic.

## Current State Analysis

- `supabase/migrations/` does not exist — only `supabase/config.toml` is present. The only existing table is Supabase Auth's built-in `auth.users`.
- `src/types.ts` does not exist — no shared entity/DTO types have been defined yet anywhere in the repo.
- Auth is fully wired: `src/lib/supabase.ts` creates a cookie-based Supabase SSR client, and `src/middleware.ts` resolves `context.locals.user` on every request. `auth.uid()` is therefore a reliable predicate for RLS once a user is authenticated via this flow.
- No zod dependency exists yet, and none is needed here — this change adds no API routes to validate.
- Local Supabase tooling (`npx supabase ...`) requires Docker, which is **not available in the agent execution environment** (confirmed: `docker: command not found`). See Critical Implementation Details.

## Desired End State

A `flashcards` table exists in the `public` schema with RLS enabled and four operation-scoped policies enforcing that a user can only see/insert/update/delete their own rows. A `Flashcard` TypeScript type exists in `src/types.ts` whose shape exactly matches the table's columns. Verification: applying the migration locally (`npx supabase start` + `npx supabase migration up`, run by a human with Docker) succeeds with no errors, and manually creating two test users confirms row-level isolation in both directions.

### Key Discoveries:

- `CLAUDE.md` mandates granular per-operation, per-role RLS policies on every new table — a single blanket `FOR ALL` policy does not satisfy this convention.
- `CLAUDE.md` mandates migrations be created via `npx supabase migration new <name>` (timestamp-prefixed filename), placed in `supabase/migrations/`.
- The only documented flow (US-01 in `context/foundation/prd.md`) never persists rejected AI proposals — they're discarded before any insert happens. This ruled out designing `status` around a rejection/acceptance workflow.

## What We're NOT Doing

- No AI-generation event/metrics log table (needed for the 75%-acceptance success metric) — deferred to S-01, which owns the actual generate → accept/edit/reject flow and can design that log against the real code path instead of a guess.
- No `ai-edited` distinction in the `source` enum — `source` is `'ai' | 'manual'` only; whether an AI proposal was edited before acceptance isn't tracked at the row level.
- No soft-delete (`deleted_at` or a `'deleted'` status value) — deletes are hard DB deletes. `status` carries exactly one value (`'active'`) today, reserved for future use (e.g. SRS state in S-02) without requiring a follow-up migration to add the column.
- No API routes, no UI, no zod validation schemas — this change is schema + RLS only. S-01 and S-03 build the app-layer code that talks to this table.
- No generated Supabase TypeScript types (`supabase gen types typescript`) — that command requires Docker or a linked remote project, neither available here. A hand-written `Flashcard` type in `src/types.ts` covers the immediate need.
- No pgTAP or other automated RLS test suite — RLS correctness is verified manually per the repo's current state (no test runner configured yet, per `CLAUDE.md`).

## Implementation Approach

Single migration for the whole schema (table, constraints, trigger, policies) since there's no reason to split a brand-new table's definition across multiple migrations. Follow immediately with the TypeScript type addition, which has a hard dependency on the final column set being locked in.

## Critical Implementation Details

**Docker unavailability in the implementer's environment**: `npx supabase start`, `npx supabase migration up`, `npx supabase db reset`, and `npx supabase gen types` all require Docker, which is not installed in this execution environment. The implementer (agent) cannot apply or locally test the migration. Automated Verification below is therefore limited to static checks (file existence, grep-based structural checks on the SQL, `npm run lint`/typecheck). Actually applying the migration and manually verifying RLS isolation is entirely a **Manual Verification** step for the human, run on a machine with Docker.

## Phase 1: Migration — `flashcards` table + RLS

### Overview

Create the migration file defining the `flashcards` table, its constraints, an `updated_at` maintenance trigger, and four granular RLS policies.

### Changes Required:

#### 1. Flashcards table migration

**File**: `supabase/migrations/<timestamp>_create_flashcards_table.sql` (generate the timestamped filename via `npx supabase migration new create_flashcards_table`, then write its contents)

**Intent**: Define the `flashcards` table as the single source of truth for a user's flashcard set — one row per accepted/manually-created flashcard, owned by exactly one user, isolated via RLS.

**Contract**: Table `public.flashcards` with columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `question text not null` — CHECK: non-empty after trim, max 500 chars
- `answer text not null` — CHECK: non-empty after trim, max 1000 chars
- `source text not null` — CHECK: `source in ('ai', 'manual')`
- `status text not null default 'active'` — CHECK: `status in ('active')` (single reserved value; not a soft-delete flag)
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`, maintained by a `BEFORE UPDATE` trigger
- An index on `user_id` (every RLS-scoped query and future list view filters on it)

The CHECK constraints and trigger are the non-obvious part; the rest follows standard Supabase table conventions:

```sql
create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null check (length(trim(question)) > 0 and length(question) <= 500),
  answer text not null check (length(trim(answer)) > 0 and length(answer) <= 1000),
  source text not null check (source in ('ai', 'manual')),
  status text not null default 'active' check (status in ('active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index flashcards_user_id_idx on public.flashcards (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger flashcards_set_updated_at
  before update on public.flashcards
  for each row
  execute function public.set_updated_at();
```

#### 2. RLS policies (same migration file)

**Intent**: Enforce the PRD's Access Control guardrail — a user sees and modifies only their own flashcards — with one policy per operation rather than a single blanket policy, per `CLAUDE.md` convention.

**Contract**: `ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;` followed by exactly four `CREATE POLICY` statements, one each for `SELECT`, `INSERT`, `UPDATE`, `DELETE`, all restricted to `auth.uid() = user_id` (via `USING` for select/update/delete, `WITH CHECK` for insert/update):

```sql
alter table public.flashcards enable row level security;

create policy "flashcards_select_own" on public.flashcards
  for select using (auth.uid() = user_id);

create policy "flashcards_insert_own" on public.flashcards
  for insert with check (auth.uid() = user_id);

create policy "flashcards_update_own" on public.flashcards
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "flashcards_delete_own" on public.flashcards
  for delete using (auth.uid() = user_id);
```

### Success Criteria:

#### Automated Verification:

- Migration file exists under `supabase/migrations/` with a valid timestamp prefix and the name `create_flashcards_table`
- The migration file contains `enable row level security` and exactly 4 `create policy` statements referencing `flashcards`
- The migration file contains CHECK constraints for `question`, `answer`, `source`, and `status`, and the `on delete cascade` clause on `user_id`
- `npm run lint` passes (repo-wide sanity check; this phase touches no lintable source files)

#### Manual Verification:

- Run `npx supabase start` then `npx supabase migration up` (or `npx supabase db reset`) locally with Docker — migration applies with no errors
- In Supabase Studio (or via SQL), create two test users; as user A insert a flashcard; confirm user B's `SELECT`/`UPDATE`/`DELETE` against user A's row return zero rows / have no effect, and user A can fully read/update/delete their own row
- Confirm the CHECK constraints reject an empty `question`/`answer` and content exceeding the length limits
- Confirm `updated_at` changes automatically on an `UPDATE`, while `created_at` does not

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Shared TypeScript entity type

### Overview

Add a `Flashcard` type to `src/types.ts` mirroring the migration's final column set, giving S-01 and S-03 a typed contract to import instead of each redefining the shape ad hoc.

### Changes Required:

#### 1. `Flashcard` entity type

**File**: `src/types.ts` (new file)

**Intent**: Provide the canonical shared type for a flashcard row, per `CLAUDE.md`'s convention that shared entities/DTOs live in `src/types.ts`.

**Contract**: Export a `Flashcard` interface with fields matching Phase 1's columns 1:1 — `id: string`, `userId: string`, `question: string`, `answer: string`, `source: "ai" | "manual"`, `status: "active"`, `createdAt: string`, `updatedAt: string` (camelCase field names per TypeScript convention; the mapping from the DB's snake_case columns is the responsibility of whatever query code S-01/S-03 write, not this type itself).

### Success Criteria:

#### Automated Verification:

- `npx astro check` (or `npm run build`) passes with the new file present
- `npm run lint` passes

#### Manual Verification:

- Field names, types, and literal unions in `Flashcard` are cross-checked line-by-line against the migration's column list from Phase 1

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — no test runner is configured in this repo yet, and this change introduces no business logic to unit-test (pure schema + a type declaration).

### Integration Tests:

- None automated (see Critical Implementation Details on Docker unavailability). RLS is the "integration test" here and is covered under Phase 1's Manual Verification.

### Manual Testing Steps:

1. Apply the migration locally via Docker (`npx supabase start`, `npx supabase migration up`).
2. Create two test users in local Supabase Auth.
3. As user A, insert a flashcard directly (SQL or Studio).
4. As user B, attempt to select/update/delete user A's row — confirm zero rows affected in each case.
5. As user A, confirm full read/update/delete access to their own row.
6. Attempt to insert a row with an empty `question`, an over-length `answer`, and an invalid `source` value — confirm each is rejected by a CHECK constraint.

## Performance Considerations

Table and expected data volume are small (single-user flashcard sets, `target_scale.data_volume: small` per `context/foundation/prd.md`). The `user_id` index is the only performance-relevant addition, and it directly serves the RLS predicate and future list-view queries — no further optimization is warranted at this stage.

## Migration Notes

This is a net-new table with no existing data to migrate. No backfill or rollback-of-data concerns apply. Rollback, if ever needed, is a straight `DROP TABLE public.flashcards;` in a follow-up migration (not created preemptively — no rollback need is anticipated).

## References

- Roadmap item: `context/foundation/roadmap.md` → F-01 (flashcard-data-foundation)
- PRD: `context/foundation/prd.md` → Success Criteria (Guardrails), Access Control, FR-001, FR-002
- Change identity: `context/changes/flashcard-data-foundation/change.md`
- Existing auth/RLS-adjacent pattern: `src/lib/supabase.ts`, `src/middleware.ts` (source of `auth.uid()` reliability)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migration — flashcards table + RLS

#### Automated

- [x] 1.1 Migration file exists under `supabase/migrations/` with a valid timestamp prefix and the name `create_flashcards_table` — 8d1fe6b
- [x] 1.2 The migration file contains `enable row level security` and exactly 4 `create policy` statements referencing `flashcards` — 8d1fe6b
- [x] 1.3 The migration file contains CHECK constraints for `question`, `answer`, `source`, and `status`, and the `on delete cascade` clause on `user_id` — 8d1fe6b
- [x] 1.4 `npm run lint` passes — 8d1fe6b

#### Manual

- [x] 1.5 Migration applies cleanly locally via `npx supabase start` + `npx supabase migration up` — 8d1fe6b
- [x] 1.6 Two-test-user RLS isolation confirmed in both directions (select/update/delete) — 8d1fe6b
- [x] 1.7 CHECK constraints reject empty/over-length/invalid-source rows — 8d1fe6b
- [x] 1.8 `updated_at` trigger fires on UPDATE; `created_at` does not change — 8d1fe6b

### Phase 2: Shared TypeScript entity type

#### Automated

- [x] 2.1 `npx astro check` (or `npm run build`) passes
- [x] 2.2 `npm run lint` passes

#### Manual

- [x] 2.3 `Flashcard` type fields cross-checked against migration column list
