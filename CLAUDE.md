# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

10xCards — an AI-assisted spaced-repetition flashcard app (paste text → LLM-generated flashcard proposals → accept/edit/reject → spaced-repetition review). Auth (email/password via Supabase), manual + AI-assisted flashcard management, and FSRS-based review sessions (`ts-fsrs`) are implemented. Full scope: `context/foundation/prd.md`.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules
- `npm run format` — Prettier (prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npm run test` — Vitest, scoped to `src/lib/fsrs/` (FSRS scheduling logic only; no Astro/React test integration is configured)

Pre-commit hooks (husky + lint-staged) run `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

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

## 10xDevs AI Toolkit - Module 2, Lesson 5

Scale the single-change cycle into parallel work with **worktrees, goal-directed delegation, and multi-session orchestration**:

```
worktree per change -> /goal or claude -p -> PR -> review -> merge
```

The lesson focus is safe throughput: isolated contexts, choosing the right execution mode, and capping parallelism at review capacity.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code isolation** | |
| `git worktree add` | You need a separate working directory for a parallel change. One change per worktree, one fresh agent context per worktree. |
| **Complex changes** | |
| `/10x-implement <change-id> phase <n>` | The change has multiple phases, needs manual gates, or benefits from interactive decision-making during execution. |
| **Simple changes** | |
| `/goal` | You have a clear, bounded task and want goal-directed delegation. The agent works autonomously toward the stated goal with a stop condition. |
| `claude -p` | You want headless execution for a well-defined task. The Ralph Wiggum loop (run, check, retry) is the universal autonomous pattern. |
| **Multi-session orchestration** | |
| Superset / Conductor / Antigravity / VS Code Agent View | You are running multiple agent sessions in parallel and need visibility, coordination, or session management across them. |

### Parallel work rules

- One change per worktree or isolated workspace. One fresh agent context per change.
- Choose interactive `/10x-implement` for complex changes, `/goal` or `claude -p` for simple ones.
- Parallelism is capped by review capacity. More agents without review means more unreviewed code, not higher throughput.
- The quality pain from faster shipping is intentional — it bridges into Module 3 testing gates.

### Lesson boundaries

- Do not reteach interactive `/10x-implement` or `/10x-impl-review`; those are Lessons 2 and 3.
- Do not introduce testing strategy here. The quality pain is the motivation for Module 3.
- Worktrees are a mechanism for isolation, not the topic of a full git tutorial.

### Paths used by this lesson

- `context/changes/<change-id>/` - active change folder
- `context/changes/<change-id>/plan.md` - implementation input for any execution mode

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
