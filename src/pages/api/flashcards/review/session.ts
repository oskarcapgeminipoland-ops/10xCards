/**
 * `GET /api/flashcards/review/session` — returns the day's due-card queue
 * plus rating previews for UI display only. Same handler shape as every
 * existing `/api/flashcards*` route.
 *
 * Intentionally RPC-style (not resource-oriented) under `/api/flashcards/*`
 * — see the plan's Implementation Approach.
 */
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { jsonError, withApiErrorHandling } from "@/lib/api-helpers";
import { getReviewSession } from "@/lib/services/flashcard-reviews";
import type { ReviewSessionResponse } from "@/types";

export const GET: APIRoute = withApiErrorHandling(async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Supabase is not configured", 500);
  }

  const user = context.locals.user;
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const result = await getReviewSession(supabase, user.id);
  return Response.json(result satisfies ReviewSessionResponse);
});
