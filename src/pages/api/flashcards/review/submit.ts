/**
 * `POST /api/flashcards/review/submit` — server-authoritative recompute:
 * always re-fetches the current review state and recomputes via
 * `applyRating` itself, never trusting a client-echoed preview or `card`
 * payload (see the plan's Critical Implementation Details). The request
 * body only ever carries `flashcardId` + `rating`.
 *
 * A `flashcardId` that doesn't resolve to a row owned by the caller
 * surfaces as `404` — via `submitReview`'s own explicit ownership check,
 * not RLS alone — matching the not-found-vs-not-owned convention in
 * `[id].ts`.
 */
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { jsonError, withApiErrorHandling } from "@/lib/api-helpers";
import { submitReviewSchema } from "@/lib/schemas/review";
import { submitReview } from "@/lib/services/flashcard-reviews";
import type { SubmitReviewResponse } from "@/types";

export const POST: APIRoute = withApiErrorHandling(async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Supabase is not configured", 500);
  }

  const user = context.locals.user;
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = submitReviewSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const result = await submitReview(supabase, user.id, parsed.data.flashcardId, parsed.data.rating);
  return Response.json(result satisfies SubmitReviewResponse);
});
