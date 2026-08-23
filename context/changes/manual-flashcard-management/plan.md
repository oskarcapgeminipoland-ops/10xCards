# Manual Flashcard Management Implementation Plan

## Overview

Add the full manual CRUD slice for flashcards on top of the existing `flashcards` table (F-01): a JSON REST API (`/api/flashcards`) with search + offset pagination, and a new `/flashcards` deck page (React island) where a user creates, edits, and deletes their own flashcards independently of AI generation — list with infinite scroll and search, a Dialog-based create/edit form with live validation and character counters, an AlertDialog delete confirmation, and Sonner toasts for feedback. Also wires the existing (unused) `Topbar` into `dashboard.astro` and the new page so the feature is discoverable.

## Current State Analysis

- **Data layer is frozen and done (F-01)**: `flashcards` table exists with `id`, `user_id` (FK → `auth.users`, cascade delete), `question` (≤500 chars, non-empty after trim), `answer` (≤1000 chars, non-empty after trim), `source` (`'ai' | 'manual'`), `status` (`'active'` only, reserved for future use), `created_at`/`updated_at` (fully server-enforced by trigger on both insert and update — app code must never try to set these). Four granular RLS policies (`select`/`insert`/`update`/`delete`, all `to authenticated`, `auth.uid() = user_id`) already enforce per-user isolation — API code relies on RLS and must not duplicate ownership filtering. Index on `user_id` exists.
- **No app-layer code touches this table yet.** `src/types.ts` has exactly one type, `Flashcard` (camelCase, hand-mapped from the snake_case columns) — no DTOs, no zod schemas, no Supabase-generated types (deferred in F-01, still absent).
- **No JSON API precedent exists.** `src/pages/api/auth/{signin,signup,signout}.ts` all follow a single pattern: `context.request.formData()` → Supabase call → `context.redirect(...)` with an encoded `?error=` message on failure. None return `Response.json`/status codes. This slice introduces the first true JSON API in the app.
- **`zod` is not installed.** `CLAUDE.md` explicitly flags it as "add when the first route needs body validation" — this is that route.
- **`src/middleware.ts`'s `PROTECTED_ROUTES` only guards page routes by prefix match** (`["/dashboard"]` today) — it does not touch `/api/*` at all. `/flashcards` must be added to this array; every new API handler must independently check `context.locals.user` and return 401 when absent.
- **React-island convention already established**: `src/components/auth/SignInForm.tsx`, mounted via `client:load` from `src/pages/auth/signin.astro`, uses `useState` for form fields/errors with an on-submit `validate()` (no live per-keystroke validation yet — this slice introduces that). Reusable pieces (`FormField`, `ServerError`, `SubmitButton`) live under `src/components/auth/` — flashcard-specific equivalents will live under a new `src/components/flashcards/`.
- **Only `Button` is installed from shadcn/ui** (`src/components/ui/button.tsx`). `components.json` is configured (`style: new-york`, `baseColor: neutral`, `cssVariables: true`, alias `hooks: @/hooks`) so `npx shadcn@latest add <name>` works, but `Input`, `Label`, `Textarea`, `Dialog`, `AlertDialog`, `Card`, `Skeleton`, and `Sonner` are not yet present. `src/hooks/` does not exist yet either.
- **`Topbar.astro`** already renders an auth-aware nav (email, Dashboard link, sign-out form when logged in) but is not included on `dashboard.astro` today — `dashboard.astro` is a standalone card with its own inline sign-out form.
- **No test runner is configured** (`CLAUDE.md`) — automated verification for this plan is `npm run lint` + `npm run build` only.

## Desired End State

A logged-in user visits `/flashcards` (linked from a "Flashcards" nav item in `Topbar`, now also included on `dashboard.astro`) and sees their full deck as an infinite-scrolling, searchable list. They can open a "New flashcard" dialog, type a question/answer with live character counters and inline validation (≤500 / ≤1000 chars, non-empty), and save — the new card appears in the list and a toast confirms it. They can edit any existing card the same way, and delete one via a destructive-confirmation dialog, after which it disappears from the list with a confirming toast. All of this works only for the signed-in user's own cards; RLS continues to guarantee isolation. The page and every action are responsive (mobile through desktop) and visually consistent with the existing glassmorphism/gradient aesthetic already used on `dashboard.astro`/`auth` pages.

