---
date: 2026-08-29T00:00:00Z
researcher: Oskar
git_commit: fdd643fcb44178dbdf498429e0a79c1974a8a8c9
branch: testing-ai-generation-parsing
repository: 10xCards
topic: "Rollout Phase 1 — AI generation pipeline: pure validation & parsing (Risk #1, Risk #5 part)"
tags: [research, codebase, ai-generation, parsing, zod, validation, test-plan-phase-1]
status: complete
last_updated: 2026-08-29
last_updated_by: Oskar
---

# Research: Rollout Phase 1 — AI generation pipeline, pure validation & parsing

**Date**: 2026-08-29
**Researcher**: Oskar
**Git Commit**: fdd643fcb44178dbdf498429e0a79c1974a8a8c9
**Branch**: testing-ai-generation-parsing
**Repository**: 10xCards

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` ("Potok generowania AI — czysta walidacja i parsowanie") so unit tests can be planned:

- **Risk #1** — the pipeline (strip code-fence → per-item validation → cap to 5 → `droppedCount`) silently drops everything, or a prompt change breaks the JSON contract, with no error surfaced.
- **Risk #5 (part)** — the shared validation schema (question ≤500, answer ≤1000, source text ≤5000) drifts between client / server / DB, producing either a raw 500 from a DB CHECK violation or acceptance of over-long content.

For each risk: locate the real code path, quote the relevant lines, derive the **oracle** (expected behaviour) from sources rather than from the implementation, verify or correct the test-plan §2 response guidance, confirm the code is unit-testable, and flag speculative risks / misleading hot-spot evidence.

Scope decisions (from user, this session): Risk #5 → **full parity audit** (every import site, DB CHECK, client counters, all write routes). Route error taxonomy → **only the `safeParse` → 400 path**; the OpenRouter error→status table is left to Phase 2.

## Summary

**Both risks are real, actionable, and unit-testable with plain Vitest — no Astro runtime, no mocks, no local Supabase.** The parse/validate/cap logic was already split into a dependency-clean file precisely so it could be unit-tested standalone.

Key findings:

1. **The pure pipeline lives in `src/lib/services/flashcard-generation-parse.ts`** (`stripCodeFence`, `parseGeneratedContent`, `MAX_PROPOSALS = 5`). It imports only `@/lib/schemas/flashcard` and a type from `@/types`. The whole transitive chain (`flashcard/schema` → `zod` + `@/lib/i18n`) is free of `astro:env/server`. **`@/lib/i18n` has zero imports.** `openrouter.ts` (the only `astro:env/server` importer in the feature) is *not* in this file's graph. → **Phase 1 target is genuinely I/O-free.**

2. **Risk #1's real face is `JSON.parse` all-or-nothing.** `parseGeneratedContent` strips *at most one* fully-enclosing code fence, then `JSON.parse`s. If the model wraps JSON in prose ("Here are your flashcards: ```json […]```"), adds a trailing sentence after the closing fence, or truncates mid-array, the regex does **not** match, `JSON.parse` throws, and the function returns `{ data: null, error: "AI response was not valid JSON" }` — **the per-item `flashcardInputSchema` salvage never runs and the entire batch is lost.** This is confirmed as a *known, accepted* design limit by plan-review finding F1 (CRITICAL), which was resolved by *shrinking the expected output* (3–5 cards, answer ≤500 in the prompt) rather than adding salvage parsing. The "drop bad items, keep good ones" guarantee holds **only after `JSON.parse` succeeds and yields an array**.

3. **`droppedCount` counts schema failures only, and is finalised *before* the cap-to-5.** `proposals.slice(0, MAX_PROPOSALS)` in the return statement silently discards valid items 6+ **without** adding them to `droppedCount`. With the 3–5 prompt bound this is off-nominal, but it is an **unresolved oracle gap**: sources do not say what should happen when the model returns 8 valid items. Flag for `/10x-plan`.

4. **Risk #5 parity surface is 4 copies of each limit, not 2**: (a) zod `.max(N)` in `src/lib/schemas/flashcard.ts`, (b) Postgres `CHECK` in the migration, (c) the number baked into the Polish message string in `src/lib/i18n.ts`, (d) a display-only `const` in each client component (`QUESTION_LIMIT`/`ANSWER_LIMIT` in `FlashcardForm.tsx`, `SOURCE_TEXT_LIMIT` in `FlashcardGenerator.tsx`). The client **form and generator import the real schema object** for actual validation — the `const`s only drive the character counter.

5. **zod↔DB parity currently holds** but by a subtle mechanism: zod `.trim()` transforms the value, `.max()` checks the *trimmed* length, and the route inserts `parsed.data` (the trimmed string), so the DB `CHECK (length(question) <= 500)` sees exactly what zod checked. Verified against zod 4.4.3. A future edit that makes zod *more permissive than the CHECK* → insert throws → `withApiErrorHandling` catch → **HTTP 500 "Internal server error"** (Risk #5's exact failure). A future edit that makes zod *stricter* → safe 400.

6. **All four write routes** (`generate` sourceText, `accept`, `index` POST, `[id]` PATCH) use the identical guard: `schema.safeParse(body)` → on failure `jsonError(parsed.error.issues[0]?.message ?? "…", 400)`. Never a raw 500 on a validation failure that the schema catches.

7. **No speculative risks found.** Both risks describe defects in code that exists. One hot-spot citation in §2 is slightly imprecise (see Backport candidates).

## Detailed Findings

### Area 1 — The pure parse pipeline

**File**: `src/lib/services/flashcard-generation-parse.ts` (68 lines, entirely pure).

```
src/lib/services/flashcard-generation-parse.ts:19-22   stripCodeFence
src/lib/services/flashcard-generation-parse.ts:40-67   parseGeneratedContent
src/lib/services/flashcard-generation-parse.ts:12      const MAX_PROPOSALS = 5
```

`parseGeneratedContent(content: string): { data: { proposals: FlashcardInput[]; droppedCount: number } | null; error: string | null }`

Control flow (`:40-67`):

1. `JSON.parse(stripCodeFence(content))` inside `try/catch`. Catch → `{ data: null, error: "AI response was not valid JSON" }` (`:44-46`).
2. `if (!Array.isArray(parsed))` → `{ data: null, error: "AI response was not a JSON array" }` (`:48-50`).
3. `for (const item of parsed)`: `flashcardInputSchema.safeParse(item)`; success → push `result.data`, failure → `droppedCount += 1` (`:52-61`).
4. `return { data: { proposals: proposals.slice(0, MAX_PROPOSALS), droppedCount }, error: null }` (`:63-66`).

**Never throws.** Two distinct error strings distinguish "not JSON" from "not an array".

**Behaviour table (oracle-relevant), verified by reading + a zod 4.4.3 probe:**

| Input `content` | Result |
|---|---|
| `'[{"question":"q","answer":"a"}]'` | `data: { proposals: [{q,a}], droppedCount: 0 }` |
| Bare fence: ` ```json\n[…]\n``` ` (whole string) | fence stripped, parsed normally |
| Fence + leading prose: `Here you go:\n```json\n[…]\n```` | regex `^…$` fails → `JSON.parse` throws → **`error: "…not valid JSON"`, whole batch lost** |
| Fence + trailing text after closing ``` | same — regex `$`-anchored → **whole batch lost** |
| Uppercase ` ```JSON ` tag | `(?:json)?` is lowercase-only → no strip → parse throws → **batch lost** |
| Truncated mid-array (token cap hit) | `JSON.parse` throws → **batch lost** (plan-review F1) |
| `'{"flashcards":[…]}'` (object, not array) | `error: "…not a JSON array"` — no attempt to dig for a nested array |
| `'[]'` | `data: { proposals: [], droppedCount: 0 }, error: null` — **no error, empty, zero signal** |
| `[{good}, {bad}, {bad}]` | `data: { proposals: [{good}], droppedCount: 2 }, error: null` |
| 8 valid items | `data: { proposals: first5, droppedCount: 0 }` — **3 valid items silently gone, `droppedCount` says 0** |
| item with extra key `foo` | key stripped (schema is not `.strict()`), item kept |
| item `{question: 123}` / missing `answer` / `null` | `invalid_type` → dropped, counted |
| item `{question: "   ", answer: "a"}` | trimmed to empty → `too_small` → dropped, counted |

### Area 2 — `stripCodeFence` regex

`src/lib/services/flashcard-generation-parse.ts:19-22`:

```ts
export function stripCodeFence(content: string): string {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(content.trim());
  return match ? match[1] : content.trim();
}
```

- Anchored `^…$` against `content.trim()` → only strips when the **entire** trimmed string is one fenced block. Any prose before the opening fence or after the closing fence defeats it (→ `JSON.parse` then throws downstream).
- `(?:json)?` matches a lowercase `json` info-string only; ` ```JSON `, ` ```js `, ` ```JavaScript ` are not recognised.
- Non-greedy `([\s\S]*?)` + trailing `\s*``` `$` → a single trailing fence is required; nested triple-backticks inside the JSON payload (unlikely for Q/A flashcards but possible) would truncate the capture at the first ```` ``` ````.
- Matches the exact regex the S-01 plan specified (`context/archive/2026-08-25-ai-flashcard-generation/plan.md:63-66`) — no drift there.

**Oracle question**: is "strict single-fence only" the accepted contract, or should the parser tolerate surrounding prose (the free-tier failure mode the test-plan §2 #1 "must challenge" row calls out explicitly)? Sources say the *prompt* forbids prose; the S-01 plan and plan-review F1 chose **not** to harden the parser and to shrink expected output instead. So today's oracle = strict single-fence is intended, prose-wrapped JSON is *expected to fail closed with an error*. A test can pin that (assert `error` is non-null, `data` is null) — but `/10x-plan` should decide with the user whether that is the behaviour worth locking, or whether this research has surfaced a real gap to fix first (test-plan §1 principle: if the implementation has a bug, don't mirror it).

### Area 3 — `droppedCount` semantics & the cap interaction

- `droppedCount` is incremented **only** on `flashcardInputSchema.safeParse` failure (`:59`).
- The cap is `proposals.slice(0, MAX_PROPOSALS)` applied in the return expression (`:64`), *after* `droppedCount` is final. Items removed by the cap are **not** counted.
- Consumer: `FlashcardGenerator.tsx:128-132` shows `t.generate.generatedWithDroppedToast(n, droppedCount)` → Polish: *"Wygenerowano N fiszek — M pominięto z powodu błędów formatowania"* (`src/lib/i18n.ts:211-212`). "błędów formatowania" = formatting errors, which fits schema failures, not "we truncated your list".
- Plan-review finding **F5** (`context/archive/2026-08-25-ai-flashcard-generation/reviews/plan-review.md:67-75`) confirms the field exists "specifically to report proposals dropped by validation" and its only job is that toast.
- With the 3–5 prompt bound, >5 surviving items means the model ignored the instruction — off-nominal. **Sources do not resolve** whether silent truncation with `droppedCount: 0` is correct. → **Open Question for `/10x-plan`.**

### Area 4 — Risk #1 oracle (from sources, not code)

| Source | What it fixes as the oracle |
|---|---|
| `context/foundation/prd.md:94` (NFR) | "użytkownik nigdy nie zostaje z pustym/zawieszonym ekranem" — a silent empty result violates the product's one hard NFR for this flow. |
| `prd.md:37` (Success Criteria) | 75% AI-generated cards accepted — presupposes the pipeline actually *yields* cards for valid input. |
| `context/archive/2026-08-25-ai-flashcard-generation/plan.md:45` | "the parser must strip a fence before `JSON.parse`, and must treat a parse failure or non-array result as a soft error … rather than throwing". |
| `plan.md:71` | "validate each array item with `flashcardInputSchema.safeParse` (dropping failures), then cap the surviving list to 5". |
| `plan.md:115` | `droppedCount` = "the number of parsed items that failed `flashcardInputSchema` and were discarded". |
| `plan.md:137` (Phase 1 manual check) | a code-fenced/malformed response "still returns a valid (possibly shorter, possibly empty) array rather than throwing". |
| plan-review **F1** (CRITICAL, `plan-review.md:28-45`) | truncated/unparseable JSON loses the whole batch; **accepted** and mitigated only by scope reduction — *not* by salvage parsing. |

**Derived oracle for tests:**
- Valid JSON array in → every schema-valid item out (order preserved), up to 5; `droppedCount` = count of schema-invalid items; **never throws**.
- Adversarial `content` (bare fence, non-array, empty array, all-invalid, mixed) → deterministic `{data|error}` result, **never throws**.
- A parse failure returns `error` (non-null) with `data: null` — the caller (`flashcard-generation.ts:50-53`) wraps that into a `type:"api"` error; the batch is intentionally lost.
- Build adversarial input strings by hand with an **independently known** expected result — do **not** assert "output === what the parser produced on a recorded real response" (oracle-problem / mirror test, test-plan §2 #1 anti-pattern).

### Area 5 — Risk #5: the limit-parity surface (full audit)

**The numbers**: question **500**, answer **1000**, source text **5000**.

| # | Copy | Location | Exact form |
|---|---|---|---|
| 1 | zod `flashcardInputSchema` | `src/lib/schemas/flashcard.ts:13-16` | `z.string().trim().min(1, …).max(500/1000, …)` |
| 2 | zod `generateRequestSchema` | `src/lib/schemas/flashcard.ts:30-32` | `z.string().trim().min(1, …).max(5000, …)` |
| 3 | DB `CHECK` — question | `supabase/migrations/20260823134802_create_flashcards_table.sql:27` | `check (length(trim(question)) > 0 and length(question) <= 500)` |
| 4 | DB `CHECK` — answer | same file `:28` | `check (length(trim(answer)) > 0 and length(answer) <= 1000)` |
| 5 | i18n message text | `src/lib/i18n.ts:261,263,265` | `"Pytanie może mieć maksymalnie 500 znaków"` etc. — number is a literal *inside the string* |
| 6 | client counter const | `src/components/flashcards/FlashcardForm.tsx:11-12` | `const QUESTION_LIMIT = 500; const ANSWER_LIMIT = 1000;` (display only) |
| 7 | client counter const | `src/components/flashcards/FlashcardGenerator.tsx:31` | `const SOURCE_TEXT_LIMIT = 5000;` (display only) |
| — | (source text has **no** DB column) | source text is never persisted — only gate is zod #2 + client #7 | |

**Importers of `flashcardInputSchema`** (grep-verified, live code): `flashcard-generation-parse.ts:9`, `pages/api/flashcards/accept.ts:13`, `pages/api/flashcards/index.ts:9`, `pages/api/flashcards/[id].ts:10`, `components/flashcards/FlashcardForm.tsx:7`. (Plan-review recorded "3 importers" at S-01 planning time — `accept.ts` and `flashcard-generation-parse.ts` were added by S-01 itself.)

**Importers of `generateRequestSchema`**: `pages/api/flashcards/generate.ts:13`, `components/flashcards/FlashcardGenerator.tsx:20`.

**Client validation vs. display**:
- `FlashcardForm.tsx:39` — `flashcardInputSchema.safeParse({question, answer})` drives the submit button (`:128 disabled={!parsed.success}`). Real gate = the shared schema object. ✓
- `FlashcardGenerator.tsx:91` — `generateRequestSchema.safeParse({sourceText})` drives the generate button (`:225`). ✓
- `QUESTION_LIMIT` / `ANSWER_LIMIT` / `SOURCE_TEXT_LIMIT` are used **only** for `{len}/{LIMIT}` text and the red-colour threshold (`FlashcardForm.tsx:71,96`; `FlashcardGenerator.tsx:197`). If schema `.max` changes and these don't, the counter mislabels but submit still follows the schema — **cosmetic drift, low severity**, but in scope for a parity test's assertion set.
- Counter uses raw `.length`; zod validates *trimmed* length. "500 chars + trailing spaces" shows `505/500` in red yet submit is enabled (zod trims to 500, passes). Cosmetic only.

**zod `.trim()` ordering (verified, zod 4.4.3)** — `z.string().trim().min(1).max(500)`:
- `"   "` → `too_small` (checks post-trim). Matches DB `length(trim(question)) > 0`.
- `"q"×500 + "     "` → **passes**, `parsed.data.question` = the 500-char trimmed string. The route inserts `parsed.data`, so the DB `CHECK (length(question) <= 500)` sees length 500 → passes. **Parity holds because the trimmed value is what's persisted.**
- `"q"×501` → `too_big`; `"a"×1001` → `too_big`.
- extra keys stripped (not `.strict()`); `question: 123` / missing / `null` → `invalid_type`.

### Area 6 — Risk #5: validation failure → HTTP status, and the drift → 500 path

Every write route, same guard shape:

```
generate.ts:52-55   generateRequestSchema.safeParse(body)  → jsonError(issues[0]?.message ?? "Invalid input", 400)
accept.ts:34-37     flashcardInputSchema.safeParse(body)    → jsonError(issues[0]?.message ?? "Invalid input", 400)
index.ts:50-53      flashcardInputSchema.safeParse(body)    → jsonError(issues[0]?.message ?? "Invalid input", 400)  (POST)
[id].ts:33-36       flashcardInputSchema.safeParse(body)    → jsonError(issues[0]?.message ?? "Invalid input", 400)  (PATCH)
```

- `jsonError` (`src/lib/api-helpers.ts:23-26`) → `Response.json({ error: message }, { status })`.
- `withApiErrorHandling` (`api-helpers.ts:45-57`) wraps every handler: an `ApiError` throw → its own status; **any other throw → `console.error` + `jsonError("Internal server error", 500)`**.
- `createFlashcard` / `createAiFlashcard` / `updateFlashcard` (`src/lib/services/flashcards.ts:117-119,147-149,169-171`) all do `if (error) { throw error; }` — a Postgres `CHECK` violation is a plain thrown object, **not** an `ApiError`.
- **Therefore**: schema more permissive than the CHECK → over-long value passes `safeParse` → `createAiFlashcard` insert rejected by Postgres → thrown → `withApiErrorHandling` → **HTTP 500 "Internal server error"**. This is exactly test-plan §2 Risk #5's "odrzucenie CHECK w DB jako surowy 500".
- Schema stricter than the CHECK → 400 at the route, DB never sees it (safe).
- `parseIdParam` (`api-helpers.ts:32-38`) throws `ApiError("Invalid id", 400)` — the one place a route throws a *typed* error; not relevant to #5 but explains the `ApiError` branch.

**Note (Phase 2 boundary, not mapped here)**: `generate.ts:18-32` `mapErrorToResponse` turns `OpenRouterClientError` variants into 500/504/502/429. `flashcard-generation.ts:27-29` wraps every parse failure as `{ type: "api", status: 200 }`, which falls through to `generate.ts:30` → **HTTP 502 with the raw parse-error string** ("AI response was not valid JSON" / "…not a JSON array"). Left for Phase 2 per scope decision; recorded so Phase 1 tests don't accidentally assert on it.

### Area 7 — Import-cleanliness / unit-testability verdict

Dependency graph of the Phase 1 target:

```
flashcard-generation-parse.ts
├── @/lib/schemas/flashcard        (zod, @/lib/i18n, type-only @/types)
│   ├── zod                        (pure)
│   ├── @/lib/i18n                 ← ZERO imports, plain object + one helper fn
│   └── @/types                    (type-only, erased)
└── @/types                        (type-only, erased)
```

`grep "astro:env"` across the chain: the **only** hit in the feature is `src/lib/openrouter.ts:1` (`import { OPENROUTER_API_KEY } from "astro:env/server"`). `flashcard-generation-parse.ts` does **not** import `openrouter.ts` — only `flashcard-generation.ts:10` does. Confirmed by impl-review finding **F1** (`impl-review.md:23-31`): the split was done *specifically* to keep the pure logic testable "without pulling in `astro:env/server` via `openrouter.ts`", and combined behaviour was verified identical to the plan contract.

→ **`stripCodeFence`, `parseGeneratedContent`, `flashcardInputSchema`, `generateRequestSchema` are all directly unit-testable** with `import` + `vitest`, no `vi.mock`, no `astro:env` stub, no DB. `flashcard-generation.ts` (the `complete()` wrapper) is **not** plainly testable — it belongs to Phase 2.

### Area 8 — Test infrastructure

| Fact | Location |
|---|---|
| Runner | Vitest `^4.1.11` (`package.json:61`); `npm run test` = `vitest run` (`package.json:13`) |
| Config | `vitest.config.ts` — `test.include: ["src/lib/fsrs/**/*.test.ts"]` (`:17`), `resolve.alias` `@` → `./src` (`:12-14`), default Node env, no plugins |
| Only existing test file | `src/lib/fsrs/scheduler.test.ts` (git-verified: the sole `src/**/*.test.ts`) |
| Reference pattern | `scheduler.test.ts:1-2` — `import { describe, expect, it } from "vitest"`; `import { … } from "@/lib/fsrs/scheduler"`. Uses plain `describe`/`it`, a fixed `NOW` constant, behavioural assertions (ordering, accumulation) rather than exact library outputs. No `it.each` yet — but the test-plan explicitly wants parameterised tests for the redundant-copies anti-pattern. |
| zod | `^4.4.3` (`package.json:40`), resolved `4.4.3` |

**Change required for Phase 1**: `vitest.config.ts:17` `include` is scoped to `src/lib/fsrs/` only. It must be widened to also cover `src/lib/services/**/*.test.ts` (and, if schema tests are colocated, `src/lib/schemas/**/*.test.ts`) — or generalised to `src/**/*.test.ts`. This is an environment sub-phase (`/10x-implement`, not `/10x-tdd`). CLAUDE.md and the config comment both currently assert "only `src/lib/fsrs/` is covered" — both need updating in lockstep (docs-drift).

**CI note (from test-plan §5)**: `.github/workflows/ci.yml` triggers on `master`; default branch is `main`, so CI does not run `npm run test` on `main` today. Wiring that is test-plan §3 **Phase 5**, not this phase — do not fix it here.

## Code References

- `src/lib/services/flashcard-generation-parse.ts:19-22` — `stripCodeFence` regex (Risk #1)
- `src/lib/services/flashcard-generation-parse.ts:40-67` — `parseGeneratedContent`: parse → array check → per-item `safeParse` → `slice(0,5)` (Risk #1)
- `src/lib/services/flashcard-generation-parse.ts:12` — `MAX_PROPOSALS = 5`
- `src/lib/services/flashcard-generation-parse.ts:52-61` — `droppedCount` counts schema failures only; `:64` cap applied after
- `src/lib/schemas/flashcard.ts:13-16` — `flashcardInputSchema` (question ≤500, answer ≤1000, trim+min(1))
- `src/lib/schemas/flashcard.ts:30-32` — `generateRequestSchema` (sourceText ≤5000)
- `src/lib/i18n.ts:259-266` — `t.validation.*` messages with the numbers as string literals; whole file has zero imports
- `supabase/migrations/20260823134802_create_flashcards_table.sql:27-28` — DB `CHECK` for question/answer length + non-empty-after-trim
- `src/pages/api/flashcards/generate.ts:52-55` — `generateRequestSchema.safeParse` → 400 (Risk #5)
- `src/pages/api/flashcards/generate.ts:18-32` — `mapErrorToResponse` (Phase 2 territory; noted, not tested here)
- `src/pages/api/flashcards/accept.ts:34-37` — `flashcardInputSchema.safeParse` → 400
- `src/pages/api/flashcards/index.ts:50-53` — POST `flashcardInputSchema.safeParse` → 400
- `src/pages/api/flashcards/[id].ts:33-36` — PATCH `flashcardInputSchema.safeParse` → 400
- `src/lib/api-helpers.ts:23-26` — `jsonError`; `:45-57` — `withApiErrorHandling` (non-`ApiError` throw → 500)
- `src/lib/services/flashcards.ts:117-119,147-149,169-171` — `if (error) throw error` (CHECK violation → 500 path)
- `src/lib/services/flashcard-generation.ts:27-29,50-53` — parse error wrapped as `{type:"api", status:200}` (Phase 2)
- `src/lib/openrouter.ts:1` — the only `astro:env/server` import in the feature
- `src/components/flashcards/FlashcardForm.tsx:7,11-12,39,71,96,128` — imports shared schema; `const` limits are display-only
- `src/components/flashcards/FlashcardGenerator.tsx:20,31,91,128-132,197,225` — imports shared schema; `SOURCE_TEXT_LIMIT` display-only; `droppedCount` toast
- `src/lib/fsrs/scheduler.test.ts:1-2` — reference test style
- `vitest.config.ts:12-18` — alias + `include` scoped to `src/lib/fsrs/`

## Architecture Insights

- **Result idiom everywhere.** `openrouter.ts`, `flashcard-generation-parse.ts`, and `flashcard-generation.ts` all return `{ data, error }` and never throw. The service routes throw only inside `withApiErrorHandling`. Phase 1 tests exercise the non-throwing layer — assertions are on `result.data` / `result.error`, not `expect(...).toThrow()`.
- **One schema, imported by value.** The parity design is "everyone imports the same `flashcardInputSchema` object" (schema-file header comment). A parity test's job is to *pin the numbers to an independent source* (the migration + PRD/plan), not to introspect `schema.max` (that mirrors the implementation — test-plan §2 #5 anti-pattern).
- **`.trim()` in the schema is load-bearing.** It makes zod's max-check and the DB's raw-`length` check agree, because the trimmed value is what gets persisted. A test that changes `question` to `.max(500)` *without* `.trim()` would silently break DB parity for whitespace-padded input — worth an assertion.
- **Two failure severities in Risk #1.** (a) *Fail-closed*: parse error → `error` set, caller surfaces a message (acceptable, visible). (b) *Fail-silent*: `[]` or all-invalid → `data: { proposals: [], droppedCount: … }, error: null` → route returns 200 with empty list. The UI has an empty-state (`FlashcardGenerator.tsx:270-271`, `t.generate.noneSurvived`) — so it's not *invisible*, but the pipeline itself emits no error. Tests should pin which inputs land in (a) vs (b).
- **`MAX_PROPOSALS` and the prompt bound (3–5) are independent numbers** — the prompt asks for 3–5, the code hard-caps at 5. Nothing enforces a *minimum*. A test asserting "≥3 proposals" would be asserting the prompt's behaviour (non-deterministic LLM), not the pipeline's — out of scope for a unit test.

## Historical Context (from prior changes)

- `context/archive/2026-08-25-ai-flashcard-generation/plan.md:43-73` — Critical Implementation Details: the exact prompt, the `stripCodeFence` regex, "validate each item, drop failures, cap to 5", and the note that the 3–5 / 500-char bound is deliberately conservative (worst case ≈ 5,175 chars ≈ ~1,300 tokens vs. `maxTokens: 3000`).
- `context/archive/2026-08-25-ai-flashcard-generation/plan.md:117` — post-impl addendum: the parse pipeline was split into `flashcard-generation-parse.ts` to be `astro:env`-free and unit-testable; "combined behaviour unchanged".
- `context/archive/2026-08-25-ai-flashcard-generation/plan.md:244-252` — Testing Strategy: no runner at the time; `stripCodeFence` + per-item validation/cap named as "the highest-value first targets (pure functions, no I/O)". **This research confirms that call.**
- `context/archive/2026-08-25-ai-flashcard-generation/reviews/plan-review.md:28-45` — **F1 CRITICAL**: token-truncated / unparseable response loses the whole batch; resolved by scope reduction (3–15→3–5 cards, answer 1000→500 in prompt), **not** by salvage parsing. The all-or-nothing `JSON.parse` behaviour is a conscious, documented trade-off.
- `context/archive/2026-08-25-ai-flashcard-generation/reviews/plan-review.md:67-75` — **F5**: `droppedCount` exists solely to feed the "M skipped" toast.
- `context/archive/2026-08-25-ai-flashcard-generation/reviews/impl-review.md:23-31` — **F1**: confirms the split-file rationale and that behaviour was verified identical.
- `context/foundation/lessons.md:40-45` — "verify library config options against the *installed* version before pinning them in a plan"; applied here by probing zod 4.4.3 directly rather than trusting docs.
- `context/foundation/lessons.md:12-17` — no lodash / prefer native; keep test helpers dependency-free.

## Related Research

- None. This is the first research artifact for the test rollout. `context/archive/2026-08-27-first-review-session/` and `context/archive/2026-08-28-ux-improvements/` are adjacent (review-queue and UX) but do not touch the generation-parse path.

## Open Questions — oracle decisions for `/10x-plan` (and the user)

1. **Prose-wrapped / trailing-text JSON.** Today `parseGeneratedContent` fails closed (returns `error`, batch lost) when the model adds any text outside a single enclosing fence. Test-plan §2 #1 flags "free-tier owija w fence, dodaje prozę" as a *must-challenge* assumption. **Decision needed**: do Phase 1 tests (a) *pin* the fail-closed behaviour as the accepted contract, or (b) is this a real defect to fix (tolerate leading/trailing prose, or salvage complete objects) *before* writing the test? Sources currently support (a) — plan-review F1 consciously chose not to harden the parser — but the risk was raised precisely because the team is not sure that's right.

2. **>5 valid items → silent truncation with `droppedCount: 0`.** `slice(0, 5)` discards valid items 6+ and does not count them. No source says what *should* happen (the 3–5 prompt bound makes it off-nominal). **Decision needed**: is `droppedCount` meant to include cap-overflow ("we generated 8, kept 5, told you nothing"), or is schema-failures-only the intended contract and the test just documents it?

3. **`[]` from the model.** Valid empty array → `{ proposals: [], droppedCount: 0 }, error: null` → route 200. Acceptable per `plan.md:137` ("possibly empty array rather than throwing") and there is a UI empty-state. Assume **not** an error at the pipeline layer unless the user says otherwise — low risk, likely just an assertion to lock.

4. **Parity-test oracle for the numbers.** Confirm the plan will hard-code `500 / 1000 / 5000` sourced from the migration + PRD/plan, and assert the route returns **400 not 500** for `length = limit + 1`, rather than reading `schema.max` (mirror). This is the anti-oracle-problem framing the test-plan demands — worth stating explicitly in the plan so `/10x-tdd` doesn't drift into introspection.

## Backport candidates for `context/foundation/test-plan.md` §2 (per `/10x-test-plan` post-research check)

Minor — offered for the reconciliation step, none are blocking:

- **§2 Risk #1 Source column** cites hot-spot `src/lib/schemas/` (5 commits/30d) as likelihood evidence for the *parsing* pipeline. The parsing logic is in `src/lib/services/flashcard-generation-parse.ts` (`src/lib/services/` — already cited, 10 commits/30d). `src/lib/schemas/` churn is better evidence for Risk #5 than for the parsing half of #1. Consider narrowing #1's citation to `src/lib/services/` and leaving `src/lib/schemas/` on #5. (No file anchor is being added — this only tightens which hot-spot dir backs which risk.)
- **§2 Risk #1 wording** — "po cichu odrzuca wszystko" is accurate for the `[]` / all-invalid case but slightly off for the parse-failure case, which fails *closed with an error* (visible 502), not silently. The response-guidance row already captures both; the risk sentence could add "…albo zawodzi z mylącym błędem, mimo że AI odpowiedziało poprawną treścią w otoczce prozy." Optional.
- §2 response guidance for #1 and #5 otherwise **verified accurate** — the "must challenge" assumptions (happy-path representative; `droppedCount` cosmetic; "client validation is enough"; "DB CHECK is a backstop") all match what the code does.
