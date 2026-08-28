<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: UX Improvements (S-04)

- **Plan**: context/changes/ux-improvements/plan.md
- **Scope**: Phases 1–6 of 6 (full plan)
- **Date**: 2026-08-28
- **Verdict**: NEEDS ATTENTION → triaged 2026-08-28 (5 fixed, 1 skipped)
- **Findings**: 0 critical, 2 warnings, 4 observations

## Triage outcome (2026-08-28)

- **F1** FIXED (Fix A) — plan Phase 6 addendum note added
- **F2** FIXED — `search` dropped from `pageHref` / `writeListParams`
- **F3** FIXED — pagination a11y strings localised; unused `PaginationPrevious`/`Next` removed
- **F4** FIXED — roadmap S-04 → `done`; README tagline rewritten
- **F5** FIXED — clamp no longer flashes the empty state
- **F6** SKIPPED — pre-existing `tsc` noise, not CI-gated; separate cleanup

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

**Overall: NEEDS ATTENTION** — every planned change landed as described and all automated criteria are green; the three warnings are all LOW-effort and none blocks archive. This is a clean, faithful implementation of a six-phase plan.

### Automated verification (re-run at review time)

- `npm run lint` — pass (1 pre-existing unrelated `no-console` warning in `src/lib/api-helpers.ts`)
- `npm run build` — pass (Cloudflare SSR)
- `npm run test` — 6/6 FSRS tests pass
- `grep -rE "IntersectionObserver|loadingMore|nextOffset" src/` — nothing
- English-literal sweep — only the documented `AlertDialogPrimitive.Cancel` shadcn API-name exception
- `grep -rn "/dashboard" src` — only the `middleware.ts` entry + redirect-stub comment
- `grep 0f1529 src` — nothing
- `@supabase/postgrest-js` 2.105.3 installed (lockstep with supabase-js) — verified in `node_modules`: `count` is parsed from the `content-range` header for `Prefer: count=exact` and is the total across all pages with `.range()`; `.overrideTypes()` is a runtime no-op. Matches the verification comment in `flashcards.ts:69-70`.

### Implementation exceeded the plan (positive)

- `listFlashcards` added a `buildFlashcardsListQuery` helper + a `416 / PGRST103` fallback (count-only re-query) so an overshoot offset returns `{ items: [], total }` instead of throwing — this is what actually makes manual-check 3.6 pass; the plan's naive `return` would have thrown.
- `FlashcardDeck` fetch effect uses an `AbortController` race guard on page/size/search change — beyond the plan's contract, correct.
- `readListParams` sanitises `?page` (non-integer / <1 / `Infinity` → 1) and `?size` (not in {10,20,50} → 10); API adds defense-in-depth via zod. `?page=999` clamps and terminates (no loop).
- Both `lessons.md` priors honoured: PostgREST filter-metachar escaping retained (`flashcards.ts:57`); library option shape verified against the installed version.
- `touched` gate is safe: submit stays hard-gated by live `parsed.success` (button `disabled` + `handleSubmit` early-return), so hidden errors can't be bypassed.
- `ustawienia.astro` follows the established page shell (`bg-cosmic` + `max-w-3xl` + `Topbar` + gradient `<h1>`) — more consistent with the other pages than the old centered `dashboard.astro` was.
- `eslint.config.js` disabling `@typescript-eslint/no-misused-promises` for `.astro` (Progress note 5.1): confirmed justified — the rule *crashes* on a top-level `return Astro.redirect()` under `astro-eslint-parser`, which a line-level disable cannot dodge; `.ts`/`.tsx` keep the rule.

## Findings

