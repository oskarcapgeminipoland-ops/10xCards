# UX Improvements (S-04) — Plan Brief

> Full plan: `context/changes/ux-improvements/plan.md`

## What & Why

A polish pass over the UI shipped in S-01–S-03. Six issues surfaced during that work: the interface is all English (users are Polish-speaking language learners), the two flashcard forms show validation errors before the user types anything, the flashcard list has no pagination, `/dashboard` is a mislabelled empty stub, the landing page is still the "10x Astro Starter" template with no logged-in/logged-out distinction, and the background is an unrelentingly dark near-black. None of this blocks new features, but it degrades first impressions in exactly the flows that test the product's core hypothesis.

## Starting Point

S-01–S-03 delivered `/flashcards` (deck CRUD + search), `/flashcards/generate` (AI generation), and `/flashcards/review` (SRS session) as React islands on Astro SSR pages, plus a shared `Topbar`. There is no i18n layer — every string is an inline English literal across ~18 files, including the zod messages that also serve as API error payloads. The list uses infinite scroll (`IntersectionObserver`, `PAGE_SIZE=20` hardcoded); its API returns `{ items, nextOffset }` with no total count. The landing page (`index.astro` → `Welcome.astro`) is the unmodified starter. The dark look comes from a single `bg-cosmic` gradient utility plus hardcoded `text-white`/`bg-white/N` classes; the shadcn light/dark token system is present but inert.

## Desired End State

The whole UI is Polish (`lang="pl"`, tab title `10xCards`), copy owned by one typed catalog. The flashcard forms show no error until a field is blurred empty or a submit is blocked. `/flashcards` paginates: 10 per page by default, a 10/20/50 selector, `« Poprzednia / 1 2 3 / Następna »`, with `?page=` and `?size=` in the URL so a view survives reload and link-sharing. The nav reads **Ustawienia** and opens `/ustawienia`, a page with a real account panel; `/dashboard` redirects there. Logged-in users hitting `/` go straight to `/flashcards`; logged-out users see a branded 10xCards hero. The background is a lighter, warmer tone with all text still legible.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| i18n structure | Central typed `pl` catalog in `src/lib/i18n.ts`, no library | One reviewable place for all copy; matches the "spójność" ask without a framework for a single-locale product | Plan |
| Zod messages | Translated in the schema | Schema feeds both UI and API — one source keeps them consistent; Polish API errors are fine for a Polish-only product | Plan |
| Validation timing | Error shows on blur or blocked submit, per-field `touched` gate | Timely feedback without accusing the user on mount; mirrors the existing `SignInForm` pattern | Plan |
| Copy scope | Everything user-facing (~18 files, incl. auth + review) | Matches "cały tekst… po polsku" literally | Plan |
| Pagination model | Classic numbered pages + 10/20/50 selector, replacing infinite scroll | Delivers "paginacja" literally; the size selector has a natural home | Plan |
| Pagination state | `?page=&size=` in the URL via `history.replaceState` | Reload- and link-safe; fits the project's deliberate-URL-routing standard | Plan |
| Size persistence | None — URL param only | Spec only asks for it to be changeable; the URL already makes a choice shareable | Plan |
| List API contract | Keep `offset`/`limit`, add `total`, drop `nextOffset` | Minimal delta — existing `.range()` query stays, add `{ count: "exact" }` | Plan |
| Settings rename | Label + route → `/ustawienia` + minimal "Konto" panel + `/dashboard` redirect | URL and label agree; page stops looking like a leftover stub | Plan |
| Landing (logged-in) | Redirect `/` → `/flashcards` | Simplest; returning users land where they work, no second layout to maintain | Plan |
| Theme direction | Lighter warm gradient replacing `bg-cosmic`, keep light-on-dark | Low-risk, meets "jaśniejsze, mniej smutne" literally; avoids a full redesign of every island | Plan |

## Scope

