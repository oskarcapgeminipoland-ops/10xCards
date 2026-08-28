/**
 * Shared entity and DTO types for 10xCards.
 *
 * Field names are camelCase per TypeScript convention; mapping to/from the
 * database's snake_case columns is the responsibility of the query code
 * that reads/writes these rows, not these type definitions.
 */

/**
 * A flashcard row, mirroring `public.flashcards`
 * (see `supabase/migrations/20260823134802_create_flashcards_table.sql`).
 */
export interface Flashcard {
  id: string;
  userId: string;
  question: string;
  answer: string;
  source: "ai" | "manual";
  status: "active";
  createdAt: string;
  updatedAt: string;
}

/**
 * Shared create/edit input shape for `/api/flashcards*`.
 *
 * `source`/`status` are never client-supplied: the server sets
 * `source: 'manual'` on create, and update never touches `source`/`status`.
 */
export interface FlashcardInput {
  question: string;
  answer: string;
}

/** Response body for `GET /api/flashcards`. */
export interface FlashcardListResponse {
  items: Flashcard[];
  /** Total number of rows matching the query, across all pages. */
  total: number;
}

/** The one error shape every `/api/flashcards*` route returns on non-2xx. */
export interface ApiErrorResponse {
  error: string;
}

/** Request body for `POST /api/flashcards/generate`. */
export interface GenerateFlashcardsRequest {
  sourceText: string;
}

/** Response body for `POST /api/flashcards/generate`. */
export interface GenerateFlashcardsResponse {
  proposals: FlashcardInput[];
  droppedCount: number;
}

/**
 * A user's rating of how well they recalled a flashcard, feeding the FSRS
 * scheduler. Mirrors `ts-fsrs`'s `Rating.Again..Easy` (1-4); `Rating.Manual`
 * (0) is an internal library value never exposed to the UI.
 */
export type ReviewRating = 1 | 2 | 3 | 4;

/** One rating's predicted outcome, shown next to its button in the UI. */
export interface ReviewIntervalPreview {
  rating: ReviewRating;
  dueAt: string;
  intervalDays: number;
}

/** One due flashcard plus its 4 rating previews, as returned by the session queue. */
export interface ReviewCard {
  flashcard: Flashcard;
  previews: ReviewIntervalPreview[];
}

/**
 * Response body for `GET /api/flashcards/review/session`.
 *
 * `hasAnyFlashcards` distinguishes "zero flashcards at all" from "zero due
 * today" so the UI never needs a second fetch to pick the right empty state.
 */
export interface ReviewSessionResponse {
  items: ReviewCard[];
  hasAnyFlashcards: boolean;
}

/** Request body for `POST /api/flashcards/review/submit`. */
export interface SubmitReviewRequest {
  flashcardId: string;
  rating: ReviewRating;
}

/** Response body for `POST /api/flashcards/review/submit`. */
export interface SubmitReviewResponse {
  dueAt: string;
  state: "learning" | "review" | "relearning";
}
