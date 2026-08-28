/**
 * Read-only aggregate stats for the `/settings` page. Two queries against
 * the caller's RLS-scoped client:
 *   1. the full (small, per-user) flashcard list for source/date breakdowns,
 *   2. the per-card FSRS review state for the spaced-repetition figures.
 * Everything is derived from `flashcards` + `flashcard_review_state` — no
 * schema change. A flashcard with no `flashcard_review_state` row has never
 * been reviewed and is treated as due now.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AccountStats {
  total: number;
  aiCount: number;
  manualCount: number;
  addedLast7Days: number;
  reviewedCount: number;
  dueNow: number;
  /** ISO date of the soonest future review, or null if nothing is scheduled ahead. */
  nextDue: string | null;
  /** ISO date of the most recent review across all cards, or null if never reviewed. */
  lastReview: string | null;
  totalReps: number;
  totalLapses: number;
  learningCount: number;
  reviewCount: number;
  relearningCount: number;
}

interface FlashcardMetaRow {
  source: "ai" | "manual";
  created_at: string;
}

interface ReviewStateRow {
  state: number;
  due: string;
  reps: number;
  lapses: number;
  last_review: string | null;
}

export async function getAccountStats(supabase: SupabaseClient): Promise<AccountStats> {
  const [cardsRes, reviewRes] = await Promise.all([
    supabase.from("flashcards").select("source, created_at").overrideTypes<FlashcardMetaRow[], { merge: false }>(),
    supabase
      .from("flashcard_review_state")
      .select("state, due, reps, lapses, last_review")
      .overrideTypes<ReviewStateRow[], { merge: false }>(),
  ]);

  if (cardsRes.error) {
    throw cardsRes.error;
  }
  if (reviewRes.error) {
    throw reviewRes.error;
  }

  const cards = cardsRes.data;
  const reviews = reviewRes.data;

  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const total = cards.length;
  const aiCount = cards.filter((card) => card.source === "ai").length;
  const addedLast7Days = cards.filter((card) => new Date(card.created_at).getTime() >= weekAgo).length;

  const reviewedCount = reviews.length;
  const neverReviewedCount = Math.max(0, total - reviewedCount);
  const dueFromReviewed = reviews.filter((row) => new Date(row.due).getTime() <= now).length;

  const futureDue = reviews
    .map((row) => new Date(row.due).getTime())
    .filter((time) => time > now)
    .sort((a, b) => a - b);

  const lastReviewTimes = reviews
    .map((row) => (row.last_review ? new Date(row.last_review).getTime() : null))
    .filter((time): time is number => time !== null);

  return {
    total,
    aiCount,
    manualCount: total - aiCount,
    addedLast7Days,
    reviewedCount,
    dueNow: dueFromReviewed + neverReviewedCount,
    nextDue: futureDue.length > 0 ? new Date(futureDue[0]).toISOString() : null,
    lastReview: lastReviewTimes.length > 0 ? new Date(Math.max(...lastReviewTimes)).toISOString() : null,
    totalReps: reviews.reduce((sum, row) => sum + row.reps, 0),
    totalLapses: reviews.reduce((sum, row) => sum + row.lapses, 0),
    learningCount: reviews.filter((row) => row.state === 1).length,
    reviewCount: reviews.filter((row) => row.state === 2).length,
    relearningCount: reviews.filter((row) => row.state === 3).length,
  };
}
