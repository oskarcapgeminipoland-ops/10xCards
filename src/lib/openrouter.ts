import { OPENROUTER_API_KEY, OPENROUTER_BASE_URL } from "astro:env/server";

/** Real OpenRouter chat-completions endpoint. `OPENROUTER_BASE_URL` overrides the
 * origin (scheme + host [+ port]) in E2E so requests hit a local HTTP stub; the
 * `/api/v1/chat/completions` path is always appended. */
const OPENROUTER_ENDPOINT = OPENROUTER_BASE_URL
  ? `${OPENROUTER_BASE_URL.replace(/\/$/, "")}/api/v1/chat/completions`
  : "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 30000;

/** Default model: OpenRouter's own free-tier auto-router — always $0, fails over across
 * whatever free models are currently healthy. Swap by passing `model` per call. */
export const DEFAULT_MODEL = "openrouter/free";

export type MessageRole = "system" | "user" | "assistant";

export interface Message {
  role: MessageRole;
  content: string;
}

export type OpenRouterClientError =
  | { type: "config"; message: string }
  | { type: "timeout"; message: string }
  | { type: "network"; message: string }
  | { type: "api"; status: number; message: string };

export interface CompleteParams {
  messages: Message[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface CompleteData {
  content: string;
  model: string;
}

export interface CompleteResult {
  data: CompleteData | null;
  error: OpenRouterClientError | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Array.isArray's built-in type predicate narrows to `any[]`, which leaks `any` into
// anything destructured from it. This re-declares the predicate as `unknown[]` instead.
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Extract `error.message` from an OpenRouter error body, falling back when absent/malformed. */
function extractApiErrorMessage(body: unknown, fallback: string): string {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === "string") {
    return body.error.message;
  }
  return fallback;
}

/** Extract `choices[0].message.content` (+ echoed `model`) from a success body, without
 * trusting the external response shape. */
function extractCompletion(body: unknown, fallbackModel: string): CompleteData | null {
  if (!isRecord(body) || !isUnknownArray(body.choices) || body.choices.length === 0) {
    return null;
  }
  const [first] = body.choices;
  if (!isRecord(first) || !isRecord(first.message)) {
    return null;
  }
  const { content } = first.message;
  if (typeof content !== "string") {
    return null;
  }
  return { content, model: typeof body.model === "string" ? body.model : fallbackModel };
}

/**
 * Generic OpenRouter chat-completion wrapper. Never throws — mirrors this project's
 * existing "typed, non-throwing client" pattern (see `supabase.ts`) and the auth routes'
 * `{ data, error }` idiom.
 */
export async function complete(params: CompleteParams): Promise<CompleteResult> {
  if (!OPENROUTER_API_KEY) {
    return { data: null, error: { type: "config", message: "OPENROUTER_API_KEY is not configured." } };
  }

  const { messages, model = DEFAULT_MODEL, temperature, maxTokens, timeoutMs = DEFAULT_TIMEOUT_MS } = params;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        // OpenRouter's app-identification convention — affects only their own
        // analytics/leaderboards, not request success.
        "HTTP-Referer": "https://github.com/oskarcapgeminipoland-ops/10xCards",
        "X-Title": "10xCards",
      },
      body: JSON.stringify({
        model,
        messages,
        ...(temperature !== undefined ? { temperature } : {}),
        ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    // Classify before anything else: an aborted request throws a DOMException named
    // "AbortError" — that must be told apart from a genuine network failure (DNS,
    // connection refused, etc.), which throws too but isn't a timeout.
    if (err instanceof DOMException && err.name === "AbortError") {
      return { data: null, error: { type: "timeout", message: `OpenRouter request timed out after ${timeoutMs}ms.` } };
    }
    return {
      data: null,
      error: { type: "network", message: err instanceof Error ? err.message : "Network request failed." },
    };
  } finally {
    clearTimeout(timer);
  }

  // OpenRouter returns a JSON body on both success and failure — parse once, then branch.
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    return {
      data: null,
      error: { type: "api", status: response.status, message: extractApiErrorMessage(body, response.statusText) },
    };
  }

  const data = extractCompletion(body, model);
  if (!data) {
    return {
      data: null,
      error: { type: "api", status: response.status, message: "OpenRouter response did not include message content." },
    };
  }

  return { data, error: null };
}
