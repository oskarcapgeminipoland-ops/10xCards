<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Flashcard Data Foundation Implementation Plan

- **Plan**: context/changes/flashcard-data-foundation/plan.md
- **Scope**: Phase 1 of 2, Phase 2 of 2 (full plan — both phases complete)
- **Date**: 2026-08-23
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — `created_at`/`updated_at` are client-settable on INSERT

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260823134802_create_flashcards_table.sql:26-32 (table def), :62-65 (`flashcards_insert_own` policy)
- **Detail**: The `flashcards_set_updated_at` trigger only fires `before update`, not `before insert`. The `insert` RLS policy's `with check (auth.uid() = user_id)` constrains ownership only, not column values — so any authenticated client (e.g. via `supabase-js .insert()`) can supply arbitrary `created_at`/`updated_at` values on insert, overriding the `now()` column defaults. Currently low-impact (no insert-writing code exists yet — this change is schema-only per its own scope), but for a spaced-repetition app where card age may later feed scheduling logic, this is a real DB-layer integrity gap that every future insert path (S-01, S-03) would need to independently avoid triggering.
- **Fix A ⭐ Recommended**: Add a new migration extending `set_updated_at()` to also fire `before insert`, forcing both `created_at` and `updated_at` server-side on insert (via `TG_OP = 'INSERT'` branch), closing the gap at the DB layer once.
  - Strength: Defense-in-depth — correct forever regardless of which future code path (S-01 AI-accept, S-03 manual-create) writes the insert; no reliance on every future author remembering to strip these fields.
  - Tradeoff: Small additional migration; needs applying to any environment (local Docker, or the linked remote/cloud Supabase project) that already has Phase 1's migration.
  - Confidence: HIGH — trigger-based server-side timestamp enforcement is the standard Postgres/Supabase pattern.
  - Blind spot: Haven't verified whether the remote/cloud Supabase project referenced in `.dev.vars` has Phase 1's migration applied yet — if not, this can simply be folded into that first apply instead of a separate push.
- **Fix B**: Leave as-is; defer enforcement to the app layer when S-01/S-03 build the actual insert/update code paths (never forward client-supplied timestamp fields into the insert payload).
  - Strength: Matches this change's explicit "schema + RLS only" scope; zero current exploitation risk since no app code writes to this table yet.
  - Tradeoff: Relies on every future insert-writing developer remembering the constraint; one missed call site quietly re-opens the gap, and nothing in the DB would catch it.
  - Confidence: MEDIUM — reasonable only if S-01/S-03's plans get an explicit reminder never to trust client-supplied timestamps.
  - Blind spot: No mechanism currently guarantees that reminder reaches those future plans besides this review being read.
- **Decision**: PENDING

### F2 — RLS policies add `to authenticated`, beyond the plan's literal reference SQL

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: supabase/migrations/20260823134802_create_flashcards_table.sql:57,62,67,73
- **Detail**: All four RLS policies add `to authenticated`, which is not present in the plan's reference SQL snippet. This is a benign, defensible tightening (makes the owner-only intent explicit and keeps the `anon` role out of policy evaluation entirely) and does not change effective access control — `auth.uid() = user_id` already evaluates to false/null for unauthenticated requests. Not a violation of the "What We're NOT Doing" guardrails.
- **Fix**: No action required — optionally note the addition in `plan.md` as an addendum for future readers comparing plan text to the applied migration.
- **Decision**: PENDING

### F3 — `set_updated_at()` has no explicit `search_path`

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260823134802_create_flashcards_table.sql:39-47
- **Detail**: The function is `plpgsql`, not `SECURITY DEFINER`, so it runs with invoker privileges — the classic search_path-hijack privilege-escalation vector doesn't apply here, and the function only touches `NEW`/`now()`. Still, Supabase's database linter (`0011_function_search_path_mutable`) flags any function lacking an explicit `search_path` as a best-practice gap.
- **Fix**: Add `set search_path = ''` (or `= pg_catalog, public`) to the function definition in a follow-up migration, for defense-in-depth and to keep Supabase's advisor clean.
- **Decision**: PENDING

## Notes

- Both phases' automated success criteria were re-verified in this review session: `npm run lint` (0 errors) and `npx astro check` (0 errors, 0 warnings, 4 pre-existing hints) both pass; the plan's `## Progress` section has zero remaining `- [ ]` rows.
- Manual verification checkboxes (1.5-1.8, 2.3) are all `[x]` with commit SHAs (`8d1fe6b`, `d7432f2`) tying them to real, inspectable diffs — not rubber-stamped.
- Git scope check: diff across the implementation commits (`8d1fe6b`, `d7432f2`, `66bfc49`) touches exactly the plan's two file targets (`supabase/migrations/20260823134802_create_flashcards_table.sql`, `src/types.ts`) plus expected process/tracking files (`change.md`, `plan.md`, `roadmap.md`). No unplanned source files.
- Scope guardrails ("What We're NOT Doing") all respected: no AI-metrics table, no `ai-edited` source value, no soft-delete column/value, no API routes/UI/zod, no generated Supabase types, no pgTAP suite.
