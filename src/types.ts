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
  /** Offset to request next, or `null` when there are no more pages. */
  nextOffset: number | null;
}

/** The one error shape every `/api/flashcards*` route returns on non-2xx. */
export interface ApiErrorResponse {
  error: string;
}
