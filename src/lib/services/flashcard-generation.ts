/**
 * Owns the AI flashcard-generation prompt and the call to `complete()`.
 * Mirrors `openrouter.ts`'s own `{ data, error }` Result idiom so callers
 * use one error-handling pattern end-to-end — a parse/validation failure
 * from `parseGeneratedContent` is surfaced as a `type: "api"`
 * `OpenRouterClientError`, not a thrown exception, since the HTTP layer
 * already succeeded and `openrouter.ts` has no way to know the content was
 * semantically invalid.
 */
import { complete, type OpenRouterClientError } from "@/lib/openrouter";
import { parseGeneratedContent, type ParsedGeneration } from "@/lib/services/flashcard-generation-parse";

const SYSTEM_PROMPT = `You are a flashcard generator for a spaced-repetition study app. Given source text
pasted by a language learner, produce concise question-and-answer flashcard pairs
that test recall of the text's key facts, vocabulary, or concepts. Respond with
ONLY a JSON array of objects, each with exactly two string fields: "question" and
"answer". Do not include markdown formatting, code fences, or any text outside the
JSON array. Each question must be 500 characters or fewer; each answer must be
500 characters or fewer. Produce between 3 and 5 flashcards, choosing a count
proportional to how much distinct, testable content the text contains.`;

function apiError(message: string): OpenRouterClientError {
  return { type: "api", status: 200, message };
}

export interface GenerateFlashcardProposalsResult {
  data: ParsedGeneration | null;
  error: OpenRouterClientError | null;
}

export async function generateFlashcardProposals(sourceText: string): Promise<GenerateFlashcardProposalsResult> {
  const { data, error } = await complete({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: sourceText },
    ],
    temperature: 0.4,
    maxTokens: 3000,
  });

  if (error || !data) {
    return { data: null, error: error ?? apiError("OpenRouter returned no content") };
  }

  const { data: parsedData, error: parseError } = parseGeneratedContent(data.content);
  if (parseError) {
    return { data: null, error: apiError(parseError) };
  }

  return { data: parsedData, error: null };
}
