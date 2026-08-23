# AI Provider Integration (OpenRouter) Implementation Plan

## Overview

Add a thin, generic OpenRouter chat-completion client to `src/lib/`, wire it into the
existing config-status registry, and verify it with a real end-to-end call through a
temporary dev-only route. This is foundation-only (F-02 on the roadmap): no
flashcard-generation logic, no UI, no model-selection config — just a working,
reusable client that S-01 (AI flashcard generation) will call.

## Current State Analysis

- `OPENROUTER_API_KEY` is already wired: registered in `astro.config.mjs`'s `env.schema`
  (`context: "server", access: "secret", optional: true`), set in `.dev.vars` for local
  dev, and pushed as a Cloudflare Worker secret for prod. This plan does not touch that —
  it only adds the code that reads and uses it.
- No AI-provider client exists yet. `src/lib/` currently has `supabase.ts` (Supabase SSR
  client), `config-status.ts` (config health registry), and `utils.ts` (`cn()` helper).
- The project has no HTTP client dependency and none is needed — Cloudflare Workers
  (the deploy target) provides a native `fetch` and `AbortController`.
- No test runner is configured (per `CLAUDE.md`); verification for this plan is
  automated type-check/lint plus manual smoke testing, consistent with how F-01 verified
  its migration.

### Key Discoveries:

- `src/lib/supabase.ts:5-8` establishes the project's "thin client" pattern: a factory
  function that returns `null` (or, here, a typed error) instead of throwing when
  required config is missing.
- `src/pages/api/auth/signin.ts:13-17` shows the project's existing error-handling idiom:
  destructure `{ error }` from the SDK call and branch on it — no try/catch, no thrown
  exceptions. The OpenRouter client should follow the same Result-style shape for
  consistency.
- `src/lib/config-status.ts:11-21` is the single source of truth for the "is X
  configured" banner rendered by `src/layouts/Layout.astro:23`. Adding OpenRouter here
  is a two-line addition to an existing array, not a new subsystem.
- **Astro routing gotcha**: any file or directory under `src/pages/` whose name starts
  with `_` is excluded from route generation. A temporary smoke-test route must NOT live
  under a `_`-prefixed path (e.g. `_debug/`) or it will silently 404.
- OpenRouter's chat-completions endpoint (`POST https://openrouter.ai/api/v1/chat/completions`)
  is OpenAI-compatible: `Authorization: Bearer <key>`, JSON body `{ model, messages }`.
  Verified live during planning with the real project key — confirmed working end-to-end.
- Free-tier model research (live query against `https://openrouter.ai/api/v1/models`,
  filtered to `pricing.prompt === "0"`): `gpt-4o-mini` is NOT free on OpenRouter (no free
  OpenAI models exist there). Individual free models (e.g. `google/gemma-4-31b-it:free`,
  `z-ai/glm-5.2:free`) returned live `429` "temporarily rate-limited upstream" errors
  during testing — a known characteristic of OpenRouter's shared free pool.
  `openrouter/free` (OpenRouter's own "Free Models Router", $0 pricing, auto-selects and
  fails over across available free models) was verified live and succeeded where the
  pinned models were rate-limited. Chosen as the hardcoded default per user decision:
  always-free, resilient to individual free-model rate-limiting, swappable later without
  a contract change since `model` remains an overridable parameter.

## Desired End State

`src/lib/openrouter.ts` exports a `complete()` function that any future server-side code
(starting with S-01) can call with a system/user message array and get back either a
completion or a typed, actionable error — without needing to know anything about
`fetch`, headers, timeouts, or OpenRouter's error shape. `src/lib/config-status.ts` shows
an "OpenRouter not configured" banner under the same conditions the Supabase entry
already does. A real call through this exact code path has been manually verified
against the live OpenRouter API using the project's real key.

**Verification**: `npx astro check` and `npm run lint` pass; a temporary dev route
proves a real completion round-trips through `complete()`; the temporary route is
removed before the phase is marked done.

### Key Discoveries:

