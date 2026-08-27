/**
 * Selects the day's due-card queue and persists a submitted rating,
 * mirroring `flashcards.ts`'s conventions: a thin wrapper over the
 * request-scoped Supabase client, raw `PostgrestError` propagated, no
 * app-level ownership filtering on reads — RLS is the boundary.
 *
 * `getReviewSession` runs two plain selects (`flashcards`,
 * `flashcard_review_state`) and stitches the "due" queue together in
 * application code, rather than a single LEFT JOIN via PostgREST's
 * embedded-resource syntax. PostgREST's embedded-resource filters don't
 * cleanly express "row is null OR due <= now" across a to-many embed, and
 * this couldn't be verified against a live Postgres instance in this
 * environment — see the plan's Critical Implementation Details: an
 * accidentally INNER-JOIN-shaped query would silently exclude every
 * never-reviewed flashcard from every session forever, which is worse than
 * the two extra round-trips a small deck costs here (PRD
 * target_scale.data_volume: small).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api-helpers";
import { applyRating, fromCard, previewAll, stateLabel, toCard, type ReviewStateRow } from "@/lib/fsrs/scheduler";
import type { Flashcard, ReviewCard, ReviewRating, ReviewSessionResponse, SubmitReviewResponse } from "@/types";

const DAILY_REVIEW_LIMIT = 20;

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

export async function getReviewSession(supabase: SupabaseClient, userId: string): Promise<ReviewSessionResponse> {
  const now = new Date();

  const [flashcardsResult, stateResult, hasAnyResult] = await Promise.all([
    supabase.from("flashcards").select("*").overrideTypes<FlashcardRow[], { merge: false }>(),
    supabase.from("flashcard_review_state").select("*").overrideTypes<ReviewStateRow[], { merge: false }>(),
    supabase.from("flashcards").select("id").eq("user_id", userId).limit(1),
  ]);

  if (flashcardsResult.error) {
    throw flashcardsResult.error;
  }
  if (stateResult.error) {
    throw stateResult.error;
  }
  if (hasAnyResult.error) {
    throw hasAnyResult.error;
  }

  const stateByFlashcardId = new Map(stateResult.data.map((row) => [row.flashcard_id, row]));

  // "due" = state row absent (never reviewed, due now) OR its due <= now.
  // Sort due-dated cards soonest-first (most overdue among them), then
  // never-reviewed cards fill any remaining slots under the cap — mirrors
  // SQL's `order by due asc nulls last`.
  const dueEntries = flashcardsResult.data
    .map((flashcard) => ({ flashcard, state: stateByFlashcardId.get(flashcard.id) ?? null }))
    .filter(({ state }) => state === null || new Date(state.due) <= now)
    .sort((a, b) => {
      if (a.state === null && b.state === null) {
        return 0;
      }
      if (a.state === null) {
        return 1;
      }
      if (b.state === null) {
        return -1;
      }
      return new Date(a.state.due).getTime() - new Date(b.state.due).getTime();
    })
    .slice(0, DAILY_REVIEW_LIMIT);

  const items: ReviewCard[] = dueEntries.map(({ flashcard, state }) => ({
    flashcard: toFlashcard(flashcard),
    previews: previewAll(toCard(state), now),
  }));

  return {
    items,
    hasAnyFlashcards: hasAnyResult.data.length > 0,
  };
}

export async function submitReview(
  supabase: SupabaseClient,
  userId: string,
  flashcardId: string,
  rating: ReviewRating,
): Promise<SubmitReviewResponse> {
  // Ownership check is load-bearing, not incidental: flashcard_review_state's
  // RLS only validates the *new row's own* user_id on insert, never what
  // flashcard_id points to. Without this pre-check a caller could create a
  // review-state row against another user's flashcard (see the plan's
  // Critical Implementation Details).
  const { data: owned, error: ownedError } = await supabase.from("flashcards").select("id").eq("id", flashcardId);
  if (ownedError) {
    throw ownedError;
  }
  if (owned.length === 0) {
    throw new ApiError("Not found", 404);
  }

  const { data: existing, error: existingError } = await supabase
    .from("flashcard_review_state")
    .select("*")
    .eq("flashcard_id", flashcardId)
    .maybeSingle()
    .overrideTypes<ReviewStateRow, { merge: false }>();
  if (existingError) {
    throw existingError;
  }

  const now = new Date();
  const nextCard = applyRating(toCard(existing), now, rating);
  const row = fromCard(flashcardId, userId, nextCard);

  const { error: upsertError } = await supabase
    .from("flashcard_review_state")
    .upsert(row, { onConflict: "flashcard_id" });
  if (upsertError) {
    throw upsertError;
  }

  return {
    dueAt: row.due,
    state: stateLabel(nextCard.state),
  };
}
