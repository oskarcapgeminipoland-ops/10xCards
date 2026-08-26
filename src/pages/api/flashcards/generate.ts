/**
 * `POST /api/flashcards/generate` — validates the pasted source text, calls
 * `generateFlashcardProposals`, and maps each `OpenRouterClientError`
 * variant to a specific status + message so the UI can show the user
 * something actionable instead of a generic failure.
 *
 * Intentionally RPC-style (not resource-oriented like `index.ts`/`[id].ts`)
 * — see the plan's Implementation Approach.
 */
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { jsonError, withApiErrorHandling } from "@/lib/api-helpers";
import { generateRequestSchema } from "@/lib/schemas/flashcard";
import { generateFlashcardProposals } from "@/lib/services/flashcard-generation";
import type { OpenRouterClientError } from "@/lib/openrouter";
import type { GenerateFlashcardsResponse } from "@/types";

function mapErrorToResponse(error: OpenRouterClientError): Response {
  switch (error.type) {
    case "config":
      return jsonError("AI generation is not configured", 500);
    case "timeout":
      return jsonError("Generation took too long — please try again", 504);
    case "network":
      return jsonError("Couldn't reach the AI provider — please try again", 502);
    case "api":
      if (error.status === 429) {
        return jsonError("The free AI tier is rate-limited right now — please try again in a moment", 429);
      }
      return jsonError(error.message, 502);
  }
}

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

  const parsed = generateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { data, error } = await generateFlashcardProposals(parsed.data.sourceText);
  if (error || !data) {
    return mapErrorToResponse(error ?? { type: "api", status: 200, message: "AI generation returned no result" });
  }

  const response: GenerateFlashcardsResponse = { proposals: data.proposals, droppedCount: data.droppedCount };
  return Response.json(response, { status: 200 });
});
