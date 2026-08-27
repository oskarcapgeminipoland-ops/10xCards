-- Create flashcard_review_state table
--
-- Purpose: persists one FSRS `Card` per flashcard, tracking the
-- spaced-repetition schedule (stability, difficulty, due date, reps,
-- lapses) that drives the review session (FR-009). Created lazily on a
-- flashcard's first review — a flashcard with no row here has never been
-- reviewed and is treated as due immediately.
--
-- Affected: new table public.flashcard_review_state, new index, RLS enabled
-- with four granular per-operation policies, two triggers reusing the
-- existing public.set_updated_at() function.
--
-- Notes:
-- - flashcard_id is unique (one review-state row per flashcard) and cascades
--   on delete of the owning flashcard.
-- - user_id is denormalized from the owning flashcard (mirrors the
--   `flashcards` RLS pattern rather than a subquery through the FK) so RLS
--   here doesn't need to join back through `flashcards`.
-- - state matches ts-fsrs's `State` enum: Learning=1, Review=2,
--   Relearning=3. New=0 is never stored — a missing row already means "new"
--   (see Critical Implementation Details in the plan: lazy state means a
--   LEFT JOIN, not an INNER JOIN, for the due-query).
-- - updated_at is maintained by a before-update trigger; created_at is
--   never touched after insert (column default only), matching the
--   `flashcards` convention exactly — that table defines only a
--   before-update trigger, no before-insert one.
-- - RLS is enabled with one policy per operation (select/insert/update/
--   delete), each scoped to auth.uid() = user_id. Note this only validates
--   the *new row's own* user_id — it does not validate that flashcard_id
--   points to a flashcard the caller owns. That check is the service
--   layer's responsibility (see plan's Critical Implementation Details).

create table public.flashcard_review_state (
  id uuid primary key default gen_random_uuid(),
  flashcard_id uuid not null unique references public.flashcards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  due timestamptz not null,
  stability double precision not null,
  difficulty double precision not null,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  state smallint not null check (state in (1, 2, 3)),
  last_review timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- index to serve the due-query directly: filter by owner, order by due date
create index flashcard_review_state_user_id_due_idx on public.flashcard_review_state (user_id, due);

-- maintains updated_at on every row update; reuses the function already
-- defined by the flashcards migration
create trigger flashcard_review_state_set_updated_at
  before update on public.flashcard_review_state
  for each row
  execute function public.set_updated_at();

-- row level security: a user may only see/insert/update/delete their own review state
alter table public.flashcard_review_state enable row level security;

create policy "flashcard_review_state_select_own" on public.flashcard_review_state
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "flashcard_review_state_insert_own" on public.flashcard_review_state
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "flashcard_review_state_update_own" on public.flashcard_review_state
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "flashcard_review_state_delete_own" on public.flashcard_review_state
  for delete
  to authenticated
  using (auth.uid() = user_id);
