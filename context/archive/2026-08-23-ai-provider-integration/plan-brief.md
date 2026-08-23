# AI Provider Integration (OpenRouter) — Plan Brief

> Full plan: `context/changes/ai-provider-integration/plan.md`

## What & Why

F-02 on the roadmap: minimal OpenRouter wiring — a thin, reusable client that lets
future code (starting with S-01, the AI flashcard generation feature) call an LLM
without knowing about `fetch`, headers, timeouts, or OpenRouter's error shape. This is
foundation work with no UI and no flashcard-specific logic; it exists purely to unblock
S-01.

## Starting Point

`OPENROUTER_API_KEY` is already wired end-to-end (registered in `astro.config.mjs`'s env
schema, set in `.dev.vars` locally, pushed as a Cloudflare Worker secret in prod) — that
happened earlier in this session, outside this plan. No AI-provider client code exists
yet. The project already has one analogous "thin client" (`src/lib/supabase.ts`) and one
config-health registry (`src/lib/config-status.ts`) whose patterns this plan reuses.

## Desired End State

`src/lib/openrouter.ts` exports a `complete()` function returning `{ data, error }` (never
throws), with a hardcoded free default model. `src/lib/config-status.ts` shows a
"not configured" banner if the key is ever missing, matching the existing Supabase
banner. The whole path has been proven with one real, verified call against the live
OpenRouter API.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Client shape | Generic `complete({ model, messages, ... })` wrapper | Mirrors OpenRouter's own API shape; flexible enough for S-01's system+user prompt without pre-deciding flashcard-specific logic |
| Error handling | Result-style `{ data, error }`, never throws | Matches the only existing precedent in the repo (`supabase.auth.signInWithPassword` destructuring in `src/pages/api/auth/signin.ts`) |
| Streaming | Not supported yet | Roadmap scopes F-02 as "minimal"; streaming UX is an S-01 decision, not a foundation one |
| Default model | Hardcoded constant, `openrouter/free` | User wants free-only; live-tested — pinned free models (e.g. `gemma-4-31b-it:free`) hit real 429 rate-limits during testing, `openrouter/free` (OpenRouter's own auto-failover free router) succeeded. Swappable later — `model` stays an optional override param |
| Verification | Temporary dev route, created and deleted within the phase | Proves the real `astro:env/server` → client → OpenRouter path works now, not left to be discovered mid-S-01; avoided the `_`-prefix Astro routing exclusion gotcha found during planning |

## Scope

**In scope:**
- `src/lib/openrouter.ts` — thin, typed, non-throwing chat-completion client
- `src/lib/config-status.ts` — OpenRouter entry in the existing config banner registry
- One-time manual verification via a temporary, deleted-before-done dev route

**Out of scope:**
- Any flashcard-generation prompting or logic (S-01)
- Streaming (SSE) responses
- Retry/backoff beyond a single request timeout
- Model-selection UI/env var, cost tracking, rate-limiting guardrails
- Any new dependency (no SDK, no zod)

## Architecture / Approach

One new module (`src/lib/openrouter.ts`) following two conventions already established
in this codebase — `supabase.ts`'s "typed client, no throw" shape, and the auth routes'
`{ data, error }` destructuring idiom — so the codebase ends up with one consistent
error-handling style instead of a third pattern. A discriminated-union error type
(`config` / `timeout` / `network` / `api`) lets callers branch on failure mode without
string-matching messages.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. OpenRouter thin client, config status, verified smoke test | Working `complete()` client + config banner entry, proven live | Free-model rate-limiting (mitigated by choosing `openrouter/free`); Astro `_`-prefix routing exclusion (documented, route path corrected) |

**Prerequisites:** `OPENROUTER_API_KEY` already wired (done, outside this plan).
**Estimated effort:** ~1 session, single phase.

## Open Risks & Assumptions

- `openrouter/free` is a random-selection router across whatever free models are
  currently healthy — response quality/consistency will vary call to call. Acceptable
  for this foundation-only phase (no consumer yet); S-01 should re-evaluate model choice
  once flashcard-quality requirements are concrete.
- OpenRouter's free tier is shared and rate-limited at the platform level (observed live
  429s on two different pinned free models during planning) — `openrouter/free`'s
  failover mitigates but doesn't eliminate this; a fully saturated free pool could still
  fail all options simultaneously. Not a blocker for foundation wiring, but S-01 should
  know this before depending on free-tier availability for user-facing generation.

## Success Criteria (Summary)

- `complete()` returns a real completion when called with a valid prompt, verified via a
  live call through the actual application code path (not just raw curl).
- A missing API key or a timed-out request surfaces as a typed error, never a thrown
  exception or a hang.
- `npx astro check` and `npm run lint` pass with the new module in place.