Verification: `npm run lint` and `npm run build` pass; manual walkthrough (Phase 3) confirms create/edit/delete/search/pagination/empty-state/responsive behavior end-to-end against a real Supabase-backed dev session.

### Key Discoveries:

- `supabase/migrations/20260823134802_create_flashcards_table.sql` and `supabase/migrations/20260823153107_enforce_server_side_flashcard_timestamps.sql` — full schema + RLS, confirmed above.
- `src/lib/supabase.ts:9` — `createClient(requestHeaders, cookies)` returns `null` if `SUPABASE_URL`/`SUPABASE_KEY` are unset; every caller (page or API route) must guard for that.
- `src/pages/api/auth/signin.ts` — reference for the null-client guard pattern, but NOT for response shape (that route redirects; this slice's routes return JSON).
- `context/archive/2026-08-22-flashcard-data-foundation/plan-brief.md` — confirms deletes are hard deletes with no undo; the AlertDialog confirmation is the only safety net (matches FR-008).

## What We're NOT Doing

- No AI-assisted flashcard generation or acceptance flow — that is S-01, entirely separate, and this plan does not touch `source: 'ai'` handling beyond respecting the existing enum.
- No soft-delete / undo-after-delete — `status` stays a single reserved value; deletes remain hard DB deletes per F-01's design.
- No Supabase-generated TypeScript types (`supabase gen types typescript`) — still out of scope; DTOs continue to be hand-written in `src/types.ts` per the established pattern.
- No new automated test runner (e.g. Vitest) — explicitly deferred; this slice's automated verification is lint + build only, consistent with `CLAUDE.md`'s "no test runner configured yet" and the project's test-strategy work being scoped to a later module.
- No bulk operations (multi-select delete, import/export) — one flashcard at a time, matching FR-005/007/008 exactly.
- No changes to the SRS/review flow (S-02) — flashcards created/edited here simply exist with `status: 'active'`; nothing about review scheduling is introduced.
- No sorting/filtering options beyond the one text search box (no sort-by-date toggle, no tag/category system — none exists in the schema).

## Implementation Approach

Three phases following the existing "schema → business logic → API → clients" pattern from `CLAUDE.md` (schema is already done):

1. **Data & validation foundation** — zod schemas, DTOs, a Supabase-backed service module, and the `PROTECTED_ROUTES` update. Nothing here is reachable by a browser yet, but it's fully unit-testable in isolation logically (even without a test runner, it's the layer other phases build on).
2. **API routes** — thin Astro API handlers wrapping the service module in Phase 1, establishing this app's first JSON API conventions (status codes, error shape, auth guard).
3. **UI** — the `/flashcards` page, its React island component tree, new shadcn/ui primitives, Sonner wiring, and Topbar/dashboard nav integration.

This ordering means each phase is independently verifiable (lint/build/manual curl-style checks) before the next depends on it, and mirrors the plan structure already used successfully for F-01.

## Critical Implementation Details

**Not-found vs not-owned are indistinguishable by design, and that's correct**: `PATCH`/`DELETE` handlers must chain `.select()` after `.update()`/`.delete()` and check whether the returned array is empty. An empty result means either the row doesn't exist or it belongs to another user — RLS makes these look identical, and the API must return the same `404` for both rather than trying to distinguish them (distinguishing would require a separate ownership-bypassing query, which would leak existence information across users).

**Auth guard is explicit, RLS is not a substitute for it**: every `/api/flashcards*` handler must check `context.locals.user` and return `401` immediately if absent, before querying. Do not rely on RLS silently returning zero rows for an unauthenticated request — `context.locals.user` being null means there's no session at all, and the handler should say so explicitly rather than responding `200` with an empty/misleading result. Conversely, once a user is authenticated, handlers must NOT add their own `.eq("user_id", ...)` filter — that duplicates what RLS already guarantees and risks drifting out of sync with the policies if the schema changes later.

