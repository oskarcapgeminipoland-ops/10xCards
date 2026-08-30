/**
 * Minimal HTTP stub for the OpenRouter chat-completions API, used by E2E so the
 * flashcard-generation flow runs end-to-end (real auth, real /api routes, real
 * DB) with only the external LLM call faked at the HTTP layer.
 *
 * The dev server reaches this via OPENROUTER_BASE_URL (see playwright.config.ts).
 * The spec picks a scenario by embedding a marker in the pasted source text —
 * no extra wiring between test and stub:
 *
 *   (default)         → 200, a valid 3-card JSON array
 *   "MOCK_RATE_LIMIT" → 429, OpenRouter-shaped error body
 *   "MOCK_PROSE"      → 200, valid cards wrapped in prose + a ```json fence
 *   "MOCK_EMPTY"      → 200, an empty array (pipeline drops everything)
 *
 * For test isolation the spec also passes a unique tag as `E2E_TAG:<value>` in
 * the source text; the stub prefixes every generated question with `[<value>] `
 * so accepted rows are unique per run and cleanup can target them precisely.
 *
 * Run: node e2e/support/openrouter-mock.mjs   (OPENROUTER_MOCK_PORT env, default 4399)
 */
import { createServer } from "node:http";

const PORT = Number(process.env.OPENROUTER_MOCK_PORT ?? 4399);

const BASE_CARDS = [
  { question: "What is spaced repetition?", answer: "A review schedule that widens intervals as recall succeeds." },
  { question: "What does FSRS stand for?", answer: "Free Spaced Repetition Scheduler." },
  { question: "What is an SRS 'due' card?", answer: "A card whose scheduled review time is now or in the past." },
];

/** Tag every question so a run's accepted rows are unique and cleanup is precise. */
function taggedCards(tag) {
  if (!tag) return BASE_CARDS;
  return BASE_CARDS.map((c) => ({ ...c, question: `[${tag}] ${c.question}` }));
}

/** Build an OpenRouter success body whose message content is `content`. */
function completion(content) {
  return {
    id: "gen-mock-1",
    model: "openrouter/mock",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  };
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

const server = createServer((req, res) => {
  if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
    send(res, 404, { error: { message: `no mock route for ${req.method} ${req.url}` } });
    return;
  }

  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    let userText = "";
    try {
      const body = JSON.parse(raw);
      userText = (body.messages ?? []).map((m) => m.content).join("\n");
    } catch {
      // fall through with empty userText → default scenario
    }

    const tag = userText.match(/E2E_TAG:([A-Za-z0-9_-]+)/)?.[1] ?? "";

    if (userText.includes("MOCK_RATE_LIMIT")) {
      send(res, 429, { error: { message: "Rate limit exceeded: free-tier models are busy", code: 429 } });
      return;
    }
    if (userText.includes("MOCK_EMPTY")) {
      send(res, 200, completion("[]"));
      return;
    }
    if (userText.includes("MOCK_PROSE")) {
      const wrapped = "Here are your flashcards:\n\n```json\n" + JSON.stringify(taggedCards(tag)) + "\n```\n\nEnjoy!";
      send(res, 200, completion(wrapped));
      return;
    }
    send(res, 200, completion(JSON.stringify(taggedCards(tag))));
  });
});

server.listen(PORT, "127.0.0.1", () => {
  // Playwright's webServer waits on this port; the log line aids local debugging.
  console.log(`openrouter-mock listening on http://127.0.0.1:${PORT}`);
});
