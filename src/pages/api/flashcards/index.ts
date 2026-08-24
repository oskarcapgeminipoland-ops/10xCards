/**
 * `GET` returns a page of the caller's flashcards (search + pagination);
 * `POST` creates one. See Critical Implementation Details in the plan for
 * the auth-guard / RLS division of responsibility.
 */
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { jsonError, withApiErrorHandling } from "@/lib/api-helpers";
import { flashcardInputSchema, flashcardListQuerySchema } from "@/lib/schemas/flashcard";
import { createFlashcard, listFlashcards } from "@/lib/services/flashcards";

export const GET: APIRoute = withApiErrorHandling(async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Supabase is not configured", 500);
  }

  const user = context.locals.user;
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const parsed = flashcardListQuerySchema.safeParse(Object.fromEntries(context.url.searchParams));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid query parameters", 400);
  }

  const result = await listFlashcards(supabase, parsed.data);
  return Response.json(result);
});

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

  const parsed = flashcardInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const created = await createFlashcard(supabase, user.id, parsed.data);
  return Response.json(created, { status: 201 });
});
