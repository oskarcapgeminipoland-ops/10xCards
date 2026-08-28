# UX Improvements (S-04) Implementation Plan

## Overview

A polish pass over the UI shipped in S-01–S-03. Six workstreams: (1) translate the entire UI to Polish behind a central catalog, (2) stop the two flashcard forms from showing validation errors before the user touches them, (3–4) replace the flashcard list's infinite scroll with classic numbered pagination (default 10 per page, switchable to 20 / 50), (5) redesign the landing page as branded + auth-aware and rename `/dashboard` → `/ustawienia` with real content, (6) lighten the "sad black" background. No backend/data-model behaviour changes beyond adding a row count to the list endpoint.

## Current State Analysis

- **No i18n infrastructure.** `lang="en"` is hardcoded at `src/layouts/Layout.astro:15`; the default `<title>` is `"10x Astro Starter"` at `src/layouts/Layout.astro:11`. Every user-facing string is an inline English literal across ~18 files: `src/components/Topbar.astro`, `src/components/Welcome.astro`, all 8 `.astro` pages, the auth islands (`SignInForm`, `SignUpForm`, `FormField`, `PasswordToggle`, `ServerError`, `SubmitButton`), the flashcards islands (`FlashcardDeck`, `FlashcardForm`, `FlashcardGenerator`, `DeleteFlashcardDialog`, `ReviewSession`), and the zod messages in `src/lib/schemas/flashcard.ts` (which are rendered in the UI *and* returned in API error payloads). `src/lib/config-status.ts` messages are already Polish.
- **Premature validation.** `src/components/flashcards/FlashcardForm.tsx:34-40` and `src/components/flashcards/FlashcardGenerator.tsx:87-88` run `zod.safeParse` in a `useMemo` on every render with no `touched` / `submitted` gate. On mount the field is `""`, `.min(1)` fails, and the error string + red border render immediately (`FlashcardForm.tsx:78-80`, `:100-102`; `FlashcardGenerator.tsx:202-207`). `src/components/auth/SignInForm.tsx:16-40` is the correct deferred pattern already in the repo: `errors` starts `{}`, `validate()` runs only from `handleSubmit`, and `clearError(field)` wipes a field's error on change.
- **List is infinite scroll.** `src/components/flashcards/FlashcardDeck.tsx:13` hardcodes `PAGE_SIZE = 20`. It fetches pages via `fetchPage(offset, search, mode)` (`:88`), appends them (`mode: "append"`, `:102`), and loads more through an `IntersectionObserver` on a sentinel div (`:133-156`, `:296`). No page-number UI, no page-size control, no URL state — search text and scroll position are pure React state, lost on reload.
- **List API returns no count.** `GET /api/flashcards` (`src/pages/api/flashcards/index.ts:12-30`) parses `flashcardListQuerySchema` (`src/lib/schemas/flashcard.ts:17-21`: `search?`, `offset` default 0, `limit` default 20 / max 50) and returns `listFlashcards(...)`'s `{ items, nextOffset }` (`src/types.ts:36-40`). The service (`src/lib/services/flashcards.ts:45-74`) uses `.range(offset, offset + limit)` (deliberate +1 over-fetch to peek for a next page) and does **not** request `{ count: "exact" }`.
- **`/dashboard` is a stub.** `src/pages/dashboard.astro` renders `<h1>Dashboard</h1>`, "Welcome, {email}", the text "This page is only for authenticated users.", and a sign-out button — no settings controls. It is linked only from `src/components/Topbar.astro:13-15` and is a protected-route prefix in `src/middleware.ts:4` (`PROTECTED_ROUTES = ["/dashboard", "/flashcards"]`, matched by `startsWith` at `:18`).
- **Landing = unmodified starter.** `src/pages/index.astro` (8 lines) renders `<Welcome />` with no `Astro.locals.user` check. `src/components/Welcome.astro` shows a cosmic hero `<h1>10x Astro Starter</h1>` (`:32-36`), a starter tagline (`:37-40`), Sign In / Sign Up buttons (`:42-54`), and three starter feature cards (`:58-125`). A logged-in user sees the same "Sign In / Sign Up" hero; only the embedded `<Topbar>` differs. `<head>` has no `<meta name="description">` or OG tags. `package.json:2` name is `"10x-astro-starter"`.
- **"Sad black" background.** `src/styles/global.css:113-115` defines `@utility bg-cosmic { background-image: linear-gradient(to bottom, #0a0e1a, #0f1529, #0a0e1a); }`, applied on every page's outer `<div>` plus hardcoded `text-white` / `bg-white/5` / `bg-white/10` / `text-blue-100/*` / `border-white/10` across ~13 files, plus `bg-[#0f1529]` dialog surfaces (`FlashcardGenerator.tsx:39,351`, `FlashcardDeck.tsx:16`, `DeleteFlashcardDialog.tsx:46`). The shadcn light/dark token system in `global.css:6-73` is inert — no `ThemeProvider`, nothing ever sets `class="dark"`.
- **Tooling.** `zod ^4.4.3`; no `react-hook-form`. `npm run lint` (type-checked ESLint), `npm run build` (Cloudflare SSR), `npm run test` (Vitest, scoped to `src/lib/fsrs/` only — no component/API test integration). shadcn "new-york", `baseColor: neutral`, `lucide`; add primitives with `npx shadcn@latest add [name]`.