**In scope:**
- `src/lib/i18n.ts` catalog; full Polish sweep of nav, all 8 pages, auth islands, flashcards islands, zod messages; `lang="pl"`; `10xCards` title + `<meta description>`
- Per-field `touched` gate in `FlashcardForm` and `FlashcardGenerator`
- List endpoint returns `total`; `limit` default 10
- shadcn `pagination` + `select`; `FlashcardDeck` rebuilt around numbered pages + URL state
- `/` auth redirect; rebranded `Welcome.astro` hero
- `/ustawienia` route (reworked `dashboard.astro`) + `middleware.ts` + `/dashboard` redirect + `Topbar` label
- Lighter `bg-cosmic`, aligned dialog surfaces, contrast audit

**Out of scope:**
- i18n library / locale switching / keeping English
- Form-library migration; changes to validation *rules*
- `page`/`pageSize` API params; page-size persistence
- Full light-mode redesign; light/dark toggle
- Real settings features (password, profile, delete account)
- `og:image` asset; new test runner or component/API tests
- DB migration, RLS, SRS/review logic changes

## Architecture / Approach

Six sequential phases, each independently lint/build-clean and committable: (1) create the full catalog, then swap literals file-by-file; (2) isolated validation gate; (3) data layer — schema default + `count` + type; (4) UI — new shadcn primitives, `FlashcardDeck` drops the observer and reads `?page`/`?size`, fetching one page and clamping to `total`; (5) landing redirect + hero rewrite + route rename touching `middleware.ts`; (6) recolour the single `bg-cosmic` utility and walk every screen for washed-out low-opacity text. Riskiest cross-cutting change (copy) goes first on an unchanged UI; the theme audit goes last so contrast is checked against final copy and layout.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. i18n foundation + Polish sweep | `src/lib/i18n.ts` + every string translated, `lang="pl"`, `10xCards` title | Large surface (~18 files); a missed literal or a half-populated catalog fails type-checked lint |
| 2. Deferred form validation | No premature errors; blur/submit-gated errors on both flashcard forms | Getting the touched/clear interaction right for the edit (pre-filled) case |
| 3. Pagination — data layer | List endpoint returns `total`; default page size 10; `nextOffset` gone | `{ count: "exact" }` + `.range()` off-by-one; confirming no other `nextOffset` consumer |
| 4. Pagination — UI | Numbered pages + 10/20/50 selector + `?page=&size=` URL state, infinite scroll removed | URL↔state sync, page clamping, search/size resets, delete-on-last-page edge case |
| 5. Landing redesign + settings rename | Auth-aware `/`, branded hero, `/ustawienia` with account panel, `/dashboard` redirect | Route rename must update `middleware.ts` or the new page 404s / leaks |
| 6. Lighter background pass | Lighter warm ground; contrast fixes across all screens | Low-opacity `text-blue-100/50` / `bg-white/5` washing out on the lighter ground |

**Prerequisites:** F-01 (done). No blockers.
**Estimated effort:** ~5–6 sessions, roughly one per phase, within the after-hours MVP budget.

## Open Risks & Assumptions

- The copy sweep touches auth and review code this slice otherwise wouldn't — larger diff, small chance of an incidental regression in those flows (mitigated by keeping changes string-only).
- `?page`/`?size` URL state is a new pattern in this codebase (search itself isn't in the URL); the island must keep URL and state in sync without triggering redundant fetches.
- Lightening one gradient utility recolours every page at once; the real work is auditing ~13 files of hardcoded translucent-white classes for contrast, which is judgement-based and easy to under-do.
- No component/API test runner means Phases 2–5 rely on manual verification; the plan lists explicit manual steps per phase.
- `FlashcardListResponse` shape change assumes `FlashcardDeck` is its only consumer (verified by the research pass; re-grep before deleting `nextOffset`).

## Success Criteria (Summary)

- A Polish-speaking user sees no English anywhere and no validation error until they actually interact with a field.
- The flashcard deck paginates in pages of 10 (switchable to 20/50), and a paginated view can be reloaded or shared via its URL.
- The landing page reflects 10xCards and differs for logged-in vs logged-out users; the nav says "Ustawienia" and leads to a real page; the app background is visibly lighter with all text legible.