**Search + pagination must reset and cancel together**: the list fetch takes both `search` and `offset`. Changing the search term must reset `offset` to `0` and abort any in-flight list request (`AbortController`) before issuing the new one — otherwise a slow earlier response can resolve after a faster later one and overwrite the list with stale results. Debounce the search input (~300ms) before triggering a fetch at all.

## Phase 1: Data & Validation Foundation

### Overview

Add `zod`, define the shared input schema and DTOs, build the Supabase-backed service module that Phase 2's API routes will call, and extend route protection.

### Changes Required:

#### 1. Add `zod` dependency

**File**: `package.json`

**Intent**: First consumer of `zod` per `CLAUDE.md` — needed to validate create/edit input and list query params server-side.

**Contract**: `zod` added as a regular dependency (not dev). Install via `npm install zod`.

#### 2. Flashcard DTOs

**File**: `src/types.ts`

**Intent**: Extend the existing `Flashcard` entity type with the request/response shapes the API and UI will share.

**Contract**: Add and export:
- `FlashcardInput` — `{ question: string; answer: string }` (shared by create and edit; `source`/`status` are never client-supplied — server sets `source: 'manual'` on create, and update never touches `source`/`status`).
- `FlashcardListResponse` — `{ items: Flashcard[]; nextOffset: number | null }` (`nextOffset` is `null` when there are no more pages).
- `ApiErrorResponse` — `{ error: string }` (the one error shape every `/api/flashcards*` route returns on non-2xx).

#### 3. Zod schemas

**File**: `src/lib/schemas/flashcard.ts` (new)

**Intent**: Mirror the DB CHECK constraints (question ≤500 non-empty-after-trim, answer ≤1000 non-empty-after-trim) in one place, reused by both the API routes (Phase 2) and the client-side live-validation form (Phase 3), so the limits can never drift between client and server.

**Contract**: Export `flashcardInputSchema: z.ZodType<FlashcardInput>` (`question`/`answer` each `.trim().min(1).max(...)` with a user-facing message) and `flashcardListQuerySchema` for parsing `?search=&offset=&limit=` (`search` optional trimmed string, `offset` coerced non-negative int defaulting to `0`, `limit` coerced int 1-50 defaulting to `20`).

#### 4. Flashcard service module

**File**: `src/lib/services/flashcards.ts` (new)

**Intent**: Own every Supabase call this feature makes, so API routes (Phase 2) stay thin. Encapsulates the snake_case ↔ camelCase mapping and the search+pagination query shape.

**Contract**: Given a Supabase client (already scoped to the caller's session — RLS handles ownership), export:
- `listFlashcards(supabase, { search, offset, limit }) => Promise<FlashcardListResponse>` — applies `.ilike` search across `question`/`answer` when `search` is non-empty, orders by `created_at desc`, uses `.range(offset, offset + limit)` (fetches one extra row to compute `nextOffset` without a second count query).
- `createFlashcard(supabase, input: FlashcardInput) => Promise<Flashcard>` — inserts with `source: 'manual'`, `status: 'active'`; `user_id` is NOT set explicitly (RLS `with check (auth.uid() = user_id)` requires a value, so this must come from the authenticated client — see note below on how the auth route sets it).
- `updateFlashcard(supabase, id: string, input: FlashcardInput) => Promise<Flashcard | null>` — `.update().eq("id", id).select()`, returns `null` when the result array is empty (not-found-or-not-owned).
- `deleteFlashcard(supabase, id: string) => Promise<boolean>` — `.delete().eq("id", id).select()`, returns `false` when the result array is empty.

Note on `user_id` for insert: since it's `not null` with an RLS `with check`, the insert payload must include `user_id: user.id` explicitly (there's no DB default) — the service function takes the authenticated `user.id` as a parameter alongside `input`, sourced by the API route from `context.locals.user.id`.

#### 5. Protect the new page route

**File**: `src/middleware.ts`

**Intent**: `/flashcards` must redirect unauthenticated visitors to sign-in, matching `/dashboard`'s existing behavior.

