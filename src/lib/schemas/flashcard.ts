/**
 * Zod schemas for `/api/flashcards*`.
 *
 * Mirrors the DB CHECK constraints in `flashcards`
 * (see `supabase/migrations/20260823134802_create_flashcards_table.sql`)
 * so the question/answer limits can never drift between client and server —
 * reused by both the API routes and the client-side live-validation form.
 */
import { z } from "zod";
import type { FlashcardInput } from "@/types";

export const flashcardInputSchema: z.ZodType<FlashcardInput> = z.object({
  question: z.string().trim().min(1, "Question is required").max(500, "Question must be 500 characters or fewer"),
  answer: z.string().trim().min(1, "Answer is required").max(1000, "Answer must be 1000 characters or fewer"),
});

export const flashcardListQuerySchema = z.object({
  search: z.string().trim().optional(),
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
