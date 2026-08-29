# Rollout Phase 1 — AI Generation Pipeline: Pure Validation & Parsing — Implementation Plan

## Overview

Roll out **Phase 1** of `context/foundation/test-plan.md` §3: plain-Vitest unit tests that
lock the pure parse/validate/cap pipeline (**Risk #1**) and the shared
question/answer/source-text validation schema plus its cross-copy limit parity
(**Risk #5, part**).

The pipeline was deliberately split into a dependency-clean module
(`src/lib/services/flashcard-generation-parse.ts`) so this logic is unit-testable
with `import` + `vitest` — no `vi.mock`, no `astro:env` stub, no local Supabase.
This phase writes only tests + one environment change. **No production code is
modified** — every oracle decision (see Plan Brief "Key Decisions") resolved to
*pin the current behaviour with a test*, not *fix first*.

## Current State Analysis

- **Pure pipeline** — `src/lib/services/flashcard-generation-parse.ts` (68 lines,
  entirely pure, never throws):
  - `stripCodeFence(content)` (`:19-22`) — anchored regex
    `/^```(?:json)?\s*([\s\S]*?)\s*```$/` against `content.trim()`; strips **only**
    when the whole trimmed string is one fenced block; lowercase `json` tag only.
  - `parseGeneratedContent(content)` (`:40-67`) — `JSON.parse(stripCodeFence(...))`
    in try/catch → `{data:null, error:"AI response was not valid JSON"}` on throw;
    `!Array.isArray` → `{data:null, error:"AI response was not a JSON array"}`;
    else per-item `flashcardInputSchema.safeParse` (push on success, `droppedCount += 1`
    on failure); returns `{data:{proposals: proposals.slice(0, 5), droppedCount}, error:null}`.
  - `MAX_PROPOSALS = 5` (`:12`); the `slice(0, 5)` is applied in the return
    expression **after** `droppedCount` is final — items removed by the cap are
    **not** counted.
- **Shared schema** — `src/lib/schemas/flashcard.ts`:
  - `flashcardInputSchema` (`:13-16`) — `z.object({ question: z.string().trim().min(1, …).max(500, …), answer: z.string().trim().min(1, …).max(1000, …) })`, typed `z.ZodType<FlashcardInput>`.
  - `generateRequestSchema` (`:30-32`) — `z.object({ sourceText: z.string().trim().min(1, …).max(5000, …) })`.
  - Not `.strict()` — unknown keys are stripped, item kept.
  - zod `4.4.3`: `.trim()` transforms first, `.min`/`.max` check the **trimmed**
    length; `parsed.data` is the trimmed string.
- **The limit numbers exist in 4 copies** (Risk #5 parity surface):
  1. zod `.max()` — `src/lib/schemas/flashcard.ts:13-16,31`
  2. DB `CHECK` — `supabase/migrations/20260823134802_create_flashcards_table.sql:27-28`
     (`length(question) <= 500`, `length(answer) <= 1000`; **no column for source text**)
  3. i18n message text — `src/lib/i18n.ts:260-265`, number is a literal *inside* the
     Polish string (`"Pytanie może mieć maksymalnie 500 znaków"` etc.)
  4. client counter `const` — `FlashcardForm.tsx:11-12`, `FlashcardGenerator.tsx:31`
     (**display only** — the components import the real schema object for validation)
- **Importers of `flashcardInputSchema`** (grep-verified): `flashcard-generation-parse.ts:9`,
  `pages/api/flashcards/accept.ts:13`, `pages/api/flashcards/index.ts:9`,
  `pages/api/flashcards/[id].ts:10`, `components/flashcards/FlashcardForm.tsx:7`.
  **Importers of `generateRequestSchema`**: `pages/api/flashcards/generate.ts:13`,
  `components/flashcards/FlashcardGenerator.tsx:20`.
- **Test infra** — Vitest `4.1.11`; `npm run test` = `vitest run`;
  `vitest.config.ts:17` `include: ["src/lib/fsrs/**/*.test.ts"]` — **scoped to fsrs
  only**; alias `@` → `./src` (`:12-14`); default Node env, no plugins. The sole
  existing test file is `src/lib/fsrs/scheduler.test.ts` (plain `describe`/`it`,
  behavioural assertions, a fixed `NOW` constant, **no `it.each` yet**).
- **Docs asserting the fsrs-only scope** (must move in lockstep with the config):
  `vitest.config.ts:1-6` comment, `CLAUDE.md:16` (`npm run test` line).
- **Dependency graph of the Phase 1 target is `astro:env`-free**: `flashcard-generation-parse.ts`
  → `@/lib/schemas/flashcard` → (`zod`, `@/lib/i18n` [zero imports], type-only `@/types`).
  The only `astro:env/server` import in the feature is `src/lib/openrouter.ts:1`,
  which is **not** in this graph.

## Desired End State

`npm run test` runs the existing fsrs suite **plus** two new colocated suites:

- `src/lib/services/flashcard-generation-parse.test.ts` — proves that for any
  `content` string the pipeline strips one `json` code fence, drops **only**
  schema-invalid items, caps to 5, counts `droppedCount` as schema failures only,
  and **never throws / never returns `[]` when valid items were present**;
  adversarial payloads (prose-wrapped, trailing text, uppercase tag, truncated,
  non-array object) return a deterministic `{data:null, error:<string>}` and never
  throw.
- `src/lib/schemas/flashcard.test.ts` — proves the question/answer/source-text
  schemas reject empty-after-trim and `limit + 1` with the right message, accept
  the boundary value, check the **trimmed** length, and that the `500 / 1000 / 5000`
  limits match an **independent** oracle (migration `CHECK` + PRD/plan), asserted
  against the DB migration SQL and the i18n strings — not against `schema.max`.

`vitest.config.ts`, `CLAUDE.md`, and `test-plan.md` (§3 status, §6 cookbook) all
reflect the widened test scope, with `test-plan.md` §3 Phase 1 flipped to
`complete`. `change.md` `status` is managed by the 10x skills
(`/10x-implement`, `/10x-archive`) — this plan does not prescribe its transitions.

### Key Discoveries

- The parse module is import-clean **by design** — `impl-review.md:23-31` confirms
  the split was done specifically to keep this logic testable without
  `astro:env/server`. → genuine unit target.
- Risk #1's real face is **`JSON.parse` all-or-nothing**: prose around a single
  fence defeats the anchored regex → `JSON.parse` throws → whole batch lost.
  Plan-review **F1 (CRITICAL)** accepted this and mitigated by *shrinking expected
  output* (3–5 cards), **not** by hardening the parser. → today's oracle = strict
  single-fence is intended; prose-wrapped JSON is *expected to fail closed with an
  error*. Phase 1 pins that.
- `droppedCount` counts schema failures **only** and is final **before** `slice(0, 5)`.
  Plan-review **F5**: the field exists solely to feed the
  *"M pominięto z powodu błędów formatowania"* toast. → `8 valid → proposals:5, droppedCount:0`
  is documented, not "fixed".
- zod↔DB parity currently holds **because `.trim()` makes zod check what the DB
  persists**. A future edit dropping `.trim()` or loosening `.max` below the CHECK
  → insert throws → `withApiErrorHandling` → **HTTP 500** (Risk #5's exact
  failure). The parity test's job is to pin the numbers to an independent source.
- Reference test style: `src/lib/fsrs/scheduler.test.ts` — `import { describe, expect, it } from "vitest"`,
  behavioural assertions, no library-output mirroring.

## What We're NOT Doing

- **Not modifying any production code.** No parser hardening for prose-wrapped
  JSON, no case-insensitive fence tag, no salvage parsing, no change to
  `droppedCount` / cap semantics, no schema change. (All four research Open
  Questions resolved to "pin current behaviour".) If prose-wrapping proves common
  in practice, that is a **separate future change**, not this phase.
- **Not testing the route surface.** No tests that import `POST` / `PATCH`
  handlers, build a fake `APIContext`, or assert HTTP status. The
  "over-long body → 400, never a raw 500" assertion is owned by **§3 Phase 3**
  (local Supabase, two seeded users). Phase 1 tests the schema object in
  isolation.
- **Not testing `flashcard-generation.ts` / `openrouter.ts` / `complete()`** —
  the OpenRouter error → status table and the `{type:"api", status:200}` →
  HTTP 502 wrapping are **§3 Phase 2**.
- **Not touching CI wiring.** `.github/workflows/ci.yml` triggers on `master` while
  the default branch is `main` — fixing that is **§3 Phase 5**.
- **Not asserting LLM behaviour** — no "≥3 proposals" test (that pins the prompt,
  not the pipeline; nothing enforces a minimum in code).
- **Not adding a test dependency.** Vitest built-ins only (`describe`/`it`/`it.each`/`expect`).
  No fixture library, no `zod` introspection helper.
- **Not colocating a `vi.mock`** anywhere — the target is pure.

## Implementation Approach

Four phases, dependency-ordered:

1. **Environment first** — widen the Vitest `include` and move the two docs that
   claim "fsrs only" in lockstep. Nothing to red-test here → `/10x-implement`.
2. **Risk #1 tests** — colocated `flashcard-generation-parse.test.ts`. Each named
   behaviour has a one-sentence red-test description → `/10x-tdd` candidate (the
   code already exists, so this is "write the test that would have caught the
   regression", executed test-first for discipline). Parametrized `it.each` for
   the adversarial-string set and the per-item drop-reason set, to avoid the
   redundant-copies anti-pattern.
3. **Risk #5 tests** — colocated `src/lib/schemas/flashcard.test.ts`. Schema
   in/out behaviour + a **triangulated parity** block: expected numbers are
   hard-coded from the migration + PRD, then asserted against (a) schema behaviour
   at the boundary, (b) the migration SQL `CHECK` numbers read from disk, (c) the
   `t.validation.*` message strings. `/10x-tdd` candidate.
4. **Cookbook + status sync** — fill `test-plan.md` §6.1 / §6.5 / §6.6, flip §3
   Phase 1 status, update `change.md`. → `/10x-implement`.

Oracle construction rule for phases 2–3: every expected value is derived by hand
from the PRD / migration / archived plan or from the zod-`4.4.3` semantics
documented in research — **never** by recording what `parseGeneratedContent` or
`schema.safeParse` currently returns and asserting equality to that.

## Critical Implementation Details

**Oracle source for `droppedCount`** — `context/archive/2026-08-25-ai-flashcard-generation/plan.md:115`:
`droppedCount` = "the number of parsed items that failed `flashcardInputSchema`
and were discarded". Items removed by `slice(0, 5)` are **out of scope of that
definition** — the `8 valid → droppedCount: 0` test asserts the definition, not a
bug.

**zod `.trim()` ordering (verified against `4.4.3`)** — for
`z.string().trim().min(1).max(500)`: `"   "` → `too_small`;
`"q".repeat(500) + "     "` → **passes**, `parsed.data.question` is the 500-char
trimmed string; `"q".repeat(501)` → `too_big`. Tests must use these exact
semantics; do not assume `.max` sees the raw length.

**Reading the migration from a unit test** — the parity test in Phase 3 reads
`supabase/migrations/20260823134802_create_flashcards_table.sql` via
`node:fs`/`node:path` (resolve from `import.meta.url` or `process.cwd()`), then
extracts the CHECK bound with a tolerant regex
(`/length\(question\)\s*<=\s*(\d+)/` and the `answer` equivalent). A single
hard-coded path is acceptable: it is the `CREATE TABLE` migration and today the
only file with a `question`/`answer` length CHECK. **Known limitation** — this
project already uses constraint-only follow-up migrations
(`20260823153107_enforce_server_side_flashcard_timestamps.sql`), so a future
`ALTER TABLE … DROP CONSTRAINT … ADD CONSTRAINT (length(question) <= N)` would not
be picked up and the test would keep asserting the stale `CREATE TABLE` value.
The test **must carry an inline comment** stating this assumption ("the
question/answer length CHECK is defined once, in the create-table migration, and
never altered by a later migration"); if that ever stops being true, widen the
read to glob every `supabase/migrations/*.sql` and take the **last** CHECK match
for each column. For this MVP the documented assumption is the accepted trade-off.

**`@/` alias in tests** — already wired in `vitest.config.ts:12-14`; import the
modules under test as `@/lib/services/flashcard-generation-parse` and
`@/lib/schemas/flashcard`, matching `scheduler.test.ts:2`.

---

## Phase 1: Environment — Widen Vitest Scope

### Overview

Make Vitest discover test files under `src/lib/services/` and `src/lib/schemas/`,
and update the two docs that assert the old fsrs-only scope so they don't drift.

### Changes Required

#### 1. Vitest config

**File**: `vitest.config.ts`

**Intent**: Broaden test discovery so the Phase 2/3 suites run under `npm run test`
without losing the existing fsrs coverage.

**Contract**: `test.include` (currently `["src/lib/fsrs/**/*.test.ts"]`) becomes a
list that also matches `src/lib/services/**/*.test.ts` and
`src/lib/schemas/**/*.test.ts` — or the single generalized glob
`["src/**/*.test.ts"]`. The header comment (`:1-6`), which currently says
"only `src/lib/fsrs/` is covered", is rewritten to describe the new scope and to
note the covered modules are still Astro/React-import-free (default Node env, no
plugins, still correct). No other config key changes.

#### 2. Repo guide

**File**: `CLAUDE.md`

**Intent**: Keep the one-line `npm run test` description truthful.

**Contract**: Line 16 — replace "scoped to `src/lib/fsrs/` (FSRS scheduling logic
only; no Astro/React test integration is configured)" with wording that covers
FSRS scheduling **plus** the AI-generation parse/validation unit tests
(`src/lib/services/`, `src/lib/schemas/`), still noting no Astro/React test
integration exists. Pure-prose edit — no code.

### Success Criteria

#### Automated Verification

- `npm run test` passes with the existing `src/lib/fsrs/scheduler.test.ts` still
  collected and green (no regression from the `include` change).
- `npm run lint` passes (typescript-eslint runs with `projectService: true`, so
  this is a genuine type-checked gate for the `.ts` files touched here).
- `npm run build` passes — Astro's build runs the full type check; there is **no**
  standalone `tsc` / `typecheck` script in this project, and bare `tsc --noEmit`
  would fail on `.astro` files under the strict `tsconfig`.
- A scratch `src/lib/schemas/__probe__.test.ts` with a trivial `expect(true).toBe(true)`
  is **discovered and run** by `npm run test`, then deleted. (Proves the glob
  widened; do not commit the probe.)

#### Manual Verification

- `git grep -n "fsrs" -- vitest.config.ts CLAUDE.md` shows no remaining claim that
  fsrs is the *only* covered path.
- The `vitest.config.ts` header comment reads correctly and still explains why the
  Node env with no plugins is sufficient.

**Implementation Note**: After automated verification passes, pause for manual
confirmation before starting Phase 2.

---

## Phase 2: Risk #1 — Parse Pipeline Unit Tests

### Overview

Colocated `flashcard-generation-parse.test.ts` proving `stripCodeFence` and
`parseGeneratedContent` honour the derived oracle: valid array in → every
schema-valid item out (order preserved) up to 5; `droppedCount` = schema-failure
count; adversarial `content` → deterministic `{data:null, error:<string>}`;
**never throws; never `[]` when valid items were present**.

### Changes Required

#### 1. `stripCodeFence` behaviour

**File**: `src/lib/services/flashcard-generation-parse.test.ts` (new)

**Intent**: Pin exactly which wrappers the fence-stripper removes and which it
leaves for `JSON.parse` to reject, so a regex "tidy-up" that widens or narrows it
fails loudly.

**Contract**: `describe("stripCodeFence")` with cases, expected values built by
hand:
- bare `` ```json\n[…]\n``` `` (whole trimmed string) → returns the inner `[…]`
- `` ```\n[…]\n``` `` (no info-string) → returns inner
- leading/trailing whitespace around the whole fence → still stripped (regex uses
  `content.trim()` + `\s*`)
- `` "prefix ```json\n[…]\n``` " `` (prose before fence) → returned **unchanged**
  (minus outer trim) — regex is `^…$`-anchored
- text after the closing ``` → returned unchanged
- `` ```JSON `` uppercase tag → returned unchanged (`(?:json)?` is lowercase-only)
- plain `"[…]"` with no fence → returned trimmed, unchanged otherwise

#### 2. `parseGeneratedContent` — happy path & ordering

**File**: same

**Intent**: Prove valid input yields every valid item, in order, with
`droppedCount: 0` and `error: null`.

**Contract**: `describe("parseGeneratedContent — valid input")`:
- `'[{"question":"q1","answer":"a1"},{"question":"q2","answer":"a2"}]'` →
  `data.proposals` deep-equals the two items in order, `data.droppedCount === 0`,
  `error === null`
- same payload wrapped in a `` ```json `` fence → identical result
- item with an extra key (`{question,answer,foo}`) → `foo` stripped, item kept
  (schema not `.strict()`)

#### 3. `parseGeneratedContent` — partial failure & counting

**File**: same

**Intent**: Prove only schema-invalid items are dropped, they are counted, and
valid items survive alongside them (challenges "happy-path is representative").

**Contract**: `it.each` over per-item drop reasons, each row = one distinct
regression:
- `{question: 123, answer: "a"}` → `invalid_type` → dropped
- `{question: "q"}` (missing `answer`) → dropped
- `null` / `"string"` / `42` as the array element → dropped
- `{question: "   ", answer: "a"}` → trimmed-empty → `too_small` → dropped
- `{question: "q".repeat(501), answer: "a"}` → `too_big` → dropped
- `{question: "q", answer: "a".repeat(1001)}` → `too_big` → dropped
Each case is embedded in `[{good}, <bad>, {good2}]` and asserts
`data.proposals` = `[good, good2]` (order preserved), `data.droppedCount === 1`,
`error === null`.

#### 4. `parseGeneratedContent` — empty / all-invalid (locked non-error contract)

**File**: same

**Intent**: Pin that a valid-but-empty array and an all-invalid array both return
`{proposals:[], droppedCount:N}, error:null` (route → HTTP 200 + empty state) —
and that `droppedCount` is the only signal distinguishing the two.

**Contract**:
- `'[]'` → `data.proposals` = `[]`, `data.droppedCount === 0`, `error === null`
- `'[{"bad":1},{"also":"bad"}]'` → `data.proposals` = `[]`,
  `data.droppedCount === 2`, `error === null`

#### 5. `parseGeneratedContent` — cap at 5 (documented truncation)

**File**: same

**Intent**: Document current behaviour — 8 schema-valid items → first 5 kept,
`droppedCount: 0` (cap-overflow is not a schema failure). Catches an accidental
change to `MAX_PROPOSALS` or the `slice`.

**Contract**: build 8 valid items `q1..q8`; assert `data.proposals.length === 5`,
`data.proposals` maps to `q1..q5` in order, `data.droppedCount === 0`,
`error === null`. A comment references
`context/archive/2026-08-25-ai-flashcard-generation/plan.md:115` as the oracle for
why `droppedCount` is 0 here.

#### 6. `parseGeneratedContent` — adversarial payloads fail closed, never throw

**File**: same

**Intent**: Prove the free-tier failure modes (fence + prose, trailing text,
uppercase tag, truncation, object-not-array) each return a deterministic
`{data:null, error:<known string>}` and **never** throw — the batch is
intentionally lost with a visible error, not silently.

**Contract**: `it.each` of hand-built strings, each with an independently-known
expected `error`:
- `` "Here are your flashcards:\n```json\n[{\"question\":\"q\",\"answer\":\"a\"}]\n```" `` → `error === "AI response was not valid JSON"`, `data === null`
- valid fence + `"\nHope this helps!"` appended → same
- `` "```JSON\n[…]\n```" `` (uppercase) → same
- `'[{"question":"q","answer":"a"'` (truncated mid-array) → same
- `'{"flashcards":[{"question":"q","answer":"a"}]}'` (object, not array) →
  `error === "AI response was not a JSON array"`, `data === null`
- `''` and `'   '` → `error === "AI response was not valid JSON"` (empty →
  `JSON.parse` throws)
Wrap each in `expect(() => parseGeneratedContent(input)).not.toThrow()` **and**
assert the returned shape. No assertion couples to a *recorded* real LLM response.

### Success Criteria

#### Automated Verification

- `npm run test` — the new `flashcard-generation-parse.test.ts` suite passes,
  fsrs suite still green.
- `npm run lint` passes on the new file (type-checked ESLint rules).
- `npm run build` passes — the new test file is in the TS project via `tsconfig`
  `include: ["**/*"]`, so Astro's build type check covers it.
- Every adversarial case is inside an `it.each` (no six near-identical `it`
  blocks) — grep the file for `it.each` and confirm ≥2 uses.

#### Manual Verification

- Read the file: no expected value is derived by running the function first
  (no "snapshot of real output" pattern); every expected `proposals` / `error` is
  literal or hand-constructed.
- Temporarily change `MAX_PROPOSALS` to `4` in the source → the cap test fails;
  revert.
- Temporarily broaden the regex to `/i` (case-insensitive) → the uppercase-tag
  `stripCodeFence` case fails; revert. (Confirms the test actually pins the
  documented limit.)

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Risk #5 (part) — Schema Unit Tests + Limit-Parity Triangulation

### Overview

Colocated `src/lib/schemas/flashcard.test.ts` proving the shared schemas reject
empty-after-trim and over-limit input with the right message, accept the boundary,
check the **trimmed** length, and that `500 / 1000 / 5000` agree across the
copies that live in testable code — using an oracle taken from the migration +
PRD, never from `schema.max`.

### Changes Required

#### 1. `flashcardInputSchema` — boundary & trim behaviour

**File**: `src/lib/schemas/flashcard.test.ts` (new)

**Intent**: Pin accept/reject at the exact boundary and the trim-then-measure
semantics, so a `.trim()` removal or an off-by-one in `.max` is caught.

**Contract**: `describe("flashcardInputSchema")`, expected outcomes from zod
`4.4.3` semantics (documented in research), not from running the schema first:
- `{question: "q", answer: "a"}` → `success === true`, `data` deep-equals input
- `{question: "q".repeat(500), answer: "a".repeat(1000)}` → `success === true`
- `{question: "q".repeat(501), answer: "a"}` → `success === false`, first issue
  `message === "Pytanie może mieć maksymalnie 500 znaków"`
- `{question: "q", answer: "a".repeat(1001)}` → `success === false`, message
  `"Odpowiedź może mieć maksymalnie 1000 znaków"`
- `{question: "   ", answer: "a"}` → `success === false`, message
  `"Pytanie jest wymagane"` (trim → `min(1)` fires)
- `{question: "  q".padEnd(505, " "), answer: "a"}` (≤500 after trim, padded
  past 500 raw) → `success === true`, `data.question === "q"` trimmed
- `{question: 123 as unknown, answer: "a"}` → `success === false` (`invalid_type`)

#### 2. `generateRequestSchema` — source-text boundary

**File**: same

**Intent**: Same boundary/trim discipline for the 5000-char source-text gate.

**Contract**: `{sourceText: "x".repeat(5000)}` → `success`;
`"x".repeat(5001)` → `!success`, message
`"Tekst źródłowy może mieć maksymalnie 5000 znaków"`; `"   "` → `!success`,
message `"Tekst źródłowy jest wymagany"`.

#### 3. Importer-parity check (file-level)

**File**: same

**Intent**: Prove the routes and the client form still **import the shared schema
object** rather than a local/inline copy — the concrete "the copies diverged"
failure mode of Risk #5. A referential `.toBe` on a re-import of the same module
is tautological (ES modules are singletons) and proves nothing about the route
files, so this check reads their **source** instead.

**Contract**: `it.each` over the grep-verified importer list from research Area 5:
- `flashcardInputSchema`: `src/lib/services/flashcard-generation-parse.ts`,
  `src/pages/api/flashcards/accept.ts`, `src/pages/api/flashcards/index.ts`,
  `src/pages/api/flashcards/[id].ts`, `src/components/flashcards/FlashcardForm.tsx`
- `generateRequestSchema`: `src/pages/api/flashcards/generate.ts`,
  `src/components/flashcards/FlashcardGenerator.tsx`

For each `(file, symbol)` pair: read the file via `node:fs` (same CWD/`import.meta.url`
resolution as change #4) and assert it contains an `import` from
`"@/lib/schemas/flashcard"` whose named-import list includes `symbol`. Use a
tolerant regex (allow reordered/multi-line named imports); a bare `import * as`
form should **fail** the assertion with a message pointing the maintainer at this
test so the list can be updated deliberately. No route module is `import`ed at
runtime — that would pull Astro context. A comment records that this proves the
import edge, not that the symbol is wired into `safeParse` (route-behaviour parity
is §3 Phase 3).

#### 4. Limit-parity triangulation

**File**: same

**Intent**: Catch a limit drifting in any copy that lives in testable code
(schema behaviour, DB migration, i18n string) against a hard-coded oracle — the
exact anti-pattern `test-plan.md` §2 #5 names ("nie wyprowadzaj stałej ze
`schema.max`").

**Contract**: `const LIMITS = { question: 500, answer: 1000, sourceText: 5000 }` —
literal, with a comment citing
`supabase/migrations/20260823134802_create_flashcards_table.sql:27-28` and
`context/foundation/prd.md` as the source. Then:
- **schema face**: `question` of `LIMITS.question` chars passes, `+ 1` fails; same
  for `answer`, `sourceText` — reuses cases from changes 1–2 but asserts the
  count comes from `LIMITS`, not a bare literal.
- **migration face**: read the `CREATE TABLE` migration `.sql` via `node:fs`;
  regex `/length\(question\)\s*<=\s*(\d+)/` → `Number(m[1]) === LIMITS.question`;
  same for `answer`. Assert the file contains **no** `<= ` bound for a source-text
  column (there is no such column). Carry the inline comment from Critical
  Implementation Details: this assumes the question/answer CHECK is defined once
  in the create-table migration and never altered by a later migration — if that
  changes, widen to glob all `supabase/migrations/*.sql` and take the last match.
- **i18n face**: `expect(t.validation.questionTooLong).toContain(String(LIMITS.question))`,
  and the `answer` / `sourceText` equivalents against `t.validation.answerTooLong`
  / `t.validation.sourceTextTooLong`.
- A comment records that the 4th copy — the client `const`s in `FlashcardForm.tsx`
  / `FlashcardGenerator.tsx` — is **display-only** and intentionally not covered
  by a unit test (cosmetic drift, low severity; noted in research Area 5).

### Success Criteria

#### Automated Verification

- `npm run test` — `flashcard.test.ts` suite passes; other suites green.
- `npm run lint` passes on the new file (type-checked ESLint rules).
- `npm run build` passes (Astro build type check).
- The parity block reads the migration file successfully in the Vitest Node env
  (path resolves in CI too — verify via a relative path from `process.cwd()` or
  `import.meta.url`, not an absolute path).

#### Manual Verification

- Read the file: `LIMITS` values are literals with a source comment; no test
  reads `flashcardInputSchema`'s internal `.def` / `.checks` / `.max`.
- Temporarily edit the migration CHECK to `<= 400` → the migration-face assertion
  fails; revert.
- Temporarily edit `t.validation.questionTooLong` to drop the number → the
  i18n-face assertion fails; revert.
- Temporarily change `flashcardInputSchema` `.max(500)` → `.max(499)` → the
  schema-face boundary test fails; revert.

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Cookbook Patterns + Rollout Status Sync

### Overview

Record what Phase 1 established so the next contributor can copy the pattern, and
advance the rollout state machine in `test-plan.md` and `change.md`.

### Changes Required

#### 1. Cookbook — unit test recipe

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.1 "TBD" tail with the now-known conventions.

**Contract**: §6.1 "Dodanie testu jednostkowego" — state: colocation
(`<module>.test.ts` beside the module); the **import-clean parsing-module
pattern** (pure logic split out of an `astro:env`-importing sibling so it needs no
runtime/mock — reference `flashcard-generation-parse.ts` ↔ `flashcard-generation.ts`);
`it.each` for property/edge-case tables to avoid the redundant-copies
anti-pattern; assertions on `{data, error}` result objects, never `toThrow`.
Keep `scheduler.test.ts` as the second reference alongside the new files.

#### 2. Cookbook — AI-generation-pipeline recipe

**File**: `context/foundation/test-plan.md`

**Intent**: Fill §6.5 with the adversarial-`content` approach.

**Contract**: §6.5 "Dodanie testu dla potoku generowania AI" — describe:
hand-build adversarial `content` strings (fence + prose, trailing text, uppercase
tag, truncated, object-not-array) each paired with an **independently known**
expected `{data:null, error:<one of the two exact strings>}`; assert
`not.toThrow()` alongside shape; never assert equality to a recorded real LLM
response (oracle problem). Note the two locked contracts: `[]` / all-invalid →
`error:null` + empty `proposals`; `>5 valid` → `slice` to 5 with `droppedCount:0`.

#### 3. Cookbook — per-phase note

**File**: `context/foundation/test-plan.md`

**Intent**: Add the optional §6.6 "notatki per faza" entry for Phase 1.

**Contract**: 2–3 lines — where the fixtures/adversarial strings live (inline in
each test file), the `it.each` naming convention chosen, and that the parity test
reads the migration `.sql` from disk as its DB oracle.

#### 4. Rollout status — Phase 1 row

**File**: `context/foundation/test-plan.md`

**Intent**: Advance §3 Phase 1 status now that tests have landed.

**Contract**: §3 table, Phase 1 row — `Status` `planned` → `complete` (per the
fixed status vocabulary in §3; the row was moved `researched` → `planned` in
commit 9ee66a0 / the plan-review step). `Last updated` header date bumped. No
other row changes.

#### 5. Change identity

**File**: `context/changes/testing-ai-generation-parsing/change.md`

**Intent**: Note that `change.md` front matter is left to the 10x skills.

**Contract**: This plan does **not** edit `change.md`. `/10x-implement` advances
`status` as phases land and `/10x-archive` closes it — the implementer should not
hand-edit the front matter here.

#### 6. (Optional) test-plan §2 wording backports

**File**: `context/foundation/test-plan.md`

**Intent**: Apply research's two minor, non-blocking §2 Risk #1 refinements if the
user wants them folded in here.

**Contract**: (a) narrow Risk #1's Source-column hot-spot citation to
`src/lib/services/` and leave `src/lib/schemas/` as evidence for Risk #5 only;
(b) extend the Risk #1 sentence to note the parse-failure case *fails closed with
a misleading error* (visible 502), distinct from the silent-`[]` case. Skip
entirely if the user prefers to keep §2 frozen.

### Success Criteria

#### Automated Verification

- `npm run test` still green (no code touched in this phase).
- `npm run lint` / markdown formatting hook passes on `test-plan.md`.
- `grep -n "| planned | testing-ai-generation-parsing |" context/foundation/test-plan.md`
  returns nothing — the §3 Phase 1 row no longer reads `planned`.

#### Manual Verification

- §6.1 / §6.5 / §6.6 no longer say "TBD — patrz §3 Faza 1" for the parts Phase 1
  covered.
- §3 Phase 1 `Status` reads `complete`; §3 Phase 2/3 rows untouched.
- `change.md` was **not** edited by this phase.
- Decision on the optional §2 backports is recorded (applied, or explicitly
  deferred in the PR description).

**Implementation Note**: This is the final phase — after verification, the change
is ready for review / `/10x-archive`.

---

## Testing Strategy

### Unit Tests

- **`flashcard-generation-parse.test.ts`** — `stripCodeFence` (7 wrapper cases),
  `parseGeneratedContent` (happy path + ordering, `it.each` drop-reasons,
  empty/all-invalid non-error contract, cap-at-5, `it.each` adversarial payloads).
- **`flashcard.test.ts`** — `flashcardInputSchema` + `generateRequestSchema`
  boundary/trim/message, importer identity, 3-face parity triangulation.

### Integration Tests

- **None in this phase.** Route-level "over-long body → 400 not 500" and the
  cross-account surface are §3 Phase 3 (local Supabase, two users). The
  OpenRouter-error → HTTP-status table is §3 Phase 2.

### Manual Testing Steps

1. `npm run test` — all three suites collected, all green.
2. Flip one pinned constant at a time (`MAX_PROPOSALS`, a `.max(N)`, the fence
   regex `/i` flag, a migration CHECK number, an i18n string number) and confirm
   the corresponding test fails — proves the tests bite, not just pass.
3. Revert every experimental edit; `npm run test` green again.

### (Optional) Mutation check — selective gate, not CI

Per `CLAUDE.md` M3L2: after Phases 2–3 land and pass, optionally
`npx stryker run --mutate "src/lib/services/flashcard-generation-parse.ts"` and
`--mutate "src/lib/schemas/flashcard.ts"`. For each survived mutant ask "would
this hurt a user?"; kill the ones that would (likely: the `Array.isArray` guard,
the `droppedCount += 1`, the `slice` bound, each `.max`/`.min`), consciously
ignore equivalent/cosmetic ones. Do **not** chase 100% or pin cosmetic mutants.
Not wired into CI.

## Performance Considerations

Negligible. Both suites are pure in-memory string/schema work; the only I/O is one
synchronous `readFileSync` of a small migration file in the parity test. Total
added runtime well under a second.

## Migration Notes

None — no schema or data changes. The only config change is `vitest.config.ts`
`include` (widened, not narrowed — existing coverage preserved).

## References

- Research: `context/changes/testing-ai-generation-parsing/research.md`
- Change identity: `context/changes/testing-ai-generation-parsing/change.md`
- Test strategy: `context/foundation/test-plan.md` §2 (Risk #1, #5), §3 Phase 1,
  §6.1 / §6.5
- Target modules: `src/lib/services/flashcard-generation-parse.ts:19-22,40-67`,
  `src/lib/schemas/flashcard.ts:13-16,30-32`
- Oracle sources: `supabase/migrations/20260823134802_create_flashcards_table.sql:27-28`,
  `src/lib/i18n.ts:260-265`, `context/foundation/prd.md` (NFR: never an empty/hung
  screen), `context/archive/2026-08-25-ai-flashcard-generation/plan.md:45,71,115,137`,
  `.../reviews/plan-review.md` F1 / F5
- Reference test: `src/lib/fsrs/scheduler.test.ts:1-2`
- Config to change: `vitest.config.ts:1-6,17`; docs in lockstep: `CLAUDE.md:16`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step
> lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Environment — Widen Vitest Scope

#### Automated

- [x] 1.1 `npm run test` passes with `scheduler.test.ts` still collected and green — 68d2db2
- [x] 1.2 `npm run lint` passes — 68d2db2
- [x] 1.3 `npm run build` passes (Astro build type check; no standalone `tsc` script) — 68d2db2
- [x] 1.4 Scratch probe test under `src/lib/schemas/` is discovered and run, then deleted — 68d2db2

#### Manual

- [x] 1.5 `git grep "fsrs"` in `vitest.config.ts` / `CLAUDE.md` shows no "only" claim — 68d2db2
- [x] 1.6 `vitest.config.ts` header comment reads correctly for the new scope — 68d2db2

### Phase 2: Risk #1 — Parse Pipeline Unit Tests

#### Automated

- [x] 2.1 `npm run test` — `flashcard-generation-parse.test.ts` passes, fsrs green — 1dff9ce
- [x] 2.2 `npm run lint` passes on the new file — 1dff9ce
- [x] 2.3 `npm run build` passes (Astro build type check) — 1dff9ce
- [x] 2.4 Adversarial + drop-reason cases use `it.each` (≥2 uses in the file) — 1dff9ce

#### Manual

- [x] 2.5 No expected value derived from running the function first (no output snapshot) — 1dff9ce
- [x] 2.6 `MAX_PROPOSALS` → 4 breaks the cap test; reverted — 1dff9ce
- [x] 2.7 Fence regex `/i` flag breaks the uppercase-tag test; reverted — 1dff9ce

### Phase 3: Risk #5 (part) — Schema Unit Tests + Limit-Parity Triangulation

#### Automated

- [x] 3.1 `npm run test` — `flashcard.test.ts` passes; other suites green
- [x] 3.2 `npm run lint` passes on the new file
- [x] 3.3 `npm run build` passes (Astro build type check)
- [x] 3.4 Parity block reads the migration `.sql` successfully via a CWD/`import.meta.url`-relative path

#### Manual

- [x] 3.5 `LIMITS` are literals with a source comment; no `.max` / `.checks` introspection
- [x] 3.6 Migration CHECK → 400 breaks the migration-face assertion; reverted
- [x] 3.7 Dropping the number from an i18n string breaks the i18n-face assertion; reverted
- [x] 3.8 `.max(500)` → `.max(499)` breaks the schema-face boundary test; reverted

### Phase 4: Cookbook Patterns + Rollout Status Sync

#### Automated

- [ ] 4.1 `npm run test` still green (no code touched)
- [ ] 4.2 Lint / markdown format hook passes on `test-plan.md`
- [ ] 4.3 No `| planned | testing-ai-generation-parsing |` line remains in the §3 Phase 1 row

#### Manual

- [ ] 4.4 §6.1 / §6.5 / §6.6 no longer say "TBD — patrz §3 Faza 1" for covered parts
- [ ] 4.5 §3 Phase 1 `Status` reads `complete`; Phase 2/3 rows untouched
- [ ] 4.6 `change.md` was not edited by this phase
- [ ] 4.7 Optional §2 backports applied or explicitly deferred in the PR description
