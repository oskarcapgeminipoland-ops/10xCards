-- Enforce server-side created_at/updated_at on flashcards insert
--
-- Purpose: close a gap where client-supplied created_at/updated_at values
-- could override the now() column defaults on insert. The insert RLS
-- policy only constrains ownership (auth.uid() = user_id), not column
-- values, and the existing set_updated_at trigger only fired on update —
-- so any authenticated client could pass arbitrary timestamps in an
-- .insert() payload. This extends the trigger function to also fire
-- before insert, forcing both timestamps server-side regardless of what
-- the caller supplies.
--
-- Affected: public.set_updated_at() function, new before-insert trigger
-- on public.flashcards.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = now();
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger flashcards_set_created_at
  before insert on public.flashcards
  for each row
  execute function public.set_updated_at();
