/**
 * `PATCH` edits one flashcard; `DELETE` removes one, by `id` path param.
 *
 * Not-found vs not-owned are indistinguishable by design: both surface as
 * `404` (see Critical Implementation Details in the plan).
 */
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { jsonError, parseIdParam, withApiErrorHandling } from "@/lib/api-helpers";
import { flashcardInputSchema } from "@/lib/schemas/flashcard";
import { deleteFlashcard, updateFlashcard } from "@/lib/services/flashcards";

export const PATCH: APIRoute = withApiErrorHandling(async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Supabase is not configured", 500);
  }

  const user = context.locals.user;
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const id = parseIdParam(context.params.id);

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = flashcardInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const updated = await updateFlashcard(supabase, id, parsed.data);
  if (!updated) {
    return jsonError("Flashcard not found", 404);
  }

  return Response.json(updated);
});

export const DELETE: APIRoute = withApiErrorHandling(async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Supabase is not configured", 500);
  }

  const user = context.locals.user;
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const id = parseIdParam(context.params.id);

  const deleted = await deleteFlashcard(supabase, id);
  if (!deleted) {
    return jsonError("Flashcard not found", 404);
  }

  return new Response(null, { status: 204 });
});
