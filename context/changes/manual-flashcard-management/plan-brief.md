# Manual Flashcard Management — Plan Brief

> Full plan: `context/changes/manual-flashcard-management/plan.md`

## What & Why

Give users a way to create, edit, and delete flashcards by hand, independent of AI generation (FR-005/007/008). This is the roadmap's S-03 slice, deliberately built before S-01 (the AI-generation "north star") because it's fully unblocked today, delivers a reusable list/CRUD UI foundation, and exercises the F-01 data foundation (schema + RLS) end-to-end before the more complex AI flow builds on top of it.

## Starting Point

F-01 already shipped the `flashcards` table with full RLS isolation, but zero app-layer code exists yet — no API routes, no UI, no zod, no DTOs beyond a bare `Flashcard` type. The only precedent in the codebase for API routes is the auth flow's form-POST-and-redirect pattern, which this slice deliberately does not follow.

## Desired End State

A signed-in user visits `/flashcards`, sees their full deck as a searchable, infinite-scrolling list, and can create a card via a dialog with live validation and character counters, edit any card the same way, and delete one behind a destructive-confirmation dialog — with toast feedback throughout. The page is linked from the nav (`Topbar`, now also on `/dashboard`) and is responsive and visually consistent with the existing auth/dashboard pages.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Sequencing vs. S-01 | Build S-03 before S-01 | Unblocked today, gives reusable CRUD/list UI, exercises F-01 in practice before AI flow lands on top | Plan |
| API style | JSON REST (`/api/flashcards`) | Enables a fluid list UI without full-page reloads; sets a precedent S-01 will also need | Plan |
| Create/edit UX | Dialog on the list page, not separate routes | Fewer pages to build, keeps user in context; deck page itself still gets its own dedicated `/flashcards` route | Plan |
| Feedback | Sonner toasts | Matches the "polished design" bar; non-blocking confirmation for create/edit/delete | Plan |
| List scale | Search + offset pagination (infinite scroll) | User wants both scale-readiness and search from day one, not deferred | Plan |
| Validation UX | Live (per-keystroke) validation + character counters | Fits the explicit "fajny design" requirement; first component in the app to do this | Plan |
| Discoverability | Wire a "Flashcards" link into the existing (unused) `Topbar`, on both `/dashboard` and `/flashcards` | Topbar already exists and is auth-aware; near-zero cost, avoids shipping an undiscoverable dead-end URL | Plan |
| Testing scope | Lint + build only, no new test runner | No test runner exists yet in the repo; introducing one is out of scope for a CRUD slice | Plan |
| Not-found vs not-owned | Both return 404, indistinguishably | RLS makes them look identical at the query level; distinguishing them would leak existence across users | Plan |

## Scope

**In scope:**
- `/api/flashcards` (GET list w/ search+pagination, POST create) and `/api/flashcards/[id]` (PATCH, DELETE)
- `/flashcards` page: list, search, infinite scroll, create/edit dialog, delete confirmation, toasts, empty/loading states
- `zod` validation shared between client and server
- Nav wiring (`Topbar` + `dashboard.astro`)
- Responsive, polished UI matching existing visual style

**Out of scope:**
- AI-generated flashcards / acceptance flow (S-01)
- SRS/review scheduling (S-02)
- Soft-delete or undo (hard delete only, per F-01)
- Bulk operations, sorting options, tags/categories
- New automated test runner
- Supabase-generated TypeScript types

## Architecture / Approach

Three vertical phases: (1) zod schemas + DTOs + a `src/lib/services/flashcards.ts` module wrapping every Supabase call, (2) thin Astro API routes over that service establishing the app's first JSON API conventions, (3) a React-island UI (`FlashcardDeck` + `FlashcardForm` + `DeleteFlashcardDialog`) mounted on a new `/flashcards` Astro page, using newly-added shadcn/ui primitives (Dialog, AlertDialog, Input, Textarea, Label, Card, Skeleton, Sonner). RLS continues to own per-user data isolation; the API layer adds an explicit 401 guard on top rather than relying on RLS's silent empty-result behavior for unauthenticated calls.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data & Validation Foundation | zod schemas, DTOs, Supabase service module, route protection | Getting the `user_id` insert / RLS interaction wrong (must be set explicitly, no DB default) |
| 2. API Routes | First JSON API in the app: list/create/update/delete with consistent status codes | No existing JSON-API precedent to copy — conventions are established here, not just followed |
| 3. UI — Flashcard Deck Page | Full `/flashcards` experience: search, infinite scroll, dialogs, toasts, nav | Search+pagination state getting out of sync on fast typing (mitigated via abort + debounce, see plan's Critical Implementation Details) |

**Prerequisites:** F-01 (done). No blockers.
**Estimated effort:** ~3 sessions, one per phase.

## Open Risks & Assumptions

- Roadmap frames S-01 as the product's "north star" hypothesis test; building S-03 first means the core AI-acceptance hypothesis stays unvalidated a while longer — explicitly accepted by the user.
- `.ilike` search with no trigram index is fine at MVP scale but will need revisiting if per-user decks grow very large.
- No generated Supabase types means DTOs and the DB schema can drift silently if a future migration changes a column without a matching `src/types.ts` update — worth flagging for future changes touching this table.

## Success Criteria (Summary)

- A user can create, edit, and delete a flashcard entirely by hand, with no dependency on AI, and see the change reflected immediately in their deck.
- A user's flashcards are never visible to or editable by another user (RLS holds under the new API/UI).
- The `/flashcards` page is a dedicated, discoverable, responsive route that feels visually consistent with the rest of the app.