**Contract**: Add `"/flashcards"` to the `PROTECTED_ROUTES` array (line 4). This only guards the page; API routes still need their own guard per the Critical Implementation Details above.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes (confirms `src/types.ts`, `src/lib/schemas/flashcard.ts`, `src/lib/services/flashcards.ts` all typecheck together)

#### Manual Verification:

- `zod` appears in `package.json` dependencies and `node_modules/zod` exists after install
- `PROTECTED_ROUTES` in `src/middleware.ts` includes `/flashcards`

---

## Phase 2: API Routes

### Overview

Thin Astro API route handlers wrapping the Phase 1 service module: list (with search + pagination), create, update, delete — establishing this app's first JSON API conventions.

### Changes Required:

#### 1. List + create endpoint

**File**: `src/pages/api/flashcards/index.ts` (new)

**Intent**: `GET` returns a page of the caller's flashcards (search + pagination); `POST` creates one.

**Contract**: Both handlers: get the Supabase client via `createClient(context.request.headers, context.cookies)`; if `null`, return `500` with `ApiErrorResponse` ("Supabase is not configured"); if `context.locals.user` is absent, return `401`.
- `GET`: parse `context.url.searchParams` with `flashcardListQuerySchema` (`400` + validation message on failure), call `listFlashcards`, return `200` with `FlashcardListResponse` as JSON.
- `POST`: parse `await context.request.json()` with `flashcardInputSchema` (`400` on failure), call `createFlashcard(supabase, user.id, input)`, return `201` with the created `Flashcard` as JSON.

#### 2. Update + delete endpoint

**File**: `src/pages/api/flashcards/[id].ts` (new)

**Intent**: `PATCH` edits one flashcard; `DELETE` removes one, by `id` path param.

**Contract**: Same client/auth guard as above (`500`/`401`).
- `PATCH`: parse body with `flashcardInputSchema` (`400` on failure), call `updateFlashcard(supabase, context.params.id, input)`; `404` + `ApiErrorResponse` if it returns `null`; otherwise `200` with the updated `Flashcard`.
- `DELETE`: call `deleteFlashcard(supabase, context.params.id)`; `404` if it returns `false`; otherwise `204` with no body.

All JSON responses use `Response.json(...)` (or `new Response(JSON.stringify(...), { status, headers: { "Content-Type": "application/json" } })` where a `204` needs no body). Every non-2xx response body is `ApiErrorResponse` (`{ error: string }`).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- With a signed-in session (via browser dev tools / curl with session cookie): `GET /api/flashcards` returns `200` and an empty `items: []` for a fresh user
- `POST /api/flashcards` with a valid body returns `201` and the created row; with an over-limit `question` returns `400`
- `PATCH /api/flashcards/<id>` on another user's card (or a random UUID) returns `404`; on your own card returns `200` with updated content
- `DELETE /api/flashcards/<id>` returns `204` then a subsequent `GET` no longer includes it
- Any request without a valid session cookie returns `401` on every route above

---

## Phase 3: UI — Flashcard Deck Page

### Overview

The `/flashcards` page: React island with infinite-scroll + searchable list, create/edit Dialog with live validation, delete AlertDialog, Sonner toasts, empty/loading states, and nav wiring — responsive and visually consistent with the existing auth/dashboard aesthetic.

### Changes Required:

#### 1. Install new shadcn/ui primitives

**File**: n/a (CLI-generated files under `src/components/ui/`)

**Intent**: This slice is the first to need `Input`, `Label`, `Textarea`, `Dialog`, `AlertDialog`, `Card`, `Skeleton`, and `Sonner` — none exist yet.

**Contract**: Run `npx shadcn@latest add input label textarea dialog alert-dialog card skeleton sonner`. Wire the generated `<Toaster />` into `src/layouts/Layout.astro` (as a `client:load` island near the closing `</body>`) so any page can call `toast(...)` — this slice is the only current consumer, but it's global infra other slices (S-01) will also want.

#### 2. Shared form component

**File**: `src/components/flashcards/FlashcardForm.tsx` (new)

