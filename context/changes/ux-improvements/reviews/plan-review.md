<!-- PLAN-REVIEW-REPORT -->
# Plan Review: UX Improvements (S-04)

- **Plan**: context/changes/ux-improvements/plan.md
- **Mode**: Deep
- **Date**: 2026-08-28
- **Verdict**: REVISE (light — wording/decision fixes, no restructuring)
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

13/13 paths ✓, 6/6 symbols ✓, brief↔plan ✓, Progress format ✓ (one `## Progress`, 6 `### Phase N` matching body, no stray checkboxes in phase bodies). Blast radius: `listFlashcards` called only from `src/pages/api/flashcards/index.ts:28`; `FlashcardListResponse` consumed only by `FlashcardDeck.tsx` + service + `types.ts`. No test asserts on the English schema strings (only `src/lib/fsrs/scheduler.test.ts` exists). Middleware sets `context.locals.user` unconditionally (`middleware.ts:13,15`) — Phase 5's `index.astro` redirect will have `Astro.locals.user` available.

## Findings

### F1 — "Blocked submit reveals errors" path is unreachable

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — items 1 & 2, manual check 2.6
- **Detail**: Phase 2 says the fix "mirrors SignInForm" and that `handleSubmit` / the generate handler "sets all flags true before the parsed.success check" so a blocked submit reveals all errors. But the plan also keeps `disabled={!parsed.success || submitting}` on the submit button (`FlashcardForm.tsx:117`) and generate button (`FlashcardGenerator.tsx:212`). With the button disabled on an invalid form, `handleSubmit` never fires for an invalid form — the touched-setting in it is dead code and `onBlur` is the only reveal path. SignInForm, the cited reference, keeps its button *enabled* and calls `e.preventDefault()` on failed `validate()`; that divergence is unstated. Implemented literally, a first-time user opening "Nowa fiszka" sees a dead disabled button with no hint why (today's eager error at least says "Question is required").
- **Fix A ⭐ Recommended**: Keep buttons disabled, drop the handleSubmit touched-setting; rely purely on `onBlur`.
  - Strength: Smallest change; no new enabled/disabled behavior; blur covers the empty-required-field case the bug is about.
  - Tradeoff: A user who never focuses a field still sees a disabled button with no inline error — mitigated by char counters + visibly empty fields.
  - Confidence: HIGH — matches retained button behavior; minimal surface.
  - Blind spot: None significant.
- **Fix B**: Enable the buttons, reveal all errors on invalid submit (true SignInForm parity) — drop `!parsed.success` from `disabled` (keep `submitting`), set all `touched` true in the handler and bail if invalid.
  - Strength: Faithful to the cited pattern; explicit reason on submit; consistent with auth forms.
  - Tradeoff: New behavior for these two forms; slightly more code; handler must not fire the API call on invalid state.
  - Confidence: HIGH — SignInForm proves the pattern in this repo.
  - Blind spot: `FlashcardForm` is reused in the AI edit-before-accept dialog (`FlashcardGenerator.tsx:322-348`) — verify an enabled button doesn't let an empty proposal edit be accepted.
- **Decision**: PENDING

### F2 — `{ count: "exact" }` anchored without verifying the `.overrideTypes()` interaction

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — item 2
- **Detail**: The service chains `.range(...).overrideTypes<FlashcardRow[], { merge: false }>()` and destructures only `const { data, error }` (`flashcards.ts:59-62`). Phase 3 states as settled fact that adding `{ count: "exact" }` to `.select()` yields a usable `count` in the return (`total: count ?? 0`) — but doesn't note that `count` must be added to the destructure, nor that `.overrideTypes()` between `.select()` and the `await` must still surface `count` on the typed response (supabase-js `^2.x`). `context/foundation/lessons.md` has an accepted rule: verify external-library option shapes against the installed version before a plan anchors them. Runtime is covered by manual check 3.5 and types by the build, so the risk is small — but the plan reads as already verified.
- **Fix**: In Phase 3 item 2, change the destructure to `const { data, error, count }` and add a one-line note: "confirm `count` is populated with `.overrideTypes()` in the chain against the installed supabase-js version; if it strips the `count` type, move `.overrideTypes()` off this query or cast." Manual check 3.5 already validates the runtime value.
- **Decision**: PENDING

### F3 — Schema-message source left ambiguous, undermining the single-catalog decision

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — item 3
- **Detail**: Item 3 hedges: "prefer importing `t` if lint allows it in this module ... duplicated literal is acceptable here". Duplicating the 6 validation strings between `src/lib/i18n.ts` and `src/lib/schemas/flashcard.ts` reintroduces the drift the central catalog exists to prevent. Both files are plain `src/lib` TS with no shown edge/bundle constraint — no real blocker to the import.
- **Fix**: Commit to importing `t` from `@/lib/i18n` into the schema module; drop the "duplicated literal is acceptable" clause.
- **Decision**: PENDING

### F4 — `history.replaceState` vs `pushState` not stated as a deliberate choice

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 — item 2
- **Detail**: Phase 4 uses `history.replaceState` for page/size changes. Consequence: the browser Back button does not step back through visited pages — from page 3 it leaves `/flashcards` entirely. Defensible default, but the plan presents the choice without noting the alternative.
- **Fix**: Add one line to Phase 4 item 2 recording that `replaceState` is deliberate (list pagination is not navigation history) — or switch to `pushState` if Back-through-pages is wanted.
- **Decision**: PENDING

### F5 — "Every string Polish" has an undocumented Supabase-error hole

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Desired End State vs Phase 1 item 7
- **Detail**: Desired End State: "Every user-facing string renders in Polish." Phase 1 item 7 leaves raw Supabase `error.message` passthrough (`signin.ts:11,16`, `signup.ts:11,16`) as-is — a wrong-password error on the first screens a new user sees stays English. Reasonable cut, but buried in a phase note rather than declared.
- **Fix**: Add a bullet to "What We're NOT Doing": Supabase auth provider error text (invalid credentials, etc.) stays English — no provider-message mapping layer in this slice.
- **Decision**: PENDING

### F6 — Starter favicon survives the branding pass

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 5 — items 2 & 6
- **Detail**: Phase 5 rebrands the title, `package.json` name, and README, but `public/favicon.png` (starter icon, referenced `Layout.astro:19`) and the unused `public/template.png` are untouched. The user asked to move the landing off the starter "design, treści" — the tab icon is part of that surface.
- **Fix**: Add favicon replacement to Phase 5 (or an explicit "favicon deferred" line), and delete `public/template.png`.
- **Decision**: PENDING

### F7 — Phase 1 English-sweep gate goes stale after Phases 4 & 5

- **Severity**: ◽ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phases 1 / 4 / 5, check 1.4
- **Detail**: `FlashcardDeck.tsx` is translated in Phase 1 then substantially rewritten in Phase 4 (new controls need new strings: "Poprzednia", "Następna", "Wierszy na stronę"…). `Welcome.astro` / `Topbar.astro` / `dashboard.astro` are translated in Phase 1 then reworked in Phase 5. Phases 4 and 5 *add* catalog keys, so the "no English literals" grep (1.4) is not final until after Phase 5.
- **Fix**: Note in Phases 4 and 5 that new user-facing strings go through `src/lib/i18n.ts`, and re-run the 1.4 grep as part of Phase 5's automated checks.
- **Decision**: PENDING
