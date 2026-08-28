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
import { t } from "@/lib/i18n";

export const flashcardInputSchema: z.ZodType<FlashcardInput> = z.object({
  question: z.string().trim().min(1, t.validation.questionRequired).max(500, t.validation.questionTooLong),
  answer: z.string().trim().min(1, t.validation.answerRequired).max(1000, t.validation.answerTooLong),
});

export const flashcardListQuerySchema = z.object({
  search: z.string().trim().optional(),
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * Validates the pasted source text for `POST /api/flashcards/generate`.
 * The 5000-char cap is enforced here (server) and mirrored client-side by
 * `FlashcardGenerator`'s live counter — same client/server-in-lockstep
 * pattern as `flashcardInputSchema`.
 */
export const generateRequestSchema = z.object({
  sourceText: z.string().trim().min(1, t.validation.sourceTextRequired).max(5000, t.validation.sourceTextTooLong),
});
