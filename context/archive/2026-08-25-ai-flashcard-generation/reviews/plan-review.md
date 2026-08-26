<!-- PLAN-REVIEW-REPORT -->
# Plan Review: AI Flashcard Generation Implementation Plan

- **Plan**: context/changes/ai-flashcard-generation/plan.md
- **Mode**: Deep
- **Date**: 2026-08-25
- **Verdict**: REVISE (original) → SOUND (post-triage — all 5 findings FIXED, see Findings)
- **Findings**: 1 critical, 3 warnings, 1 observation — all FIXED

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding

Grounding: 10/10 paths ✓, 5/5 symbols ✓, brief↔plan ✓

Verified via a dedicated sub-agent: Astro static-route-before-dynamic-route precedence (no `trailingSlash`/`redirects`/`base`/`_routes.json` overriding it) — CONFIRMED; `PROTECTED_ROUTES` prefix match on `/flashcards` does not cover `/api/flashcards/*` — CONFIRMED; blast radius of `createFlashcard` (1 importer), `flashcardInputSchema` (3 importers), `complete` (0 importers, unused today) — all accounted for, no surprises; no existing `stripCodeFence`/prompt-building utility to reuse — CONFIRMED net-new; `wrangler.jsonc` has no `limits` block configured — nothing actionable.

## Findings

### F1 — maxTokens budget likely too low, and truncation defeats the "keep good ones" design

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details / Phase 1 §3
- **Detail**: `openrouter.ts:109` passes `maxTokens` straight through as `max_tokens` with no clamp, and `extractCompletion` (`openrouter.ts:61-74`) never checks `finish_reason` — a token-truncated response comes back as a normal success with a syntactically incomplete `content` string. The plan sets `maxTokens: 3000` for up to 15 flashcards at up to 500+1000 chars each (the DB CHECK max) — 22,500 characters of content alone, ~5,600+ tokens at a conservative ~4 chars/token, before JSON overhead. A realistic worst case exceeds the 3000-token budget by ~2x. When that happens, `JSON.parse` throws on the whole array — the plan's per-item `flashcardInputSchema` filtering never runs, and the entire batch is lost. That's exactly the all-or-nothing failure the "drop bad items, keep good ones" decision was chosen to avoid.
- **Fix A ⭐ Recommended**: Raise the budget + add truncation-safe salvage parsing
  - Strength: Preserves the plan's own "keep good ones" intent even when the failure mode is truncation, not one bad item; the token math comes straight from limits the plan already cites.
  - Tradeoff: Adds a salvage-parsing branch (regex-extract complete objects up to the last balanced brace) beyond a plain try/catch.
  - Confidence: HIGH — token math is directly derivable from the plan's own stated 500/1000-char limits.
  - Blind spot: Actual tokens-per-character ratio depends on which free-tier model OpenRouter routes to; budget should carry real margin, not be tuned to the exact computed worst case.
- **Fix B**: Just raise maxTokens generously (e.g. 8000–10000), no salvage parsing
  - Strength: One-line change, no new parsing logic.
  - Tradeoff: Doesn't close the gap, just makes it rarer — the residual case still loses the whole batch.
  - Confidence: MEDIUM — reduces likelihood substantially but doesn't eliminate it.
  - Blind spot: OpenRouter's free-tier router may impose its own per-model output ceiling below what's requested; unverified.
- **Decision**: FIXED (Fix differently — scope reduction instead of a maxTokens/parsing change). Proposal count bound narrowed 3–15 → 3–5, AI-generated answer cap narrowed 1000 → 500 chars (DB limit unchanged at 1000; this is a tighter prompt-level instruction). New worst case ≈ 5,175 chars ≈ ~1,300 tokens, comfortably inside the existing `maxTokens: 3000` budget (>2x headroom) — no maxTokens change or salvage-parsing code needed. Noted in the plan as a deliberately conservative starting bound, expected to be raised once real free-tier output quality is observed. Applied to `plan.md` (prompt text, Critical Implementation Details note, Phase 1 contract/success-criteria, Progress 1.3, Desired End State, "What We're NOT Doing") and `plan-brief.md` (What & Why, Key Decisions, Open Risks).

### F2 — Accept-call failure path unspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Generation island
- **Detail**: The Contract describes what happens when Accept succeeds, but never says what happens when `POST /api/flashcards/accept` fails — does the card stay in the list, is there an error toast, can the user retry? No mention either of disabling that card's buttons while the request is in flight, unlike the established `deleting` state pattern already in `DeleteFlashcardDialog.tsx` for this exact kind of async per-item action.
- **Fix**: Add one sentence to the Phase 3 Contract: on accept failure, keep the proposal in the list, show an error toast (reusing `apiRequest`'s throw-and-catch idiom), and set a per-proposal `accepting` flag (mirroring `DeleteFlashcardDialog`'s `deleting` state) to disable that card's buttons and show a spinner while in flight.
- **Decision**: FIXED. Applied to `plan.md` Phase 3 §3 Contract.

### F4 — Dangling "per the questioning above" reference

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State Analysis (2 bullets)
- **Detail**: Two bullets end with "(per the questioning above" / "see questioning above: ..." — referring to the planning session's Q&A rounds, which aren't captured anywhere inside plan.md. A reader (human or `/10x-implement`) with only this file has nothing "above" to follow; the rationale is already stated in the same sentence regardless.
- **Fix**: Remove both dangling references — the surrounding sentences already carry the rationale without them.
- **Decision**: FIXED. Applied to `plan.md` Current State Analysis (2 bullets).

### F5 — droppedCount computed but never consumed

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §1 (types) / Phase 3 (generation island)
- **Detail**: `GenerateFlashcardsResponse.droppedCount` (Phase 1 §1) is computed specifically to report proposals dropped by validation, but Phase 3's island Contract never says what the UI does with it — as written, an implementer has no instruction to surface it, so it's likely to be silently ignored. That's the exact scenario the field exists to make visible.
- **Fix**: Add one line to the Phase 3 Contract: when `droppedCount > 0` after a successful generate call, show an informational toast (e.g. "N flashcards generated — M skipped due to formatting issues").
- **Decision**: FIXED. Applied to `plan.md` Phase 3 §3 Contract.

### F3 — RPC-style action endpoints vs. the existing REST resource pattern

- **Severity**: ⚪ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — API Routes
- **Detail**: `/api/flashcards/generate` and `/api/flashcards/accept` are RPC-style verb endpoints, a different flavor from `index.ts`/`[id].ts`'s resource-oriented convention (HTTP method conveys the action). This was a deliberate, reasoned choice from the Q&A round (to keep `source: 'ai'` unspoofable via the manual-create path), not an oversight — flagging only so it reads as intentional to whoever implements or later reviews it.
- **Fix**: Optional — a one-line note in Implementation Approach that these two routes are intentionally RPC-style, not REST-resource-style.
- **Decision**: FIXED. Applied to `plan.md` Implementation Approach.
