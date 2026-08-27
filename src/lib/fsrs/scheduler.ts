/**
 * The single place `ts-fsrs` is imported. Translates between the DB row
 * shape (or its absence, for never-reviewed cards) and the library's `Card`
 * type, and exposes preview/apply operations over it.
 *
 * Must not import `astro:env/server` or the Supabase client, directly or
 * transitively — this is what keeps it unit-testable under plain `vitest`
 * without spinning up Astro's runtime (see the plan's Critical
 * Implementation Details, mirroring the `flashcard-generation-parse.ts`
 * precedent from S-01).
 *
 * `enable_short_term: false` is a deliberate deviation from the plan's
 * originally-researched `fsrs({ request_retention: 0.9 })` config: the
 * installed `ts-fsrs@5.4.1`'s `Card` carries a `learning_steps` counter the
 * plan's research missed, which only matters when short-term (sub-day,
 * in-minutes) scheduling is enabled. This app's data model (the
 * `flashcard_review_state` migration has no `learning_steps` column) and UI
 * (day-granularity `intervalDays`, once-daily session cadence) both assume
 * day-granularity scheduling, so short-term scheduling is turned off —
 * every outcome then lands on a whole-day `scheduled_days` and
 * `learning_steps` stays permanently `0`, matching the DB row shape
 * exactly. One consequence worth flagging: with short-term scheduling off,
 * `state` never actually reaches `Relearning` — a lapse (`Again`) on a
 * `Review`-state card stays in `Review`, just with sharply reduced
 * `stability`. `Relearning` is reachable in principle (the DB CHECK still
 * allows it) but unreachable in practice under this config.
 */
import { createEmptyCard, fsrs, Rating, type Card, type Grade } from "ts-fsrs";
import type { ReviewIntervalPreview, ReviewRating } from "@/types";

const scheduler = fsrs({ request_retention: 0.9, enable_short_term: false });

/** The `flashcard_review_state` row shape, snake_case, as read from/written to Supabase. */
export interface ReviewStateRow {
  flashcard_id: string;
  user_id: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: 1 | 2 | 3;
  last_review: string | null;
}

/** Builds a `Card` from a DB row, or a fresh one when `row` is `null` (never reviewed). */
export function toCard(row: ReviewStateRow | null): Card {
  if (row === null) {
    return createEmptyCard();
  }
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: 0,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

/** Inverse of `toCard` — builds the upsert payload for `flashcard_review_state`. */
export function fromCard(flashcardId: string, userId: string, card: Card): ReviewStateRow {
  return {
    flashcard_id: flashcardId,
    user_id: userId,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- see toCard's matching disable comment.
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as 1 | 2 | 3,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

const RATINGS: readonly Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

/** Previews all 4 rating outcomes for `card` without mutating it. */
export function previewAll(card: Card, now: Date): ReviewIntervalPreview[] {
  const record = scheduler.repeat(card, now);
  return RATINGS.map((rating) => {
    const outcome = record[rating].card;
    return {
      rating,
      dueAt: outcome.due.toISOString(),
      intervalDays: outcome.scheduled_days,
    };
  });
}

/** Applies `rating` to `card`, returning the new scheduled `Card`. */
export function applyRating(card: Card, now: Date, rating: ReviewRating): Card {
  return scheduler.next(card, now, rating).card;
}