**Intent**: One form used for both create and edit (mode-driven), with live validation against `flashcardInputSchema` and a character counter per field, matching the "polished, responsive" bar called out for this slice.

**Contract**: Props: `{ mode: "create" | "edit"; initialValue?: FlashcardInput; onSubmit: (input: FlashcardInput) => Promise<void>; onCancel: () => void }`. Re-validates on every keystroke via `flashcardInputSchema.safeParse`, showing inline error + `used/limit` counter per field; submit button disabled while invalid or while a submit is in flight.

#### 3. Delete confirmation

**File**: `src/components/flashcards/DeleteFlashcardDialog.tsx` (new)

**Intent**: Destructive-action confirmation before calling `DELETE`, per FR-008.

**Contract**: Props: `{ flashcard: Flashcard; onConfirm: () => Promise<void>; onCancel: () => void }`, built on shadcn `AlertDialog`.

#### 4. Deck list + search + infinite scroll

**File**: `src/components/flashcards/FlashcardDeck.tsx` (new)

**Intent**: The main island: owns the list state, debounced search, pagination fetch-on-scroll, and orchestrates the create/edit Dialog + delete AlertDialog + toasts.

**Contract**: On mount, fetches `GET /api/flashcards?limit=20`. A debounced (~300ms) search input updates `search`, resets `offset` to `0`, aborts any in-flight request, and refetches. An `IntersectionObserver` sentinel at the list's end triggers the next page fetch (appending, using the previous response's `nextOffset`) while `nextOffset !== null`; shows `Skeleton` placeholders while loading. Renders each `Flashcard` as a `Card` with question/answer preview and Edit/Delete actions. "New flashcard" button opens `FlashcardForm` in a `Dialog` (mode `create`); Edit opens the same form pre-filled (mode `edit`). Successful create/update/delete call `toast.success(...)`; failed requests call `toast.error(...)` with the server's `error` message. Empty state (no cards, no active search) shows a centered CTA to create the first flashcard.

#### 5. Page

**File**: `src/pages/flashcards/index.astro` (new)

**Intent**: Route `/flashcards` — the dedicated full-deck page called out as a requirement.

**Contract**: Wrapped in `Layout` (`title="Flashcards"`), includes `<Topbar />` (see below) above the mounted `<FlashcardDeck client:load />`. Follows the existing responsive container pattern from `dashboard.astro` (max-width wrapper, padding that scales down on small viewports) rather than a fixed-width layout, since this page must hold a scrolling list rather than a single centered card.

#### 6. Navigation wiring

**File**: `src/components/Topbar.astro`, `src/pages/dashboard.astro`

**Intent**: Make `/flashcards` discoverable — `Topbar` already has the auth-aware nav pattern, just needs one more link; `dashboard.astro` doesn't include `Topbar` at all today.

**Contract**: In `Topbar.astro`, add a `Flashcards` link (`href="/flashcards"`) next to the existing `Dashboard` link, in the same authenticated branch (lines 13-15 area). In `dashboard.astro`, add `<Topbar />` above the existing centered card, matching how it'll be used on `/flashcards`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Visiting `/flashcards` while signed out redirects to `/auth/signin`
- Visiting `/flashcards` while signed in shows the empty state on a fresh account, with a working "create first flashcard" CTA
- Creating a flashcard: live character counters update while typing, over-limit input shows an inline error and disables submit, successful submit closes the dialog, shows the new card in the list, and fires a success toast
- Editing a flashcard: dialog opens pre-filled, changes save and reflect immediately in the list
- Deleting a flashcard: AlertDialog requires explicit confirmation; confirming removes it from the list with a toast; canceling leaves it untouched
- Typing in search filters the list (debounced, not on every keystroke); clearing search restores the full list
- With more than ~20 flashcards (seed manually or create enough), scrolling the list loads the next page automatically via the `IntersectionObserver` sentinel
- "Flashcards" link is visible and working from both `Topbar` on `/dashboard` and on `/flashcards` itself
- Page and dialogs are usable and legible at a narrow (mobile-width) viewport as well as desktop — no horizontal overflow, dialog fits within viewport height with internal scroll if needed
- Visual style (spacing, color, typography) reads as consistent with the existing `dashboard.astro`/auth pages, not a bare unstyled form

