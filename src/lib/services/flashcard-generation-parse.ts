/**
 * Pure parse/validate/cap pipeline over a raw AI completion string — split
 * out from `flashcard-generation.ts` so it has no dependency on
 * `openrouter.ts` (and therefore no `astro:env/server` import), making it
 * testable in isolation without an Astro runtime. See the plan's Testing
 * Strategy note: "stripCodeFence and the per-item validation/cap logic ...
 * are the highest-value first targets (pure functions, no I/O)".
 */
import { flashcardInputSchema } from "@/lib/schemas/flashcard";
import type { FlashcardInput } from "@/types";

const MAX_PROPOSALS = 5;

/**
 * LLMs served through OpenRouter's free-tier router commonly wrap JSON
 * output in markdown code fences even when told not to — strip one before
 * `JSON.parse`.
 */
export function stripCodeFence(content: string): string {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(content.trim());
  return match ? match[1] : content.trim();
}

export interface ParsedGeneration {
  proposals: FlashcardInput[];
  droppedCount: number;
}

export interface ParseGeneratedContentResult {
  data: ParsedGeneration | null;
  error: string | null;
}

/**
 * Strips a code fence if present, parses JSON, validates it's an array,
 * drops any item that fails `flashcardInputSchema`, then caps the surviving
 * list to `MAX_PROPOSALS`. Never throws — a parse/shape failure comes back
 * as `error: string`, letting the caller decide how to wrap it.
 */
export function parseGeneratedContent(content: string): ParseGeneratedContentResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(content));
  } catch {
    return { data: null, error: "AI response was not valid JSON" };
  }

  if (!Array.isArray(parsed)) {
    return { data: null, error: "AI response was not a JSON array" };
  }

  const proposals: FlashcardInput[] = [];
  let droppedCount = 0;
  for (const item of parsed) {
    const result = flashcardInputSchema.safeParse(item);
    if (result.success) {
      proposals.push(result.data);
    } else {
      droppedCount += 1;
    }
  }

  return {
    data: { proposals: proposals.slice(0, MAX_PROPOSALS), droppedCount },
    error: null,
  };
}