### F1 — Flashcards list page lost its Review / Generate CTAs, in a phase scoped to exclude layout changes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/flashcards/index.astro (removed in commit 6a18ffd, Phase 6)
- **Detail**: Phase 1 (§7) translated the "Review" / "Generate with AI" header buttons in place and added `t.flashcardsPage.reviewLink` / `generateLink`. Phase 6 — contract: "Targeted className adjustments only … No structural/layout changes" — deleted both buttons, the header flex wrapper, and those two catalog keys. The commit message justifies it ("they duplicated the Topbar nav"), which is defensible: the Topbar still carries `Fiszki / Generuj / Powtórka`. But it is a user-visible product-surface change the plan never sanctioned, made in the one phase explicitly scoped to exclude layout changes. The prominent primary "Generuj z AI" CTA (Sparkles icon, `bg-purple-600`) — a deliberate element from the S-01/S-03 slices — is now only a small top-nav text link.
- **Fix A ⭐ Recommended**: Accept as an intentional simplification — add a one-line note to the plan's Phase 6 section (or "What We're NOT Doing") recording that the flashcards-page header CTAs were removed as Topbar-nav duplication.
  - Strength: Preserves the shipped state; puts the deviation on record before archive.
  - Tradeoff: Plan becomes a slightly moving target; the AI-generate flow loses its high-emphasis entry point with no explicit product sign-off.
  - Confidence: HIGH — the removal is coherent and the nav genuinely covers the routes.
  - Blind spot: Whether generate-flow discoverability measurably drops for new users hasn't been assessed.
- **Fix B**: Restore the two buttons (translated, re-adding the two catalog keys) in the flashcards page header.
  - Strength: Keeps the plan literal and the deliberate AI-generate CTA from earlier slices.
  - Tradeoff: Reinstates nav duplication the implementer intentionally cleared.
  - Confidence: MED — trivial revert of the `index.astro` hunk.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — plan Phase 6 gained a "#### 4. Header CTA cleanup (addendum)" note recording the removal.

### F2 — Shareable pagination URLs advertise a `search` filter they don't apply

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/flashcards/FlashcardDeck.tsx:85-93 (`pageHref`), :58-68 (`readListParams`), :72-80 (`writeListParams`)
- **Detail**: `pageHref()` embeds `search=<term>` into every pagination link's real `href` (its docstring calls this "the shareable URL for a given page"). But `readListParams()` parses only `page` / `size`, and `searchInput` always initialises to `""`. Opening a pagination link in a new tab — or reloading — while a search is active therefore renders page N of the **unfiltered** deck, and `writeListParams` then re-persists the now-misleading `search=…` in the address bar. The stated "every page has a shareable URL" feature is half-implemented. Against the *written* plan contract this is within bounds (Desired End State promised only `?page`/`?size` round-trip, and "same page" = same page number, which holds), so the defect is the internal inconsistency, not a missed requirement. Related, lower-probability: `apiRequest` awaits `res.json()`, which `controller.abort()` does not cancel, so a response resolving in the gap between abort and the superseding fetch rejecting can still call `setState` — pre-existing exposure, not a regression.
- **Fix**: Drop `search` from `pageHref` / `writeListParams` so the URL never promises a filter it won't apply (smaller, matches plan scope) — or parse `search` in `readListParams` and seed `searchInput` + `debouncedSearch` from it for a true round-trip. Optionally add a request-generation guard in `load()` (`if (abortControllerRef.current !== controller) return` before each `setState`).
- **Decision**: FIXED via "drop search param" — `pageHref` no longer builds `search=`, its signature dropped the arg (3 call sites updated), and `writeListParams` now `params.delete("search")`. Lint clean. The optional `res.json()` race guard was not applied (pre-existing, out of scope).