---

## Testing Strategy

### Unit Tests:

- None — no test runner is configured in this project yet (see What We're NOT Doing). If one is introduced in a later change, `flashcardInputSchema` and the `src/lib/services/flashcards.ts` functions are the natural first candidates for unit coverage.

### Integration Tests:

- None automated, for the same reason. The Phase 2 Manual Verification steps (curl/browser-based request checks against each status code) serve as the integration-test substitute for this plan.

### Manual Testing Steps:

1. Sign in as a test user with zero flashcards; confirm the `/flashcards` empty state and CTA.
2. Create 2-3 flashcards through the dialog, exercising both the character-limit validation and successful save.
3. Edit one of them; confirm the change persists after a page reload.
4. Delete one via the confirmation dialog; confirm it disappears and cannot be recovered (hard delete, matches F-01 design).
5. Create enough flashcards (20+) to trigger a second page; scroll to confirm infinite-scroll loading.
6. Search for a substring present in only one card's question; confirm the list filters down; clear search and confirm the full list returns.
7. Sign in as a second test user; confirm their `/flashcards` is empty and does not show the first user's cards (RLS smoke test at the UI level).
8. Resize the browser to a mobile width and repeat steps 2-4 to confirm responsive behavior.

## Performance Considerations

Search uses `.ilike` with no dedicated trigram index — acceptable at the expected per-user deck size for this MVP stage (existing `user_id` index already bounds each query to one user's rows before the `ilike` filter applies). Revisit with a `pg_trgm` GIN index only if real usage shows this is slow.

## Migration Notes

No schema changes in this plan — F-01's migrations are unmodified. No existing data to migrate (feature is net-new).

## References

- Roadmap item: S-03 (`context/foundation/roadmap.md`)
- Data foundation: `context/archive/2026-08-22-flashcard-data-foundation/plan.md`, `context/archive/2026-08-22-flashcard-data-foundation/plan-brief.md`
- Auth API pattern (client/null-guard reference, not response-shape reference): `src/pages/api/auth/signin.ts`
- React-island form convention reference: `src/components/auth/SignInForm.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data & Validation Foundation

#### Automated

- [ ] 1.1 `npm run lint` passes
- [ ] 1.2 `npm run build` passes

#### Manual

- [ ] 1.3 `zod` in `package.json` dependencies and installed
- [ ] 1.4 `/flashcards` present in `PROTECTED_ROUTES`

### Phase 2: API Routes

#### Automated

- [ ] 2.1 `npm run lint` passes
- [ ] 2.2 `npm run build` passes

#### Manual

- [ ] 2.3 `GET /api/flashcards` returns 200 + empty `items` for a fresh user
- [ ] 2.4 `POST /api/flashcards` returns 201 on valid input, 400 on over-limit input
- [ ] 2.5 `PATCH /api/flashcards/<id>` returns 404 for not-found/not-owned, 200 on success
- [ ] 2.6 `DELETE /api/flashcards/<id>` returns 204 and the row is gone on next `GET`
- [ ] 2.7 Unauthenticated requests return 401 on every route

### Phase 3: UI — Flashcard Deck Page

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npm run build` passes

#### Manual

- [ ] 3.3 Signed-out visit to `/flashcards` redirects to sign-in
- [ ] 3.4 Empty state + create CTA works on a fresh account
- [ ] 3.5 Create flow: live validation, character counters, success toast, card appears
- [ ] 3.6 Edit flow: pre-filled dialog, changes persist
- [ ] 3.7 Delete flow: confirmation required, removal + toast on confirm
- [ ] 3.8 Search filters the list (debounced)
- [ ] 3.9 Infinite scroll loads next page past ~20 cards
- [ ] 3.10 "Flashcards" nav link works from Topbar on both `/dashboard` and `/flashcards`
- [ ] 3.11 Responsive at mobile width, no horizontal overflow
- [ ] 3.12 Visual style consistent with existing dashboard/auth pages