(see "Current State Analysis" above — this plan has no additional discoveries beyond
what's captured there)

## What We're NOT Doing

- No flashcard-specific prompting, system messages, or generation logic — that's S-01's
  scope entirely; this client is provider-generic.
- No streaming (SSE) support — non-streaming request/response only. If S-01 needs
  streaming for its progress-signal UX, that's a contract change made in S-01's own plan.
- No retry/backoff logic beyond the single request timeout — a failed or rate-limited
  call surfaces as a typed error; retry policy (if any) is a caller decision.
- No model-selection UI, env var, or per-user override — `model` is an optional
  parameter defaulting to a single hardcoded constant (`openrouter/free`). Swapping
  models later is a one-line change to the caller or the constant, not a new subsystem.
- No new dependency (no OpenRouter/OpenAI SDK, no zod) — native `fetch` +
  `AbortController`, and manual runtime guards on the response shape. Matches
  `CLAUDE.md`'s guidance to add zod only when a route actually needs body validation;
  this module isn't a route and validates a single narrow response shape itself.
- No cost/usage tracking or rate-limiting guardrails on our side — out of scope for a
  foundation client with no consumer yet.
- No changes to `astro.config.mjs`, `.env.example`, or `.dev.vars` — already done.

## Implementation Approach

One `src/lib/openrouter.ts` module, following the same two established project
conventions (`supabase.ts`'s "typed client, no throw" shape and the auth routes'
`{ data, error }` destructuring idiom) rather than introducing a third error-handling
style. Verification happens through a throwaway route that exercises the real
`astro:env/server` → `complete()` → `fetch` → OpenRouter path, then gets deleted —
proving the wiring works without leaving debug surface in the shipped app.

## Critical Implementation Details

**Astro route exclusion**: the temporary smoke-test route must be created at a path that
does NOT start with `_` (e.g. `src/pages/api/dev/openrouter-smoke.ts`, not
`src/pages/api/_debug/...`) — Astro silently excludes `_`-prefixed paths under
`src/pages/` from routing, which would make the route un-curlable and the manual
verification step impossible to complete as written.

## Phase 1: OpenRouter thin client, config status, and verified smoke test

### Overview

Add the client, register it in the config-status banner, and prove it works with a real
call — then remove the proof-of-work route.

### Changes Required:

#### 1. OpenRouter client

**File**: `src/lib/openrouter.ts`

**Intent**: A generic, provider-focused chat-completion wrapper around OpenRouter's
OpenAI-compatible endpoint. Mirrors `supabase.ts`'s "typed, non-throwing client" pattern
and the auth routes' `{ data, error }` idiom so callers never need try/catch.

**Contract**:

- Exports a `Message` type (`{ role: "system" | "user" | "assistant"; content: string }`).
- Exports `DEFAULT_MODEL = "openrouter/free"` as a named constant (not inlined), so a
  future model swap is a one-line change.
- Exports an async `complete(params: { model?: string; messages: Message[]; temperature?: number; maxTokens?: number; timeoutMs?: number })`
  returning `Promise<{ data: { content: string; model: string } | null; error: OpenRouterClientError | null }>`.
  `model` defaults to `DEFAULT_MODEL`; `timeoutMs` defaults to `30000`.
- `OpenRouterClientError` is a discriminated union on a `type` field:
  `{ type: "config"; message: string }` (API key missing — checked before any network
  call, mirroring `supabase.ts`'s `if (!SUPABASE_URL || !SUPABASE_KEY) return null`
  guard), `{ type: "timeout"; message: string }` (the request's `AbortController` fired),
  `{ type: "network"; message: string }` (fetch itself rejected — DNS/connection failure,
  not an HTTP error status), `{ type: "api"; status: number; message: string }`
  (OpenRouter responded with a non-2xx status; `message` comes from the response body's
  `error.message` when present, else the status text).
- Error classification order matters and is the one non-obvious part of this module:
  wrap the `fetch` call itself in try/catch first — an `AbortError` (from the
  `AbortController` timing out) must be distinguished from any other thrown error
  (network failure) before you ever look at `response.ok`. Only once `fetch` resolves
  successfully do you check `response.ok` to split the "api" error case from the success
  case; JSON-parse the body in both the success and the `api`-error branch (OpenRouter
  returns a JSON error body on failure too, per the `error.message` field observed during
  live testing).
- Sends `Authorization: Bearer ${OPENROUTER_API_KEY}` and `Content-Type: application/json`
  headers. Also send `HTTP-Referer` and `X-Title` headers per OpenRouter's documented
  app-identification convention (any stable placeholder value is fine — e.g. the repo
  URL and `"10xCards"` — this only affects OpenRouter's own analytics/leaderboards, not
  request success).

#### 2. Config status registry

**File**: `src/lib/config-status.ts`

**Intent**: Surface a "not configured" banner for OpenRouter the same way Supabase
already gets one, so a missing key is visible in the UI instead of silently failing deep
in a future S-01 API route.

**Contract**: Import `OPENROUTER_API_KEY` from `astro:env/server`; append one entry to
the `configStatuses` array with the same shape as the existing Supabase entry
(`name`, `configured: Boolean(OPENROUTER_API_KEY)`, `message`, `docsUrl: "https://openrouter.ai/keys"`,
`docsLabel`). No changes to `missingConfigs` or `Layout.astro` — both already consume the
array generically.

#### 3. Temporary smoke-test route (created and removed within this phase)

**File**: `src/pages/api/dev/openrouter-smoke.ts` (NOT under a `_`-prefixed path — see
Critical Implementation Details)

**Intent**: Prove `complete()` works end-to-end against the live OpenRouter API through
the actual `astro:env/server` + Cloudflare `fetch` runtime path, not just via raw curl.
This file is scaffolding for manual verification, not a shipped feature.

**Contract**: A `GET` handler that calls `complete({ messages: [{ role: "user", content: "Reply with exactly the word: OK" }] })`
and returns the `{ data, error }` result as JSON, so it can be curled locally during
`npm run dev` and read directly. Delete this file as the last step of this phase, once
both manual checks below pass — its absence from the final diff is itself part of the
manual verification.

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes (or `npm run build`)
- `npm run lint` passes

#### Manual Verification:

- With `npm run dev` running, `curl localhost:4321/api/dev/openrouter-smoke` returns a
  real completion (`data.content` populated, `error: null`) — confirms the full
  `astro:env/server` → `complete()` → OpenRouter path works, not just a raw API call.
- Temporarily call `complete({ ..., timeoutMs: 1 })` (e.g. via a query param on the same
  dev route, or a one-off edit) and confirm it returns `{ data: null, error: { type: "timeout", ... } }`
  rather than hanging or throwing.
- `src/pages/api/dev/openrouter-smoke.ts` has been deleted — confirm it's absent from
  `git status`/the final diff before marking this phase done.

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human that the manual testing was
successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

None — no test runner is configured in this project (see `CLAUDE.md`). Verification is
type-check + lint (automated) plus a real live call through a temporary route (manual).

### Integration Tests:

The temporary dev route in Phase 1 *is* the integration test for this plan — it's the
only way to prove the `astro:env/server` wiring and the OpenRouter contract actually work
together, given there's no test runner to codify it as an automated suite yet.

### Manual Testing Steps:

1. Start `npm run dev`.
2. `curl localhost:4321/api/dev/openrouter-smoke` — expect a real completion back.
3. Verify the timeout path returns a typed error rather than hanging (see Success
   Criteria above).
4. Delete the temporary route file and confirm `npm run build` still passes without it.

## Performance Considerations

None specific to this plan — a single external HTTP call with a bounded timeout. Actual
latency/throughput characteristics under real usage are S-01's concern once flashcard
generation is wired up.

## Migration Notes

Not applicable — no data model or schema changes in this plan.

## References

- Existing thin-client pattern: `src/lib/supabase.ts:5-8`
- Existing Result-style error idiom: `src/pages/api/auth/signin.ts:13-17`
- Existing config-status registry: `src/lib/config-status.ts:11-21`
- Roadmap item: F-02 (`ai-provider-integration`) — `context/foundation/roadmap.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: OpenRouter thin client, config status, and verified smoke test

#### Automated

- [x] 1.1 `npx astro check` (or `npm run build`) passes — c7fe723
- [x] 1.2 `npm run lint` passes — c7fe723

#### Manual

- [x] 1.3 Real completion round-trips through `complete()` via the temporary dev route — c7fe723
- [x] 1.4 Timeout path returns a typed `{ type: "timeout" }` error instead of hanging — c7fe723
- [x] 1.5 Temporary dev route file deleted before phase close — c7fe723