### F3 — shadcn generated primitives: untranslated a11y strings + non-canonical Select default

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ui/pagination.tsx:10 (`aria-label="pagination"`, rendered), :49-76 (unused `PaginationPrevious`/`PaginationNext` with hardcoded "Previous"/"Next"/"Go to previous page"), :77-88 (`PaginationEllipsis` `<span className="sr-only">More pages</span>`, rendered at FlashcardDeck.tsx:410); src/components/ui/select.tsx:48
- **Detail**: The `<nav aria-label="pagination">` landmark label and the "More pages" sr-only text render on the fully translated `/flashcards` page in English. The plan said "No manual edits beyond what generation produces" for these files, so the implementer followed *that* instruction — but "Every user-facing string renders in Polish" (Desired End State) reasonably includes assistive-tech text. Separately, `SelectContent` defaults `position="item-aligned"` where canonical shadcn uses `"popper"` — functional, but it leaves the `position === "popper"` style branches as dead code.
- **Fix**: Pass a Polish `aria-label` where `<Pagination>` is instantiated in `FlashcardDeck`; localise (or call-site-override) `PaginationEllipsis`'s sr-only text; delete the unused `PaginationPrevious`/`PaginationNext` exports. Leave `select.tsx` as-is or reset its default to `"popper"`.
- **Decision**: FIXED — `t.deck.paginationLabel` ("Paginacja") passed at the `<Pagination>` call site; `PaginationEllipsis` sr-only → "Więcej stron"; `PaginationPrevious`/`PaginationNext` + their chevron imports deleted from `pagination.tsx`. `select.tsx` left as-is. Lint + build clean.

### F4 — Roadmap slice + README brand line lag the shipped state

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/foundation/roadmap.md:39 (S-04 row = `in-progress`), :141 (Stream status = `in-progress`); README.md:3
- **Detail**: `change.md` is correctly `status: implemented` and all six phases + the epilogue commit landed, but the roadmap table row and stream status for S-04 still read `in-progress`. Normally flipped to `done` at archive time, so not blocking — flagged so `/10x-archive` picks it up. Separately, `README.md:3` still reads "A modern, opinionated starter template for building fast, accessible web applications." directly under the new `# 10xCards` heading (outside the plan's `:1` / `:148` line-scope, now self-contradictory).
- **Fix**: At archive, set S-04 to `done` in `roadmap.md` (row + Stream status); replace the stale README tagline with a 10xCards one-liner.
- **Decision**: FIXED — roadmap.md S-04 "At a glance" row + Stream status both flipped to `done`; README.md:3 rewritten to a 10xCards one-liner.

### F5 — Brief empty-state flash when the initial `?page=` overshoots the deck

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/flashcards/FlashcardDeck.tsx:171-199 (load effect)
- **Detail**: On an out-of-range initial page the 416 branch returns `{ items: [], total }`, `finally` sets `loading = false`, and React paints one frame with `loading === false && flashcards.length === 0` — the "Nie masz jeszcze żadnych fiszek" empty state — before the clamp (`page > lastPage → setPage(lastPage)`) triggers the refetch that flips `loading` back to true. Only hits hand-edited / stale deep links.
- **Fix**: Guard the empty-state branch on `page <= totalPages`, or skip `setLoading(false)` when the response triggers a clamp.
- **Decision**: FIXED — `load()` sets a local `clamping` flag before `setPage(lastPage)`; the `finally` now skips `setLoading(false)` while a clamp refetch is pending, so the skeleton holds instead of flashing the empty state.

### F6 — Pre-existing `tsc` errors in the services layer (not introduced here)

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/services/flashcards.ts:121, :151; src/lib/services/flashcard-reviews.ts:145
- **Detail**: `tsc --noEmit` reports errors on `createFlashcard` / `createAiFlashcard` (`.single().overrideTypes<FlashcardRow, { merge: false }>()` unions with postgrest-js's "Type mismatch" sentinel) and in `flashcard-reviews.ts` (not in this changeset). These lines are **unchanged** by S-04, and the new array-typed `listFlashcards().overrideTypes<FlashcardRow[], …>()` adds no new error. Project gates are `eslint` + `astro build` (both pass), not `tsc`, so this is not an S-04 regression — noting it for a separate cleanup.
- **Fix**: Separate task — narrow or cast the `.single().overrideTypes()` return in the two `create*` helpers; out of scope for this change's archive.
- **Decision**: SKIPPED — pre-existing, not gated by CI (eslint + build), left for a separate cleanup task.