## Desired End State

- Every user-facing string renders in Polish; `<html lang="pl">`; browser tab reads `10xCards`. All copy is defined in one typed catalog (`src/lib/i18n.ts`) and imported by name.
- Opening the "Nowa fiszka" dialog, or the AI generate page, shows **no** validation error and no red field until the user blurs an empty required field or submits. Errors clear as soon as the field becomes valid.
- `/flashcards` shows one page of results (10 by default) with `« Poprzednia | 1 2 3 … | Następna »` controls and a `10 / 20 / 50` page-size selector. `?page=` and `?size=` are in the URL and survive reload / link-sharing. Changing the search box resets to page 1.
- The nav item reads **Ustawienia** and points at `/ustawienia`, a page with a real "Konto" panel (e-mail + wyloguj). `/dashboard` 301/302-redirects there.
- Visiting `/` while logged in redirects to `/flashcards`. While logged out, `/` shows a branded 10xCards hero (value proposition + "Zarejestruj się" / "Zaloguj się"), not the Astro starter.
- The app background is a lighter, warmer tone; all text remains legible (WCAG AA for body text) on every page.

### Key Discoveries:

- Deferred-validation reference pattern already in repo: `src/components/auth/SignInForm.tsx:16-52` (submit-gated `errors` state + `clearError` on change).
- Zod messages are shared UI↔API (`src/lib/schemas/flashcard.ts` reused in `src/pages/api/flashcards/{index,[id],accept}.ts`) — translating them in the schema keeps both consistent (decided).
- `listFlashcards` already uses `.range()`; adding `{ count: "exact" }` to `.select()` is the minimal way to get `total` (`src/lib/services/flashcards.ts:49,61`).
- No `Pagination` / `Select` shadcn component exists yet; `radix-ui` + `lucide-react` are already dependencies so `npx shadcn@latest add pagination select` needs no new peer deps.
- No query-param list state exists anywhere today — `?page`/`?size` is a new pattern; Astro is `output: "server"` so the island manages it with `history.replaceState`.
- Renaming the `/dashboard` route (not just the label) requires updating `src/middleware.ts:4`.
- `src/components/hooks/` does not exist yet, though `CLAUDE.md` says extracted hooks go there.

## What We're NOT Doing

- No i18n library, no locale switching, no English (or any second locale) kept — Polish only, in-place via the catalog.
- No `react-hook-form` / form-library migration — the existing hand-rolled `useState` + `zod.safeParse` stays; only a `touched` gate is added.
- No change to zod *validation rules* (limits, `.min`/`.max` bounds) — only the message strings.
- No new automated test runner or component/API tests (consistent with S-01–S-03); Vitest stays scoped to `src/lib/fsrs/`.
- No switch to `page`/`pageSize` API params — `offset`/`limit` stays.
- No page-size persistence (localStorage/cookie) — the URL param is the only memory.
- No full light-mode redesign and no light/dark toggle — the app stays light-on-dark, just lighter.
- No real settings features (password change, profile, delete account) — the "Konto" panel is e-mail + sign-out only.
- No `og:image` asset creation — a text `<meta name="description">` and correct `<title>` only.
- No changes to auth API behaviour, Supabase schema, RLS, or the review/SRS logic.
- No mapping layer for Supabase auth provider error text — raw `error.message` from `signin.ts` / `signup.ts` (e.g. "Invalid login credentials") stays as returned (English). Everything the app itself renders is translated.

## Implementation Approach

Sequence the six phases so the riskiest cross-cutting change (the copy sweep) lands first on an otherwise-unchanged UI, then the isolated validation fix, then pagination bottom-up (data layer before UI so the UI builds against a real `total`), then the two "chrome" phases (landing/settings, then the theme audit last so contrast is checked against final copy and layout). Each phase is independently lint-clean, build-clean, and committable.

## Critical Implementation Details

