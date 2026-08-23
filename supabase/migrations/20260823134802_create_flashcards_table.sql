-- Create flashcards table
--
-- Purpose: single source of truth for a user's flashcard set — one row per
-- accepted/manually-created flashcard, owned by exactly one user, isolated
-- via row-level security (RLS).
--
-- Affected: new table public.flashcards, new index, new trigger function,
-- new update trigger, RLS enabled with four granular per-operation policies.
--
-- Notes:
-- - question/answer carry non-empty (post-trim) and max-length CHECK
--   constraints.
-- - source is restricted to 'ai' | 'manual'.
-- - status is restricted to 'active' only (single reserved value; not a
--   soft-delete flag — deletes are hard deletes).
-- - user_id cascades on delete of the owning auth.users row.
-- - updated_at is maintained by a before-update trigger; created_at is
--   never touched after insert.
-- - RLS is enabled with one policy per operation (select/insert/update/
--   delete), each scoped to auth.uid() = user_id, per project convention
--   of granular per-operation, per-role policies rather than a single
--   blanket policy.

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

-- index to serve the RLS predicate and future list-view queries filtered by owner
create index flashcards_user_id_idx on public.flashcards (user_id);

-- maintains updated_at on every row update; created_at is untouched
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

-- row level security: a user may only see/insert/update/delete their own flashcards
alter table public.flashcards enable row level security;

create policy "flashcards_select_own" on public.flashcards
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "flashcards_insert_own" on public.flashcards
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "flashcards_update_own" on public.flashcards
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "flashcards_delete_own" on public.flashcards
  for delete
  to authenticated
  using (auth.uid() = user_id);
