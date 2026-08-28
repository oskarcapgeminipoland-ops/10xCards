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

## 10xDevs AI Toolkit - Module 2, Lesson 4

Prepare for a harder implementation stream with the **research-backed planning chain**:

```
internal research (/10x-research) + external research (exa.ai, Context7) -> /10x-plan -> /10x-implement -> success
```

The lesson focus is distinguishing internal from external research and using evidence to back planning decisions.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Internal research (lesson focus)** | |
| `/10x-research <change-id>` | You need evidence from the existing codebase — patterns, conventions, integration points, or existing implementations. Runs parallel sub-agents over the repo and writes structured findings to `research.md`. |
| **External research (lesson focus)** | |
| exa.ai | You need AI-native web search for library comparisons, best practices, or ecosystem context that the codebase cannot answer. |
| Context7 (`resolve-library-id` → `get-library-docs`) | You need live, current documentation for a specific library or framework. Resolves a library ID first, then fetches relevant doc pages. |
| **Framing spare wheel** | |
| `/10x-frame <change-id>` | The plan won't converge, the plan doesn't deliver expected results, or persistent drift keeps breaking the implementation. Use as an escape hatch on a separate problem (demonstrated on Space Explorers example), not as pre-research ritual. |
| **Planning and execution** | |
| `/10x-plan <change-id>` / `/10x-implement <change-id> phase <n>` | Use the same planning and execution chain from Lesson 2, now with upstream research evidence feeding the plan. |

### Research discipline

- Internal research (`/10x-research`) answers "what does our codebase already do?" — patterns, schemas, conventions, integration points.
- External research (exa.ai, Context7) answers "what should we do?" — library capabilities, API docs, ecosystem best practices.
- Combine both as evidence-backed input to `/10x-plan`. A plan without research evidence on a non-trivial stream is a guess.
- Agent-friendly docs (`llms.txt`, markdown-for-agents, `/md` endpoints) are a quality signal for library selection — libraries that publish agent-readable docs integrate faster.

### `/10x-frame` as spare wheel

Three triggers for reaching for `/10x-frame`:
1. The plan won't converge — research keeps opening more questions instead of narrowing to a contract.
2. The plan doesn't deliver — implementation repeatedly fails to meet success criteria.
3. Persistent drift — the implementation keeps diverging from the plan in ways that suggest the problem was mis-framed.

Demonstrated on a Space Explorers example, not the SRS path. It is an escape hatch, not a mandatory step.

### Paths used by this lesson

- `context/changes/<change-id>/research.md` - internal research output
- `context/changes/<change-id>/frame.md` - framing output when needed
- `context/changes/<change-id>/plan.md` - evidence-backed implementation contract
- `context/foundation/lessons.md` - recurring rules and pitfalls

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
