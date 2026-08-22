# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

10xCards — an AI-assisted spaced-repetition flashcard app (paste text → LLM-generated flashcard proposals → accept/edit/reject → spaced-repetition review). Currently at the bootstrapped-starter stage: only auth (email/password via Supabase) is implemented; flashcard generation and review are not yet built. Full scope: `context/foundation/prd.md`.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules
- `npm run format` — Prettier (prettier-plugin-astro + prettier-plugin-tailwindcss)

No test runner is configured yet. Pre-commit hooks (husky + lint-staged) run `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

Astro 6 SSR app (`output: "server"` in `astro.config.mjs`) with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui, deployed to Cloudflare Workers via `@astrojs/cloudflare`. All pages and API routes render server-side by default; opt a specific page into static prerendering with `export const prerender = true` if ever needed.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client (`@supabase/ssr`, cookie-based sessions) from `astro:env/server` vars `SUPABASE_URL`/`SUPABASE_KEY`; returns `null` if either is unset, so callers must handle a missing client.
- `src/middleware.ts` — runs on every request, resolves the user into `context.locals.user`, and redirects unauthenticated requests away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`. Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`. Protected-page example: `src/pages/dashboard.astro`.

### Conventions

- Path alias `@/*` → `./src/*`.
- Astro components for static content/layout; React only where interactivity is needed. Extract hooks to `src/components/hooks/`.
- Merge Tailwind classes with `cn()` from `@/lib/utils` (clsx + tailwind-merge) — don't concatenate class strings manually.
- shadcn/ui components live in `src/components/ui/` ("new-york" style); add new ones with `npx shadcn@latest add [name]`.
- Validate API route input with zod (not yet a dependency — add it when the first route needs body validation).
- Supabase migrations go in `supabase/migrations/` (create via `npx supabase migration new <name>`); enable RLS with granular per-operation, per-role policies on every new table.
- Services/business logic go in `src/lib/` (or `src/lib/services/`); shared types (entities, DTOs) go in `src/types.ts`.

### Environment

- Node v22.14.0 (`.nvmrc`).
- `SUPABASE_URL`/`SUPABASE_KEY`: copy `.env.example` to `.env` (Node) or `.dev.vars` (Cloudflare local dev, gitignored).
- Local Supabase: `npx supabase start` (requires Docker). No migrations exist yet — only Supabase Auth's built-in `auth.users` table is used.
- Deploy: `npx wrangler deploy`.

## CI

`.github/workflows/ci.yml` runs lint + build on push/PR — but its branch triggers are still `master` while the repo's default branch is `main`, so CI currently won't fire on pushes to `main`. Requires `SUPABASE_URL`/`SUPABASE_KEY` repo secrets for the build step.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 2

Turn one roadmap item into the first implementation cycle with the **change planning chain**:

```
/10x-roadmap -> /10x-new -> /10x-plan -> /10x-plan-review -> /10x-implement
```

`/10x-new`, `/10x-plan`, `/10x-plan-review`, and `/10x-implement` are the lesson focus. `/10x-frame` and `/10x-research` are not required rituals here; they are escalation paths introduced in the next lesson.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Change setup (lesson focus)** | |
| `/10x-new <change-id>` | You selected a roadmap item and need a stable change folder. Creates `context/changes/<change-id>/change.md` so planning, implementation, progress, commits, and later review all share one identity. Use AFTER roadmap selection, BEFORE `/10x-plan`. |
| **Planning (lesson focus)** | |
| `/10x-plan <change-id>` | You have a change folder and need a reviewable implementation plan. Reads roadmap context, foundation docs, codebase evidence, and any existing change notes; writes `plan.md` and `plan-brief.md` with phases, file contracts, success criteria, and `## Progress`. |
| **Plan readiness (lesson focus)** | |
| `/10x-plan-review <change-id>` | You have `plan.md` and need a light pre-code readiness check. Use it to catch missing end state, weak contracts, malformed progress, scope drift, or blind spots before code changes begin. |
| **Implementation (lesson focus)** | |
| `/10x-implement <change-id> phase <n>` | You have an approved plan and want to execute one phase with verification, manual gate, commit ritual, and SHA write-back to `## Progress`. |
| **Lifecycle closure** | |
| `/10x-archive <change-id>` | A change is merged or intentionally closed. Move it out of active `context/changes/` into archive state. |

### How the chain hands off

- `/10x-new` creates the durable change identity.
- `/10x-plan` turns that identity into an implementation contract.
- `/10x-plan-review` checks the plan before the agent mutates code.
- `/10x-implement` executes one planned phase, verifies, asks for manual confirmation when needed, commits, and records progress.

### Lesson boundaries

- Plan is the default router after roadmap selection. Start with `/10x-plan` unless the problem is unclear or external evidence is blocking.
- Do not run `/10x-frame + /10x-research` as ceremony for every change.
- Do not turn this lesson into a full end-to-end product build. A checkpoint with a planned and partially or fully implemented stream is valid.
- Code review of the implemented diff belongs to Lesson 3 via `/10x-impl-review`.
- Lifecycle closure via `/10x-archive` after a change is merged or intentionally closed.

### Paths used by this lesson

- `context/foundation/roadmap.md` - upstream roadmap
- `context/changes/<change-id>/change.md` - change identity
- `context/changes/<change-id>/plan.md` - implementation contract
- `context/changes/<change-id>/plan-brief.md` - compressed handoff
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
