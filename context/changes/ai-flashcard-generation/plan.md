# AI Flashcard Generation Implementation Plan

## Overview

Implements S-01, the roadmap's north-star slice: a logged-in user pastes source text, requests AI-generated flashcard proposals, reviews each one (accept / edit-then-accept / reject), and accepted flashcards immediately appear in their existing `/flashcards` deck. This is the first slice to actually call the OpenRouter client built in F-02 and the first to write `source: 'ai'` rows into the `flashcards` table defined in F-01.

## Current State Analysis

- **Data**: `public.flashcards` (migration `20260823134802_create_flashcards_table.sql`) already has `source text check (source in ('ai', 'manual'))` and a single reserved `status` value `'active'`. No staging/proposal table exists — F-01's plan explicitly deferred that design to this slice, and this plan does not add one: proposals live only in client-side React state until accepted.
- **AI client**: `src/lib/openrouter.ts` exports a working, non-throwing `complete({ messages, model?, temperature?, maxTokens?, timeoutMs? }): Promise<{ data: {content, model} | null; error: OpenRouterClientError | null }>` wrapper around OpenRouter's chat-completions endpoint (`DEFAULT_MODEL = "openrouter/free"`, `DEFAULT_TIMEOUT_MS = 30000`). It is single-shot and non-streaming by design — F-02's plan explicitly punted streaming to this slice, and this plan does not add it (cosmetic progress UX was chosen instead).
- **CRUD precedent (S-03)**: `src/lib/services/flashcards.ts` (`createFlashcard`, `listFlashcards`, `updateFlashcard`, `deleteFlashcard`), `src/lib/schemas/flashcard.ts` (`flashcardInputSchema`: question ≤500 chars, answer ≤1000 chars, non-empty after trim), `src/lib/api-helpers.ts` (`withApiErrorHandling`, `jsonError`, `ApiError`, `parseIdParam`), and `src/pages/api/flashcards/{index,[id]}.ts` establish the JSON-API and auth-guard conventions this slice follows exactly. `src/components/flashcards/{FlashcardDeck,FlashcardForm,DeleteFlashcardDialog}.tsx` establish the UI conventions (shadcn `new-york` primitives, Sonner toasts, `apiRequest<T>` fetch helper, live zod validation with character counters).
- **Routing**: `src/middleware.ts:4` protects any path starting with `/flashcards` (prefix match via `startsWith`), so a new `/flashcards/generate` page is automatically protected with no middleware change. API routes are not covered by this prefix (`/api/flashcards/...` doesn't start with `/flashcards`) and rely on the existing explicit `context.locals.user` guard, same as `index.ts`/`[id].ts`.

## Desired End State

A logged-in user on `/flashcards` clicks "Generate with AI" and lands on `/flashcards/generate`. They paste source text (≤5000 chars, live counter) and click Generate. While the request is in flight they see a spinner, an elapsed-time counter, and rotating status text — never a blank screen. On success they see 3–5 proposal cards, each with Accept / Edit / Reject. Edit opens the existing `FlashcardForm` pre-filled, saving changes locally (not yet persisted). Accept persists the (possibly edited) card immediately with `source: 'ai'` and removes it from the review list; it's now visible in `/flashcards` like any other card. Reject removes it from the list with no server call. A "Generate again" button re-runs generation over the same text, warning first if any proposals are still unreviewed. Any failure (config/timeout/network/API, including a 429 rate-limit) shows a specific message with a manual retry button.

### Key Discoveries:

- `src/middleware.ts:4,18` — prefix-match protection means the new page needs zero middleware changes.
- `src/lib/schemas/flashcard.ts:12-16` — `flashcardInputSchema` is reusable as-is both for validating each AI-generated proposal and for the accept-endpoint body, keeping DB/AI/client limits in lockstep exactly as S-03 did for manual entry.
- Astro resolves static route files ahead of dynamic segments, so `src/pages/api/flashcards/generate.ts` and `accept.ts` will not be captured by the existing `[id].ts` dynamic route.

## What We're NOT Doing

- No DB migration — `source: 'ai'` already exists; no staging table, no new `status` value.
- No generation-event/metrics log — the 75%-acceptance criterion is not measured by this slice (explicitly deferred; rejected proposals leave no trace).
- No SSE/token streaming — one non-streaming `complete()` call per generation, cosmetic progress UX only.
- No user-configurable proposal count — the model picks a count within a 3–5 bound (deliberately conservative; see the note in Critical Implementation Details — expected to be raised once real output quality is observed).
- No chunking of long source text — a hard 5000-character client+server cap instead.
- No bulk "accept all" action — per-card review only.
- No automatic retry/backoff on generation failure — manual "Try again" button only.
- No merge-on-regenerate — "Generate again" fully replaces the review list (with a confirm if anything is still pending).
- No new shadcn/ui primitives — `Textarea`, `Dialog`, `Button`, `Card`, `Skeleton`, `AlertDialog` are all already installed from S-03.
- No test runner introduction — verification follows the S-03 precedent (`npm run lint` + `npm run build` + manual walkthrough); no automated tests exist repo-wide.

## Implementation Approach

Three vertical phases, mirroring the schema → business logic → API → clients convention: (1) the AI-calling service and validation, since there's no schema to change; (2) thin API routes over that service, following the `withApiErrorHandling` pattern exactly; (3) the UI, reusing `FlashcardForm` for edit-before-accept and the established dialog/toast/character-counter idioms from S-03.

`POST /api/flashcards/generate` and `/accept` are intentionally RPC-style action endpoints rather than following `index.ts`/`[id].ts`'s resource-oriented REST convention — a deliberate choice to keep `source: 'ai'` from ever being spoofable through the manual-create path, not a pattern-consistency oversight.

## Critical Implementation Details

**Prompt & response-parsing contract.** LLMs served through OpenRouter's free-tier router commonly wrap JSON output in markdown code fences even when told not to — the parser must strip a fence before `JSON.parse`, and must treat a parse failure or non-array result as a soft error (return it as `data: null, error: {type: "api", ...}`) rather than throwing, since the HTTP layer already succeeded and `openrouter.ts` has no way to know the content was semantically invalid. Use exactly this prompt (its wording — JSON-only, no markdown, explicit field names, explicit count bound — is what the parser below depends on):

```
SYSTEM:
You are a flashcard generator for a spaced-repetition study app. Given source text
pasted by a language learner, produce concise question-and-answer flashcard pairs
that test recall of the text's key facts, vocabulary, or concepts. Respond with
ONLY a JSON array of objects, each with exactly two string fields: "question" and
"answer". Do not include markdown formatting, code fences, or any text outside the
JSON array. Each question must be 500 characters or fewer; each answer must be
500 characters or fewer. Produce between 3 and 5 flashcards, choosing a count
proportional to how much distinct, testable content the text contains.

USER:
<the pasted source text, already capped at 5000 characters>
```

```ts
function stripCodeFence(content: string): string {
  const match = content.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return match ? match[1] : content.trim();
}
```

**Note on the 3–5 / 500-char bound**: this is deliberately conservative — narrowed during plan review (from an initial 3–15 proposals / 500-question / 1000-answer bound) specifically to keep the worst-case response comfortably inside the `maxTokens: 3000` budget without needing truncation-recovery code. The DB's own limits remain question ≤500 / answer ≤1000 (unchanged, still enforced by `flashcardInputSchema` for every flashcard including manual ones) — this prompt-level bound is a tighter, AI-specific instruction layered on top. Expect this bound to be revisited and raised once real free-tier output quality/length is observed in production.

After parsing, validate each array item with `flashcardInputSchema.safeParse` (dropping failures), then cap the surviving list to 5 items. Call `complete()` with `temperature: 0.4, maxTokens: 3000` (default `timeoutMs`/`model` from `openrouter.ts`) — the new worst case (5 pairs at 500/500 chars ≈ 5,175 characters ≈ ~1,300 tokens) leaves the 3000-token budget with over 2x headroom.

**Regenerate confirm timing.** "Generate again" must warn before replacing the list only when the current list is non-empty (i.e., proposals are still pending review) — if the user has already resolved every proposal (accepted or rejected all of them), replacing an empty list needs no confirmation.

## Phase 1: AI Generation Service & Validation Foundation

### Overview

Adds the prompt-driven generation service, its validation, and the AI-sourced flashcard-creation service — no route or UI code yet.

### Changes Required:

#### 1. Shared types

**File**: `src/types.ts`

**Intent**: Add the request/response DTOs for the generate endpoint. The accept endpoint deliberately reuses the existing `FlashcardInput`/`Flashcard` types — no new type needed there.

**Contract**:
```ts
export interface GenerateFlashcardsRequest {
  sourceText: string;
}

export interface GenerateFlashcardsResponse {
  proposals: FlashcardInput[];
  droppedCount: number;
}
```

#### 2. Validation schema

**File**: `src/lib/schemas/flashcard.ts`

**Intent**: Validate the pasted source text server-side with the same 5000-char cap the UI enforces client-side.

**Contract**: `export const generateRequestSchema = z.object({ sourceText: z.string().trim().min(1, "Source text is required").max(5000, "Source text must be 5000 characters or fewer") });`

#### 3. Generation service

**File**: `src/lib/services/flashcard-generation.ts` (new)

**Intent**: Own the prompt construction, the call to `complete()` from `@/lib/openrouter`, and the defensive parse/validate/cap pipeline described in Critical Implementation Details. Mirrors `openrouter.ts`'s own `{ data, error }` Result idiom so callers use one error-handling pattern end-to-end.

**Contract**: `export async function generateFlashcardProposals(sourceText: string): Promise<{ data: { proposals: FlashcardInput[]; droppedCount: number } | null; error: OpenRouterClientError | null }>` — uses the exact prompt and `stripCodeFence` function from Critical Implementation Details; `droppedCount` is the number of parsed items that failed `flashcardInputSchema` and were discarded.

#### 4. AI-sourced create

**File**: `src/lib/services/flashcards.ts`

**Intent**: Add a sibling to the existing `createFlashcard` that hardcodes `source: "ai"` instead of `"manual"`, kept as a separate exported function (not a shared parameter) so the manual-create API route can never accidentally pass through an AI source.

**Contract**: `export async function createAiFlashcard(supabase: SupabaseClient, userId: string, input: FlashcardInput): Promise<Flashcard>` — same insert/select/error pattern as `createFlashcard`.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Calling `generateFlashcardProposals` with sample text (e.g. via a scratch script or the Astro dev server's node console) returns a `FlashcardInput[]` with 3–5 items, none exceeding 500 characters for question or answer.
- Feeding it a source text engineered to trigger a code-fenced or malformed AI response still returns a valid (possibly shorter, possibly empty) array rather than throwing.

---

## Phase 2: API Routes

### Overview

Thin Astro API routes over the Phase 1 services, following the `withApiErrorHandling`/`jsonError` pattern from `src/pages/api/flashcards/{index,[id]}.ts` exactly.

### Changes Required:

#### 1. Generate endpoint

**File**: `src/pages/api/flashcards/generate.ts` (new)

**Intent**: Validate the request, call `generateFlashcardProposals`, and map each `OpenRouterClientError` variant to a specific status + message so the UI can show the user something actionable instead of a generic failure.

**Contract**: `POST` handler wrapped in `withApiErrorHandling`. Guards: `createClient(...)` null → `jsonError("Supabase is not configured", 500)`; `context.locals.user` null → `jsonError("Unauthorized", 401)`; JSON parse failure → `jsonError("Invalid JSON body", 400)`; `generateRequestSchema.safeParse` failure → `jsonError(<first issue message>, 400)`. Error-type mapping from `generateFlashcardProposals`:

| `OpenRouterClientError.type` | HTTP status | Message |
| --- | --- | --- |
| `config` | 500 | "AI generation is not configured" |
| `timeout` | 504 | "Generation took too long — please try again" |
| `network` | 502 | "Couldn't reach the AI provider — please try again" |
| `api`, `status === 429` | 429 | "The free AI tier is rate-limited right now — please try again in a moment" |
| `api`, other | 502 | `<error.message>` |

On success: `Response.json({ proposals, droppedCount }, { status: 200 })`.

#### 2. Accept endpoint

**File**: `src/pages/api/flashcards/accept.ts` (new)

**Intent**: Persist one accepted (possibly edited) proposal as an AI-sourced flashcard. Reuses `flashcardInputSchema` — identical validation to manual create, since the shape is identical.

**Contract**: `POST` handler wrapped in `withApiErrorHandling`, same null-client/401/JSON-parse guards as above, `flashcardInputSchema.safeParse` on the body, `createAiFlashcard(supabase, user.id, parsed.data)`, `Response.json(created, { status: 201 })` on success.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- `POST /api/flashcards/generate` with valid pasted text returns 200 with a non-empty `proposals` array when called while authenticated; returns 401 when not.
- `POST /api/flashcards/generate` with text over 5000 chars returns 400.
- `POST /api/flashcards/accept` with a valid `{question, answer}` body returns 201 and the created row has `source: 'ai'` (verify via the `/flashcards` deck or a direct query).
- Triggering a free-tier 429 (or simulating by exhausting the model) surfaces status 429 with the rate-limit message.

---

## Phase 3: UI — Generation Page & Review Flow

### Overview

The paste → generate → review flow, plus the entry point from the existing deck page.

### Changes Required:

#### 1. Generation page

**File**: `src/pages/flashcards/generate.astro` (new)

**Intent**: Mirror `src/pages/flashcards/index.astro`'s structure (`Layout`, `Topbar`, heading, single mounted island) for a new route; automatically protected by the existing `/flashcards` prefix match in `src/middleware.ts`.

**Contract**: Renders `<FlashcardGenerator client:load />` inside the same `Layout`/container/heading pattern as `index.astro`, with a distinct heading (e.g. "Generate flashcards with AI").

#### 2. Entry point from the deck page

**File**: `src/pages/flashcards/index.astro`

**Intent**: Add a visible "Generate with AI" link next to the existing page heading so the new flow is discoverable from the deck.

**Contract**: A `Button`-styled anchor (`asChild` wrapping `<a href="/flashcards/generate">`) rendered statically — no `client:*` directive needed since it's a plain link, not an interactive island.

#### 3. Generation island

**File**: `src/components/flashcards/FlashcardGenerator.tsx` (new)

**Intent**: Own the full paste → generate → review state machine: a textarea with live character count/validation (reusing the `generateRequestSchema` limit and the counter pattern from `FlashcardForm`), a Generate button that calls `POST /api/flashcards/generate` and shows a spinner + elapsed-time counter + rotating status text while in flight, a review list of proposal cards (each accept/edit/reject), and a "Generate again" action per the Critical Implementation Details confirm-timing rule.

**Contract**: No props (mirrors `FlashcardDeck`'s no-props pattern). On a successful generate call, if `droppedCount > 0` show an informational toast (e.g. "N flashcards generated — M skipped due to formatting issues") alongside the proposal list, so a partially-invalid AI response is never silently invisible to the user. Internal state: `sourceText`, `phase: "idle" | "generating" | "reviewing" | "error"`, `proposals: (FlashcardInput & { clientId: string })[]` (a client-generated `clientId`, e.g. via `crypto.randomUUID()`, is assigned on receipt for React keys and local edit state — never sent to the accept endpoint), `editingProposal: (...) | null`, `error: string | null`. Reuses the existing `apiRequest<T>` fetch-helper pattern from `FlashcardDeck.tsx`. Edit reuses `FlashcardForm` in a `Dialog`, but its `onSubmit` updates the local proposal's `question`/`answer` in state rather than calling an API — persistence only happens on Accept. Accept calls `POST /api/flashcards/accept` with the (possibly edited) `{question, answer}`; a per-proposal `accepting` flag (mirroring `DeleteFlashcardDialog`'s `deleting` state) disables that card's buttons and shows a spinner while the request is in flight. On success it removes the item from `proposals` and shows a success toast. On failure the proposal stays in the list, `accepting` clears, and an error toast is shown — the user can retry the same card. Reject removes the item from `proposals` with no server call. Apply the S-03 long-text-overflow pattern (`grid-cols-1` not bare `grid`, `min-w-0` at each nesting level, `break-words` on text) to the proposal cards, since AI output is exactly the kind of arbitrary-length text that fix addressed.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Full US-01 walkthrough: paste text → Generate → see proposals with visible progress feedback (never a blank/hung screen) → Accept one, Edit-then-Accept one, Reject one → accepted cards appear immediately in `/flashcards`.
- Rejected proposals never appear in `/flashcards` (FR-004 acceptance criterion).
- An edited-then-accepted card shows the edited content, not the original AI text (FR-004 acceptance criterion).
- "Generate again" with pending proposals shows a confirm before replacing the list; with an empty list (all resolved) it regenerates without prompting.
- Long pasted text / long AI-generated answers wrap correctly with no horizontal overflow on the proposal cards, matching the existing deck-list fix.
- A simulated generation failure (e.g. temporarily invalid `OPENROUTER_API_KEY`) shows a specific error message and a working "Try again" button, never a blank screen.
- Responsive check at mobile/tablet/desktop widths, matching the project's established design standard.

---

## Testing Strategy

### Unit Tests:

- None — no test runner is configured repo-wide (consistent with S-03's precedent). If one is introduced in a future slice, `stripCodeFence` and the per-item validation/cap logic in `generateFlashcardProposals` are the highest-value first targets (pure functions, no I/O).

### Integration Tests:

- None (no test runner).

### Manual Testing Steps:

1. Paste a short paragraph (a few sentences) and generate — confirm a small, sensible number of proposals.
2. Paste text near the 5000-char cap and confirm both the client counter and server validation enforce it.
3. Accept, edit-then-accept, and reject at least one proposal each in a single session; confirm the deck list reflects exactly the accepted ones.
4. Click "Generate again" with proposals still pending — confirm the warning; confirm it replaces the list on confirm and is a no-op on cancel.
5. Temporarily break `OPENROUTER_API_KEY` (or trigger a real rate-limit) and confirm the specific error message + retry button.

## Performance Considerations

The 5000-character input cap bounds both the prompt token count and the model's response time within the existing 30-second `complete()` timeout — no chunking or streaming is needed to stay within that budget at this scale. No caching of generations; each click is a fresh call. Free-tier (`openrouter/free`) response-time and availability variance is a known, accepted risk carried forward from F-02.

## Migration Notes

None — no schema migration. `source: 'ai'` already exists on `public.flashcards` from F-01's migration.

## References

- Roadmap: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (US-01, FR-003, FR-004, FR-006)
- Prior plans: `context/archive/2026-08-22-flashcard-data-foundation/plan.md`, `context/archive/2026-08-23-ai-provider-integration/plan.md`, `context/archive/2026-08-23-manual-flashcard-management/plan.md`
- AI client: `src/lib/openrouter.ts`
- CRUD precedent: `src/lib/services/flashcards.ts`, `src/lib/schemas/flashcard.ts`, `src/lib/api-helpers.ts`, `src/pages/api/flashcards/index.ts`, `src/pages/api/flashcards/[id].ts`
- UI precedent: `src/components/flashcards/FlashcardDeck.tsx`, `src/components/flashcards/FlashcardForm.tsx`
- Route protection: `src/middleware.ts:4,18`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: AI Generation Service & Validation Foundation

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 5368f93
- [x] 1.2 Build succeeds: `npm run build` — 5368f93

#### Manual

- [x] 1.3 `generateFlashcardProposals` returns 3–5 valid `FlashcardInput` items for sample text — 5368f93
- [x] 1.4 Malformed/code-fenced AI response is handled without throwing — 5368f93

### Phase 2: API Routes

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — 9bdfb0c
- [x] 2.2 Build succeeds: `npm run build` — 9bdfb0c

#### Manual

- [x] 2.3 `POST /api/flashcards/generate` returns 200 with proposals when authenticated, 401 when not — 9bdfb0c
- [x] 2.4 `POST /api/flashcards/generate` returns 400 for source text over 5000 chars — 9bdfb0c
- [x] 2.5 `POST /api/flashcards/accept` returns 201 and persists with `source: 'ai'` — 9bdfb0c
- [x] 2.6 A simulated 429 surfaces status 429 with the rate-limit message — 9bdfb0c

### Phase 3: UI — Generation Page & Review Flow

#### Automated

- [x] 3.1 Linting passes: `npm run lint` — 629821d
- [x] 3.2 Build succeeds: `npm run build` — 629821d

#### Manual

- [x] 3.3 Full US-01 walkthrough: paste → generate → accept/edit-accept/reject → accepted cards appear in `/flashcards` — 629821d
- [x] 3.4 Rejected proposals never appear in `/flashcards` — 629821d
- [x] 3.5 Edited-then-accepted card shows edited content, not original AI text — 629821d
- [x] 3.6 "Generate again" confirms before replacing a non-empty pending list; no prompt when list is empty — 629821d
- [x] 3.7 Long text wraps correctly on proposal cards, no horizontal overflow — 629821d
- [x] 3.8 Simulated generation failure shows specific error + working retry, never a blank screen — 629821d
- [x] 3.9 Responsive check at mobile/tablet/desktop widths — 629821d
