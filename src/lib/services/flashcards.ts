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

export async function listFlashcards(
  supabase: SupabaseClient,
  { search, offset, limit }: ListFlashcardsParams,
): Promise<FlashcardListResponse> {
  let query = supabase.from("flashcards").select("*");

  if (search) {
    // Escape SQL-LIKE wildcards (%, _) and PostgREST .or() mini-language
    // separators (, . ( )) — plus backslash itself — before interpolating
    // user input into the filter string.
    const escaped = search.replace(/[\\%_,.()]/g, (match) => `\\${match}`);
    query = query.or(`question.ilike.%${escaped}%,answer.ilike.%${escaped}%`);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit)
    .overrideTypes<FlashcardRow[], { merge: false }>();
  if (error) {
    throw error;
  }

  const hasNextPage = data.length > limit;
  const items = (hasNextPage ? data.slice(0, limit) : data).map(toFlashcard);

  return {
    items,
    nextOffset: hasNextPage ? offset + limit : null,
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
