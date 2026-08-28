/**
 * Owns every Supabase call this feature makes, so the `/api/flashcards*`
 * route handlers stay thin. Encapsulates the snake_case <-> camelCase
 * mapping and the search+pagination query shape.
 *
 * The passed-in `supabase` client is already scoped to the caller's
 * session — RLS enforces per-user ownership, so nothing here adds its own
 * `user_id` filter on read/update/delete (see plan's Critical Implementation
 * Details: "RLS is not a substitute for the auth guard, but it IS the
 * ownership filter").
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Flashcard, FlashcardInput, FlashcardListResponse } from "@/types";

interface FlashcardRow {
  id: string;
  user_id: string;
  question: string;
  answer: string;
  source: "ai" | "manual";
  status: "active";
  created_at: string;
  updated_at: string;
}

function toFlashcard(row: FlashcardRow): Flashcard {
  return {
    id: row.id,
    userId: row.user_id,
    question: row.question,
    answer: row.answer,
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ListFlashcardsParams {
  search?: string;
  offset: number;
  limit: number;
}

/**
 * Builds a `flashcards` select carrying an exact count and the optional
 * search filter. `head: true` skips the row payload (count-only) — used to
 * recover `total` when the main page query lands past the last row.
 */
function buildFlashcardsListQuery(supabase: SupabaseClient, search: string | undefined, head: boolean) {
  let query = supabase.from("flashcards").select("*", { count: "exact", head });

  if (search) {
    // Escape SQL-LIKE wildcards (%, _) and PostgREST .or() mini-language
    // separators (, . ( )) — plus backslash itself — before interpolating
    // user input into the filter string.
    const escaped = search.replace(/[\\%_,.()]/g, (match) => `\\${match}`);
    query = query.or(`question.ilike.%${escaped}%,answer.ilike.%${escaped}%`);
  }

  return query;
}

/**
 * Returns exactly one page (`limit` rows from `offset`) plus `total`, the
 * exact row count matching the query across all pages — the numbered
 * pagination UI needs it to compute the last page. `{ count: "exact" }`
 * asks PostgREST for that aggregate; `count` is populated on the resolved
 * response even with `.overrideTypes()` in the chain (verified against
 * @supabase/postgrest-js 2.105.3).
 */
export async function listFlashcards(
  supabase: SupabaseClient,
  { search, offset, limit }: ListFlashcardsParams,
): Promise<FlashcardListResponse> {
  const { data, error, count, status } = await buildFlashcardsListQuery(supabase, search, false)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)
    .overrideTypes<FlashcardRow[], { merge: false }>();

  if (error) {
    // PostgREST answers PGRST103 / HTTP 416 when `offset` starts past the
    // last row (deep page after deletions, hand-edited URL). That's an
    // empty page, not a failure — re-query count-only so the caller still
    // gets an accurate `total` for clamping.
    if (status === 416 || error.code === "PGRST103") {
      const { count: total } = await buildFlashcardsListQuery(supabase, search, true);
      return { items: [], total: total ?? 0 };
    }
    throw error;
  }

  return {
    items: data.map(toFlashcard),
    total: count ?? 0,
  };
}

export async function createFlashcard(
  supabase: SupabaseClient,
  userId: string,
  input: FlashcardInput,
): Promise<Flashcard> {
  const { data, error } = await supabase
    .from("flashcards")
    .insert({
      user_id: userId,
      question: input.question,
      answer: input.answer,
      source: "manual",
      status: "active",
    })
    .select()
    .single()
    .overrideTypes<FlashcardRow, { merge: false }>();

  if (error) {
    throw error;
  }

  return toFlashcard(data);
}

/**
 * Sibling to `createFlashcard` that hardcodes `source: "ai"`. Kept as a
 * separate exported function (not a shared parameter) so the manual-create
 * API route can never accidentally pass through an AI source.
 */
export async function createAiFlashcard(
  supabase: SupabaseClient,
  userId: string,
  input: FlashcardInput,
): Promise<Flashcard> {
  const { data, error } = await supabase
    .from("flashcards")
    .insert({
      user_id: userId,
      question: input.question,
      answer: input.answer,
      source: "ai",
      status: "active",
    })
    .select()
    .single()
    .overrideTypes<FlashcardRow, { merge: false }>();

  if (error) {
    throw error;
  }

  return toFlashcard(data);
}

export async function updateFlashcard(
  supabase: SupabaseClient,
  id: string,
  input: FlashcardInput,
): Promise<Flashcard | null> {
  const { data, error } = await supabase
    .from("flashcards")
    .update({
      question: input.question,
      answer: input.answer,
    })
    .eq("id", id)
    .select()
    .overrideTypes<FlashcardRow[], { merge: false }>();

  if (error) {
    throw error;
  }

  if (data.length === 0) {
    return null;
  }

  return toFlashcard(data[0]);
}

export async function deleteFlashcard(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("flashcards")
    .delete()
    .eq("id", id)
    .select()
    .overrideTypes<FlashcardRow[], { merge: false }>();

  if (error) {
    throw error;
  }

  return data.length > 0;
}
