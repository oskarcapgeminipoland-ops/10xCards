# AI Flashcard Generation — Plan Brief

> Full plan: `context/changes/ai-flashcard-generation/plan.md`

## What & Why

Users paste a block of source text and get back 3–5 AI-generated flashcard proposals, which they individually accept, edit-then-accept, or reject — accepted ones land in their existing deck immediately. This is the roadmap's north-star slice (S-01): the only PRD story with a full Given/When/Then, and the only one that directly tests the product's core hypothesis (that AI-generated flashcards are good enough for 75% of them to be accepted rather than rejected).

## Starting Point

F-01 built the `flashcards` table with `source: 'ai' | 'manual'` already in the schema but deliberately left the AI accept/reject flow undesigned (no staging table). F-02 built a working, non-throwing OpenRouter client (`complete()` in `src/lib/openrouter.ts`) but explicitly non-streaming, punting the "visible progress, never a blank screen" UX requirement to this slice. S-03 (just shipped) established the CRUD/JSON-API/dialog/toast conventions this slice reuses directly, including a form component (`FlashcardForm`) built generically enough to double as the edit-before-accept UI with no changes.

## Desired End State

A logged-in user on `/flashcards` clicks "Generate with AI," pastes text on a new `/flashcards/generate` page, watches a spinner + status text while generation runs, then reviews a list of proposal cards — accepting, editing, or rejecting each one. Accepted cards appear in the normal deck instantly. Errors (including known free-tier rate-limiting) show a specific message with a retry button.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Proposal persistence | Dedicated `POST /api/flashcards/accept` endpoint, separate from manual create | Keeps `source: 'ai'` from ever being spoofable through the manual-create path; no schema change needed since the enum already supports it |
| Progress UX | Cosmetic spinner + elapsed timer + rotating status text, one non-streaming call | Satisfies the NFR without touching the F-02 client contract or adding streaming infra to a slice already flagged HIGH complexity |
| AI output shape | JSON array of `{question, answer}`, model picks a count in a 3–5 bound, answer capped at 500 chars (tighter than the DB's 1000) | Simplest prompt design; bound narrowed during plan review to keep worst-case response comfortably inside the maxTokens budget — expected to increase once real output quality is observed |
| Source text limit | Hard 5000-char cap, client + server | Bounds token cost and keeps generation inside the existing 30s client timeout |
| Malformed AI output | Drop invalid items via `flashcardInputSchema`, keep the rest | Reuses existing validation exactly; user still gets usable results from a partially-bad response |
| Error handling | Typed error → specific toast message + manual retry button | Matches `openrouter.ts`'s existing typed-error contract; no new retry/backoff infra |
| Edit-before-accept | Reuse `FlashcardForm` in a dialog, repurposed to edit local state | Zero new form code — same component, same validation, same char counters |
| Bulk actions | None — per-card accept/edit/reject only | Matches PRD's per-proposal review requirement exactly; avoids rubber-stamping AI output |
| Metrics/event log | Deferred entirely — not built in this slice | Keeps an already-HIGH-complexity slice focused on the core loop; F-01 explicitly left this decision to S-01 |
| Routing | Dedicated page `/flashcards/generate`, not a dialog | Matches this project's established "dedicated page + deliberate URL routing" standard; a paste + multi-card review flow is too heavy for a dialog |
| Regenerate | "Generate again" replaces the list, confirming only if proposals are still pending | Mitigates known free-tier output variability cheaply — reuses the same generate call |

## Scope

**In scope:** paste-text UI with length validation, AI generation via the existing OpenRouter client, structured JSON output with defensive parsing, per-proposal accept/edit/reject, persistence of accepted cards with `source: 'ai'`, regenerate, typed error handling with retry, entry point from the deck page.

**Out of scope:** DB migration/staging table, generation-event/metrics logging, SSE/token streaming, user-configurable proposal count, chunking long input, bulk "accept all," automatic retry/backoff, merge-on-regenerate, new shadcn primitives, automated tests.

## Architecture / Approach

Three phases: (1) an AI generation service (`src/lib/services/flashcard-generation.ts`) that prompts the model for JSON, defensively parses/validates the result, plus a `createAiFlashcard` sibling to the existing `createFlashcard`; (2) two thin API routes (`POST /api/flashcards/generate`, `POST /api/flashcards/accept`) following the exact `withApiErrorHandling` pattern S-03 established; (3) a new `/flashcards/generate` page and `FlashcardGenerator` island that reuses `FlashcardForm`, Sonner toasts, and the S-03 long-text-overflow fixes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. AI Generation Service & Validation | Prompt design, defensive JSON parsing, AI-sourced create | LLM output not matching the instructed JSON shape |
| 2. API Routes | `POST /api/flashcards/generate` and `/accept`, typed-error → HTTP-status mapping | Free-tier 429s under real usage |
| 3. UI — Generation Page & Review Flow | Full paste → generate → review UX, entry point from the deck | Cosmetic-only progress may still feel slow on a bad free-tier response |

**Prerequisites:** F-01 and F-02 (both `done`).
**Estimated effort:** ~2-3 sessions across 3 phases, within the project's 3-week after-hours MVP budget.

## Open Risks & Assumptions

- `openrouter/free` is a random-selection router across whatever free models are currently healthy — response quality and consistency will vary call to call; live 429s were already observed during F-02 testing.
- Without any event log, the actual 75%-acceptance north-star metric cannot be measured from this slice's data alone — it's a deliberate scope cut, not an oversight, but it means validating the product hypothesis will require a manual/qualitative read (or a future slice) rather than a dashboard.
- Prompt reliability for free-tier models is unproven at this repo's scale; the 3–5 count bound and JSON-only instruction may need tuning after real usage. The bound is intentionally conservative for now (narrowed during plan review to fit the `maxTokens` budget with margin) and is expected to be raised once real output quality is observed.

## Success Criteria (Summary)

- A user can go from pasted text to at least one accepted, AI-sourced flashcard visible in their deck, with every proposal individually reviewable (accept/edit/reject) — matching US-01's Given/When/Then exactly.
- No step of the generation wait ever leaves the user on a blank or hung screen.
- Rejected proposals and pre-edit AI text are never persisted — only what the user actually approved lands in the deck.