- **Catalog keys must exist before components reference them.** Phase 1 creates `src/lib/i18n.ts` in full (all sections) first, then swaps literals file-by-file — a half-populated catalog will fail the type-checked lint.
- **`FlashcardForm` remounts on every dialog open** (`FlashcardDeck.tsx:304-344` mounts it only while `open`), so the `touched` state naturally resets per open — no manual reset needed, but the gate must default to "not touched" so the first render is clean.
- **`FlashcardListResponse` shape change is observed by one consumer only** (`FlashcardDeck.tsx`). Removing `nextOffset` is safe; grep for `nextOffset` before deleting to confirm no other import.
- **Page clamping:** when `?page=` in the URL exceeds `ceil(total / size)` (e.g. after deletions or a hand-edited URL), the UI must clamp to the last valid page rather than showing an empty list.
- **`bg-cosmic` is a single `@utility`** (`global.css:113-115`) — changing it recolours every page at once; the contrast risk is the per-instance `text-blue-100/50` / `bg-white/5` classes that may wash out on a lighter ground, not the gradient itself.

---

## Phase 1: i18n foundation + Polish copy sweep

### Overview

Introduce a central Polish string catalog and replace every user-facing English literal with a catalog reference. Set `lang="pl"` and rebrand the tab title.

### Changes Required:

#### 1. Central string catalog

**File**: `src/lib/i18n.ts` (new)

**Intent**: Single source for all UI copy. A plain typed object, no runtime framework — components do `import { t } from "@/lib/i18n"` and read `t.deck.newButton` etc. Grouped by surface (`common`, `nav`, `landing`, `settings`, `auth`, `deck`, `form`, `generate`, `review`, `delete`, `validation`, `meta`).

**Contract**: `export const t = { … } as const;` — nested `Record<string, string>` (or functions for interpolated strings, e.g. `review.cardCounter: (n, m) => \`Fiszka ${n} z ${m}\``). Every string listed in the research inventory for the files below has a key here. No `default export`.

#### 2. HTML lang + tab title

**File**: `src/layouts/Layout.astro`

**Intent**: Polish document language; brand the default title.

**Contract**: `:15` `<html lang="en">` → `lang="pl"`. `:11` default `title` → `"10xCards"`. Add `<meta name="description" content={...} />` in `<head>` using `t.meta.description`.

#### 3. Zod message translation

**File**: `src/lib/schemas/flashcard.ts`

**Intent**: Translate the six user-visible validation messages in place (they flow to both the forms and API error payloads — intended).

**Contract**: `:13-14` and `:33-34` message args of `.min(1, …)` / `.max(…, …)` on `flashcardInputSchema` and `generateRequestSchema` reference `t.validation.*` (import `t` from `@/lib/i18n` into this module — both are plain `src/lib` TS, no edge/bundle blocker; the catalog is the single source, no duplicated literals). Validation rules unchanged.

#### 4. Navigation

**File**: `src/components/Topbar.astro`

**Intent**: Translate all nav labels for both auth states. (The "Dashboard" → "Ustawienia" label + href change is Phase 5; here just translate the other labels: `Flashcards`, `Generate`, `Review`, `Sign out`, `Not signed in`, `Sign in`, `Sign up`.)

**Contract**: String literals at `:17-47` → `t.nav.*`.

#### 5. Auth islands + pages

**File**: `src/components/auth/SignInForm.tsx`, `SignUpForm.tsx`, `FormField.tsx`, `PasswordToggle.tsx`, `ServerError.tsx`, `SubmitButton.tsx`; `src/pages/auth/signin.astro`, `signup.astro`, `confirm-email.astro`

**Intent**: Translate labels, placeholders, hints, client-side validation strings, button text, aria-labels, page `<title>`s and headings, and the "Don't have an account?" / "Already have an account?" links. Translate the dev/prod copy in `confirm-email.astro:4-33`.

**Contract**: All literals → `t.auth.*` / `t.common.*`. `SignInForm.tsx:18-40` local `validate()` strings and `SignUpForm.tsx` equivalents included.

#### 6. Flashcards islands

**File**: `src/components/flashcards/FlashcardDeck.tsx`, `FlashcardForm.tsx`, `FlashcardGenerator.tsx`, `DeleteFlashcardDialog.tsx`, `ReviewSession.tsx`

**Intent**: Translate every label, placeholder, button, dialog title/description, toast, aria-label, status message, empty/error state, and the `RATING_LABELS` / `STATUS_MESSAGES` arrays.

**Contract**: All literals → `t.deck.* / t.form.* / t.generate.* / t.delete.* / t.review.*`. Interpolated strings (`{n}/500` counters, `"{n} flashcards generated"`, `"Card {n} of {m}"`, `formatInterval`) become catalog functions. Character-counter numerics are unchanged.

#### 7. Flashcards + misc pages

**File**: `src/pages/flashcards/index.astro`, `generate.astro`, `review.astro`; `src/pages/api/auth/signin.ts`, `signup.ts`

