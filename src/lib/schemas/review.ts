/**
 * Zod schema for `POST /api/flashcards/review/submit`.
 *
 * Mirrors `SubmitReviewRequest` (`src/types.ts`) — `rating` is restricted to
 * `ts-fsrs`'s `Rating.Again..Easy` (1-4); `Rating.Manual` (0) is never
 * exposed to the client.
 */
import { z } from "zod";
import type { SubmitReviewRequest } from "@/types";

export const submitReviewSchema: z.ZodType<SubmitReviewRequest> = z.object({
  flashcardId: z.uuid(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});
