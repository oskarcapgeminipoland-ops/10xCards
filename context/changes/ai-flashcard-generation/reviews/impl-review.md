<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI Flashcard Generation Implementation Plan

- **Plan**: context/changes/ai-flashcard-generation/plan.md
- **Scope**: Phase 3 of 3 (full plan — all phases complete)
- **Date**: 2026-08-26
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Unplanned file: flashcard-generation-parse.ts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/services/flashcard-generation-parse.ts (new, not in plan's Phase 1 file list)
- **Detail**: The plan's Phase 1 contract puts the entire parse/validate/cap pipeline inside `src/lib/services/flashcard-generation.ts`. During implementation this was split into a sibling pure-function file (`flashcard-generation-parse.ts`, exporting `stripCodeFence` and `parseGeneratedContent`) so it could be unit-tested standalone without pulling in `astro:env/server` via `openrouter.ts`. Combined behavior of the two files was verified identical to the plan's contract (confirmed by the drift-detection sub-agent). This is also exactly what the plan's own Testing Strategy section recommends: *"stripCodeFence and the per-item validation/cap logic ... are the highest-value first targets (pure functions, no I/O)"* — the extraction just did that separation proactively instead of leaving it for later.
- **Fix**: Add a short addendum note to the plan's Phase 1 section (or a "Post-implementation notes" subsection) documenting the extraction and its rationale, so the plan stays an accurate record of what shipped.
- **Decision**: FIXED — addendum added to plan.md Phase 1 (item 3, Generation service)

### F2 — Unplanned file: Topbar.astro nav link

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/Topbar.astro:19-24 (not in plan's Phase 3 file list)
- **Detail**: The plan's Phase 3 contract only specifies a CTA button on `/flashcards` (`index.astro`) as the entry point to the new generation page. During manual verification, the user reported the button wasn't discoverable ("nie widzę w menu nowej pozycji") — they'd typed the URL manually. A "Generate" link was added to the persistent `Topbar.astro` nav (visible on every page: Dashboard, Flashcards, Sign out) alongside the original button, addressing the live UX feedback. The user confirmed afterward it now works well.
- **Fix**: Add a short addendum note to the plan's Phase 3 section documenting the Topbar addition and the discoverability rationale that drove it.
- **Decision**: FIXED — addendum added to plan.md Phase 3 (item 2, Entry point from the deck page)

### F3 — Unused type: GenerateFlashcardsRequest

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/types.ts (GenerateFlashcardsRequest interface)
- **Detail**: `GenerateFlashcardsRequest` is defined per the plan's contract but never imported/used — the API route re-validates via `generateRequestSchema` (zod) directly, and `FlashcardGenerator.tsx` builds the JSON body inline (`JSON.stringify({ sourceText })`) without referencing the type. Harmless dead export, not a defect.
- **Fix**: Use it to type the request body in `FlashcardGenerator.tsx`'s `runGenerate` (e.g. `JSON.stringify({ sourceText } satisfies GenerateFlashcardsRequest)`), giving the exported type an actual call site instead of leaving it unused.
- **Decision**: FIXED — `satisfies GenerateFlashcardsRequest` added to the request body in `runGenerate` (FlashcardGenerator.tsx)

### F4 — Cosmetic race: regenerate while a proposal is being accepted

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/flashcards/FlashcardGenerator.tsx:126 (handleGenerateClick)
- **Detail**: `handleGenerateClick` blocks re-triggering while `phase === "generating"` but doesn't check whether an accept request is still in flight (`acceptingIds.size > 0`) before allowing "Generate again" to clear the proposal list. If a user regenerates while a proposal's accept call is still pending, that accept still completes and persists correctly server-side (the source of truth), but the card disappears from the UI mid-flight and the eventual success toast fires against an already-replaced list. No data loss or corruption — purely a UI-timing cosmetic.
- **Fix**: Also guard `handleGenerateClick`/disable the Generate button while `acceptingIds.size > 0`, if this edge case is worth tightening.
- **Decision**: FIXED — `handleGenerateClick` guard and the Generate button's `disabled` prop both now also check `acceptingIds.size > 0`