**Intent**: Translate page `<title>`s, `<h1>`s, and the inline `Review` / `Generate with AI` buttons. For the auth API routes, wrap the `"Supabase is not configured"` literal (raw Supabase `error.message` passthrough at `signin.ts:11,16` stays as-is — it's provider text, out of scope).

**Contract**: Literals → `t.*`. `<Layout title={t.meta.titleFlashcards}>` etc.

#### 8. package.json name

**File**: `package.json`

**Intent**: Rename the project off the starter name.

**Contract**: `:2` `"name": "10x-astro-starter"` → `"10xcards"`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Production build passes: `npm run build`
- FSRS tests still pass: `npm run test`
- No remaining English literals in the translation surface: `git grep -nE "\b(Sign in|Sign up|Sign out|Dashboard|Flashcards|Generate|Review|Cancel|Delete|Save changes|Create flashcard|required)\b" -- "src/**/*.astro" "src/**/*.tsx"` returns only intentional exceptions (documented in the PR)

#### Manual Verification:

- Every screen (landing, signin, signup, confirm-email, flashcards, generate, review, dashboard) renders Polish copy with no obvious truncation or layout break
- `<html lang="pl">` in page source; browser tab shows `10xCards`
- API validation errors (e.g. POST an empty flashcard) return Polish messages

**Implementation Note**: After automated verification passes, pause for human confirmation of the manual visual pass before Phase 2.

---

## Phase 2: Deferred form validation

### Overview

Gate validation-error rendering on a per-field `touched` flag in the two flashcard forms so nothing shows before the user interacts.

### Changes Required:

#### 1. Flashcard create/edit form

**File**: `src/components/flashcards/FlashcardForm.tsx`

**Intent**: Keep the live `zod.safeParse` (`:34-40`) for button-disable logic, but only render `questionError` / `answerError` (text + `fieldErrorClass` red border) when that field has been touched. `onBlur` is the sole trigger that marks a field touched; a field returning to valid clears visually because the error is already recomputed live. The submit button stays disabled while the form is invalid (`:117` unchanged), so there is no "reveal all errors on blocked submit" path — blur covers the empty-required-field case, which is what the bug is about. (This deliberately diverges from `SignInForm`, whose button is enabled and which reveals on submit.)

**Contract**: New state `touched: { question: boolean; answer: boolean }` (or two booleans). `onBlur` handlers on the `<Textarea>`s set the flag. Render conditions become `touched.question && questionError`. Submit button `disabled={!parsed.success || submitting}` (`:117`) unchanged; `handleSubmit` does not touch the flags.

#### 2. AI generation form

**File**: `src/components/flashcards/FlashcardGenerator.tsx`

**Intent**: Same gate for the single `sourceText` field (`:87-88`, `:202-207`).

**Contract**: New `sourceTouched` boolean; `onBlur` on the textarea sets it (sole trigger). Render condition `sourceTouched && sourceError`. Generate button `disabled` binding (`:212`) unchanged; the generate handler does not touch the flag.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Opening "Nowa fiszka" shows no error text and no red border on either field
- Opening `/flashcards/generate` shows no "wymagany" error and no red textarea
- Blurring an empty required field shows its error; typing a valid value clears it
- The submit / generate button is disabled while the form is invalid and enables once all fields are valid
- Editing an existing flashcard (pre-filled) still shows no error until a field is cleared

**Implementation Note**: Pause for human confirmation before Phase 3.

---

## Phase 3: Pagination — data layer

### Overview

Make the list endpoint return a total row count and default to 10 per page; drop the `nextOffset` peek.

### Changes Required:

#### 1. List query schema

**File**: `src/lib/schemas/flashcard.ts`

**Intent**: Default page size becomes 10; max stays 50; `offset` unchanged.

**Contract**: `:20` `limit: z.coerce.number().int().min(1).max(50).default(20)` → `.default(10)`.

#### 2. Service

**File**: `src/lib/services/flashcards.ts`

**Intent**: Request an exact count and return it; fetch exactly one page instead of over-fetching by one.

**Contract**: `:49` `.select("*")` → `.select("*", { count: "exact" })`. `:61` `.range(offset, offset + limit)` → `.range(offset, offset + limit - 1)`. `:59` destructure becomes `const { data, error, count } = await query…`. `:67-73` replace the `hasNextPage` peek with `return { items: data.map(toFlashcard), total: count ?? 0 }`. Update `ListFlashcardsParams` doc/return type accordingly. Before relying on this: verify against the installed `supabase-js` version that `count` is populated on the resolved response with `.overrideTypes<FlashcardRow[], { merge: false }>()` still in the chain (`lessons.md`: verify library option shapes against the installed version); if `.overrideTypes()` strips the `count` type, move it off this query or cast the result.

#### 3. Response type

**File**: `src/types.ts`

**Intent**: Reflect the new response shape.

**Contract**: `:36-40` `FlashcardListResponse` → `{ items: Flashcard[]; total: number }` (remove `nextOffset`).

#### 4. API route

**File**: `src/pages/api/flashcards/index.ts`

**Intent**: No logic change — it already returns the service result verbatim (`:12-30`). Confirm the handler and any inline types still compile.

**Contract**: `Response.json(result)` unchanged; `result` now `{ items, total }`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- FSRS tests still pass: `npm run test`
- `git grep -n nextOffset -- src` returns nothing after the change

#### Manual Verification:

- `GET /api/flashcards?limit=10&offset=0` (via `npm run preview` + browser/curl, signed in) returns `{ items: [≤10], total: <deck size> }`
- `offset` beyond `total` returns `{ items: [], total }` without error
- `limit=100` is rejected/clamped by the schema (max 50)

**Implementation Note**: Pause for human confirmation before Phase 4.

---

## Phase 4: Pagination — UI

### Overview

Replace `FlashcardDeck`'s infinite scroll with numbered pagination + a page-size selector, with `page`/`size` mirrored in the URL.

### Changes Required:

#### 1. Add shadcn primitives

**File**: `src/components/ui/pagination.tsx`, `src/components/ui/select.tsx` (new, generated)

**Intent**: Standard shadcn components for the controls.

**Contract**: `npx shadcn@latest add pagination select`. No manual edits beyond what generation produces; dark-theme className overrides are applied at the call site in `FlashcardDeck`.

#### 2. Deck component

**File**: `src/components/flashcards/FlashcardDeck.tsx`

**Intent**: Drop the `IntersectionObserver`, sentinel, `nextOffset`/`nextOffsetRef`, `loadingMore`, and `mode: "append"` machinery. Introduce `page` and `size` state initialised from `window.location.search` (`?page`, `?size`; defaults 1 and 10; `size` constrained to {10,20,50}). Fetch a single page: `offset = (page - 1) * size`, `limit = size`. On `page`/`size`/`debouncedSearch` change, refetch (replace, never append) and `history.replaceState` the new query string — `replaceState` (not `pushState`) is deliberate: list pagination is a view filter, not navigation history, so Back returns the user to wherever they came from rather than through every visited page. Changing search or `size` resets `page` to 1. Compute `totalPages = Math.max(1, Math.ceil(total / size))` and clamp `page` into range after each fetch. Render `<Pagination>` below the list and a `<Select>` (labelled `t.deck.pageSize`) near the search box; hide pagination when `totalPages === 1`.

**Contract**: `PAGE_SIZE` const removed. `fetchPage` signature drops `mode`. New helper reads/writes the URL (inline or `src/components/hooks/usePaginationParams.ts` if it grows — `CLAUDE.md` says hooks live in `src/components/hooks/`). Local mutations (`handleCreate/Update/Delete`, `:158-205`) keep patching the current page's array; after a delete that empties the last page, refetch to pull the clamp/previous page. Skeleton (`:232-237`), empty (`:238-256`) and error states retained. All new user-facing strings introduced here (pagination labels, page-size options) go in `src/lib/i18n.ts`, not inline.

#### 3. Host page (no change expected)

**File**: `src/pages/flashcards/index.astro`

**Intent**: Confirm `<FlashcardDeck client:load />` still mounts unchanged; the island owns all URL handling.

**Contract**: none (verify only).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- `git grep -n "IntersectionObserver\|loadingMore\|nextOffset" -- src/components/flashcards/FlashcardDeck.tsx` returns nothing

#### Manual Verification:

- `/flashcards` shows 10 rows + numbered controls; deck with ≤10 cards shows no pagination
- Next/Prev and page numbers navigate; the list replaces (no appending)
- Page-size selector offers 10 / 20 / 50; switching resets to page 1 and refetches
- URL updates to `?page=2&size=20`; reloading that URL restores the same view; sharing the link to another signed-in session (own deck) shows the same page
- Typing in search resets to page 1; clearing search returns to page 1 of the full deck
- Hand-editing `?page=999` clamps to the last page
- Deleting the only card on the last page moves the user to the new last page
- Create/edit/delete still update the visible page and show Polish toasts

**Implementation Note**: Pause for human confirmation before Phase 5.

---

## Phase 5: Landing redesign + settings rename

### Overview

Make `/` branded and auth-aware, and turn `/dashboard` into `/ustawienia` with real content. All new user-facing copy introduced here goes through `src/lib/i18n.ts` (the Welcome rewrite and the settings panel add keys — they don't reintroduce inline literals).

### Changes Required:

#### 1. Landing route — auth redirect

**File**: `src/pages/index.astro`

**Intent**: Logged-in users don't need a marketing page.

**Contract**: Add frontmatter `if (Astro.locals.user) return Astro.redirect("/flashcards");` before rendering. Logged-out path renders the rebranded `<Welcome />`.

#### 2. Landing hero rewrite

**File**: `src/components/Welcome.astro`

**Intent**: Replace the "10x Astro Starter" hero and starter feature cards with a 10xCards value proposition: headline, one-paragraph pitch (wklej tekst → AI generuje fiszki → powtórki SRS), primary CTA "Zarejestruj się", secondary "Zaloguj się", and 3 short "Jak to działa" steps replacing the dev-feature cards. All copy from `t.landing.*`.

**Contract**: Keep the file's structural shell (`<Topbar />` embed at `:28`, outer wrapper) — swap `:32-125` content. Buttons link to `/auth/signup` and `/auth/signin`. No new deps.

#### 3. Nav label + href

**File**: `src/components/Topbar.astro`

**Intent**: "Dashboard" → "Ustawienia", pointing at the new route.

**Contract**: `:13-15` link text → `t.nav.settings`, `href="/dashboard"` → `href="/ustawienia"`.

#### 4. Settings page

**File**: `src/pages/ustawienia.astro` (new — reworked from `src/pages/dashboard.astro`), `src/pages/dashboard.astro` (becomes a redirect)

**Intent**: A real "Konto" panel: page `<h1>Ustawienia</h1>`, a card showing the signed-in e-mail and a "Wyloguj się" button (moved from the stub). `dashboard.astro` becomes `return Astro.redirect("/ustawienia")` for old links/bookmarks.

**Contract**: `<Layout title={t.meta.titleSettings}>`; reuse the existing `bg-cosmic` wrapper + `<Topbar />` + card markup from `dashboard.astro`, translated. Sign-out `<form method="POST" action="/api/auth/signout">` preserved.

#### 5. Middleware

**File**: `src/middleware.ts`

**Intent**: Protect the new route; the old one still resolves (to the redirect) so it can stay listed or be swapped.

**Contract**: `:4` `PROTECTED_ROUTES` — replace `"/dashboard"` with `"/ustawienia"` (keep `"/dashboard"` too if the redirect page must itself be auth-gated; simplest: list both).

#### 6. README brand mention

**File**: `README.md`

**Intent**: Drop the starter title / stale `/dashboard` reference (low priority, keep minimal).

**Contract**: `:1` `# 10x Astro Starter` → `# 10xCards`; `:148` `/dashboard` → `/ustawienia`.

#### 7. Favicon + starter asset

**File**: `public/favicon.png`, `public/template.png`

**Intent**: Replace the starter tab icon so the tab reads as 10xCards, and drop the unused starter screenshot.

**Contract**: Swap `public/favicon.png` for a 10xCards icon (`Layout.astro:19` reference unchanged). Delete `public/template.png` (grep confirms it's unreferenced). If no icon asset is available at implementation time, leave `favicon.png` and add a one-line "favicon deferred" note here rather than shipping the starter icon silently.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- `git grep -n "/dashboard" -- src` returns only the redirect stub and middleware entry
- Re-run Phase 1's check 1.4 English-literal grep — clean after the Welcome / Topbar / settings rework and the Phase 4 pagination UI (this is the final English sweep)

#### Manual Verification:

- Logged out, `/` shows the 10xCards hero (no "Astro Starter" text anywhere), CTAs go to signup/signin
- Logged in, visiting `/` lands on `/flashcards`
- Nav shows "Ustawienia"; it opens `/ustawienia` with the e-mail + "Wyloguj się" panel
- Visiting `/dashboard` (logged in) redirects to `/ustawienia`; visiting it logged out redirects to signin
- "Wyloguj się" still logs the user out
- Tab titles read `10xCards` / `Ustawienia` etc.
- Browser tab shows the 10xCards favicon, not the starter icon (or the "favicon deferred" note applies); `public/template.png` is gone

**Implementation Note**: Pause for human confirmation before Phase 6.

---

## Phase 6: Lighter background pass

### Overview

Recolour the app to a lighter, warmer ground and fix any contrast regressions.

### Changes Required:

#### 1. Background utility

**File**: `src/styles/global.css`

**Intent**: Replace the near-black cosmic gradient with a lighter, warmer dark tone (e.g. a muted indigo/slate in the ~`#1e2033`–`#2a2d44` range — implementer picks the exact stops for a pleasant, non-flat gradient).

**Contract**: `:113-115` `@utility bg-cosmic` `background-image` gradient stops updated. Utility name kept so all call sites pick it up automatically.

#### 2. Dialog surfaces

**File**: `src/components/flashcards/FlashcardGenerator.tsx`, `FlashcardDeck.tsx`, `DeleteFlashcardDialog.tsx`

**Intent**: The hardcoded `bg-[#0f1529]` dialog panels must sit correctly against the new ground (slightly lighter than the page, still distinct).

**Contract**: `bg-[#0f1529]` occurrences (`FlashcardGenerator.tsx:39,351`, `FlashcardDeck.tsx:16`, `DeleteFlashcardDialog.tsx:46`) → a single new value matching the palette; consider extracting to a `bg-surface` `@utility` in `global.css` to avoid four literals.

#### 3. Contrast audit

**File**: `src/components/Welcome.astro`, `src/components/Topbar.astro`, `src/pages/**/*.astro`, `src/components/flashcards/*.tsx`, `src/components/auth/*.tsx`

**Intent**: Walk every screen and bump low-opacity foreground classes that wash out on the lighter ground — chiefly `text-blue-100/50`, `text-blue-100/80`, `bg-white/5`, `border-white/10`. No structural/layout changes.

**Contract**: Targeted className adjustments only (raise opacity or shift to a token). Body text must meet WCAG AA (4.5:1); large headings/secondary text at least AA-large (3:1).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- FSRS tests still pass: `npm run test`

#### Manual Verification:

- Every page (landing, signin, signup, confirm-email, flashcards list, generate, review, ustawienia) shows the lighter background and no illegible / washed-out text
- Dialogs (create, edit, delete, generate "replace proposals", edit proposal) are visually distinct from the page behind them
- Spot-check body text contrast with a checker on 2–3 representative screens (≥ 4.5:1)
- No regression to focus rings / hover states

**Implementation Note**: Final phase — after automated + manual verification, the change is ready for `/10x-impl-review` and archive.

---

## Testing Strategy

### Unit Tests:

- None added — no component/API test runner is configured and introducing one is out of scope (consistent with S-01–S-03). `npm run test` (FSRS scope) must stay green as a regression guard.

### Integration Tests:

- Manual, via `npm run preview` against a signed-in Supabase session: the pagination scenarios in Phase 4 and the redirect/auth scenarios in Phase 5.

### Manual Testing Steps:

1. Fresh load of every page logged out, then logged in — confirm Polish copy, `lang="pl"`, `10xCards` title, lighter background.
2. "Nowa fiszka" dialog and `/flashcards/generate` — confirm no premature errors; blur/type/submit behaviour per Phase 2.
3. `/flashcards` with a >20-card deck — page through, switch size 10/20/50, reload a deep link, search-then-paginate, hand-edit `?page=`.
4. Delete the last card on the last page — confirm clamp.
5. `/` logged in → `/flashcards`; `/dashboard` → `/ustawienia`; sign out from `/ustawienia`.
6. Contrast spot-check on landing, flashcards list, review.

## Performance Considerations

- Numbered pagination fetches exactly one page (`limit ≤ 50`) instead of accumulating all pages in memory on scroll — strictly lighter on the client.
- `{ count: "exact" }` adds a count aggregate to the list query. At MVP data volume (`target_scale.data_volume: small`, per-user decks) this is negligible; revisit only if decks grow into the tens of thousands.
- No new client dependencies; `pagination` + `select` are small Radix wrappers already transitively available.

## Migration Notes

- `FlashcardListResponse` changes shape (`nextOffset` → `total`). Only `FlashcardDeck.tsx` consumes it; no persisted data or external contract is affected.
- `/dashboard` keeps working via redirect — no broken bookmarks.
- No database migration.

## References

- Change identity: `context/changes/ux-improvements/change.md`
- Roadmap slice: `context/foundation/roadmap.md` → S-04 `ux-improvements`
- Deferred-validation pattern: `src/components/auth/SignInForm.tsx:16-52`
- List service: `src/lib/services/flashcards.ts:45-74`
- List schema: `src/lib/schemas/flashcard.ts:17-21`
- Prior UI conventions: `context/archive/2026-08-23-manual-flashcard-management/plan-brief.md`, `context/archive/2026-08-25-ai-flashcard-generation/plan-brief.md`
- Lessons: `context/foundation/lessons.md` (verify library option shapes against installed versions; prefer native JS over new deps)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: i18n foundation + Polish copy sweep

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 3076c98
- [x] 1.2 Production build passes: `npm run build` — 3076c98
- [x] 1.3 FSRS tests still pass: `npm run test` — 3076c98
- [x] 1.4 No remaining English literals in the translation surface (grep check, exceptions documented) — 3076c98

#### Manual

- [x] 1.5 Every screen renders Polish copy with no truncation or layout break — 3076c98
- [x] 1.6 `<html lang="pl">` in source; browser tab shows `10xCards` — 3076c98
- [x] 1.7 API validation errors return Polish messages — 3076c98

### Phase 2: Deferred form validation

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — 8e308b8
- [x] 2.2 Build passes: `npm run build` — 8e308b8

#### Manual

- [x] 2.3 "Nowa fiszka" dialog opens with no error text and no red border — 8e308b8
- [x] 2.4 `/flashcards/generate` opens with no error and no red textarea — 8e308b8
- [x] 2.5 Blurring an empty required field shows its error; typing a valid value clears it — 8e308b8
- [x] 2.6 Submit / generate button is disabled while invalid, enables once all fields are valid — 8e308b8
- [x] 2.7 Editing a pre-filled flashcard shows no error until a field is cleared — 8e308b8

### Phase 3: Pagination — data layer

#### Automated

- [x] 3.1 Lint passes: `npm run lint` — d17a9cb
- [x] 3.2 Build passes: `npm run build` — d17a9cb
- [x] 3.3 FSRS tests still pass: `npm run test` — d17a9cb
- [x] 3.4 `git grep -n nextOffset -- src` returns nothing (landed in Phase 4 — the infinite-scroll rewrite removed the stopgap `nextOffset` state) — fe43966

#### Manual

- [x] 3.5 `GET /api/flashcards?limit=10&offset=0` returns `{ items: [≤10], total }` — d17a9cb
- [x] 3.6 `offset` beyond `total` returns `{ items: [], total }` without error — d17a9cb
- [x] 3.7 `limit=100` is rejected/clamped by the schema (max 50) — d17a9cb

### Phase 4: Pagination — UI

#### Automated

- [x] 4.1 Lint passes: `npm run lint` — fe43966
- [x] 4.2 Build passes: `npm run build` — fe43966
- [x] 4.3 No `IntersectionObserver` / `loadingMore` / `nextOffset` left in `FlashcardDeck.tsx` — fe43966

#### Manual

- [x] 4.4 `/flashcards` shows 10 rows + numbered controls; ≤10-card deck shows no pagination — fe43966
- [x] 4.5 Next/Prev and page numbers navigate; list replaces (no appending) — fe43966
- [x] 4.6 Page-size selector offers 10 / 20 / 50; switching resets to page 1 — fe43966
- [x] 4.7 URL updates to `?page=&size=`; reloading restores the view; shared link works — fe43966
- [x] 4.8 Search resets to page 1; clearing search returns to page 1 of full deck — fe43966
- [x] 4.9 `?page=999` clamps to the last page — fe43966
- [x] 4.10 Deleting the only card on the last page moves to the new last page — fe43966
- [x] 4.11 Create/edit/delete still update the visible page with Polish toasts — fe43966

### Phase 5: Landing redesign + settings rename

#### Automated

- [x] 5.1 Lint passes: `npm run lint` (adaptation: `no-misused-promises` off for `**/*.astro` — the rule crashes on a top-level `return Astro.redirect()`)
- [x] 5.2 Build passes: `npm run build`
- [x] 5.3 `git grep -n "/dashboard" -- src` returns only the redirect stub and middleware entry (verified via plain grep — `git grep` with a lone leading `/` is mangled by MSYS on this Windows box)
- [x] 5.4 Phase 1 check 1.4 English-literal grep re-run — clean after Phases 4 & 5 (only the pre-existing `AlertDialogPrimitive.Cancel` shadcn API-name exception)

#### Manual

- [x] 5.5 Logged out, `/` shows the 10xCards hero (no "Astro Starter" text); CTAs go to signup/signin
- [x] 5.6 Logged in, `/` redirects to `/flashcards`
- [x] 5.7 Nav shows "Ustawienia"; `/ustawienia` has the e-mail + "Wyloguj się" panel
- [x] 5.8 `/dashboard` redirects to `/ustawienia` (logged in) / signin (logged out)
- [x] 5.9 "Wyloguj się" logs the user out
- [x] 5.10 Tab titles read `10xCards` / `Ustawienia`
- [x] 5.11 Browser tab shows the 10xCards favicon (procedurally generated card-stack mark, not deferred); `public/template.png` deleted

### Phase 6: Lighter background pass

#### Automated

- [ ] 6.1 Lint passes: `npm run lint`
- [ ] 6.2 Build passes: `npm run build`
- [ ] 6.3 FSRS tests still pass: `npm run test`

#### Manual

- [ ] 6.4 Every page shows the lighter background with no illegible / washed-out text
- [ ] 6.5 Dialogs are visually distinct from the page behind them
- [ ] 6.6 Body-text contrast ≥ 4.5:1 on 2–3 representative screens
- [ ] 6.7 No regression to focus rings / hover states
