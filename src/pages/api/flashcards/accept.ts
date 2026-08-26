/**
 * `POST /api/flashcards/accept` — persists one accepted (possibly edited)
 * proposal as an AI-sourced flashcard. Reuses `flashcardInputSchema` —
 * identical validation to manual create, since the shape is identical.
 *
 * Intentionally a separate RPC-style endpoint (not the manual-create
 * `index.ts` POST) so `source: 'ai'` can never be spoofed through the
 * manual-create path — see the plan's Implementation Approach.
 */
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { jsonError, withApiErrorHandling } from "@/lib/api-helpers";
import { flashcardInputSchema } from "@/lib/schemas/flashcard";
import { createAiFlashcard } from "@/lib/services/flashcards";

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

  const created = await createAiFlashcard(supabase, user.id, parsed.data);
  return Response.json(created, { status: 201 });
});
