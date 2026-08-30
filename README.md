# 10xCards

An AI-assisted spaced-repetition flashcard app: paste text, get LLM-generated flashcard proposals, accept/edit/reject them, and review with an FSRS scheduler.

## Tech Stack

- [Astro](https://astro.build/) v6 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/przeprogramowani/10x-astro-starter.git
cd 10x-astro-starter
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier
- `npm run test` - Run unit tests
- `npm run test:e2e` - Run Playwright end-to-end tests (headless)
- `npm run test:e2e:ui` - Playwright UI mode: watch the browser run each step (`npx playwright test --ui`)

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

No database tables or migrations are required — this project uses Supabase Auth's built-in `auth.users` table only.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/settings`           | Account panel + learning stats (redirects to `/auth/signin` if unauthenticated) |
| `/dashboard`          | Legacy alias — 302-redirects to `/settings`                            |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

## End-to-End Tests

Playwright specs live in `e2e/` (driven by the `/10x-e2e` skill). They cover the
AI flashcard-generation journey end to end:

- `e2e/seed.spec.ts` — exemplar: a manually created flashcard survives a full page reload.
- `e2e/flashcard-generation-persists.spec.ts` — paste text → accept a generated proposal → the card persists across an SSR reload.
- `e2e/flashcard-generation-provider-error.spec.ts` — a provider rate-limit surfaces a retryable error, never a hung screen.

### Real vs mocked

Auth, routing, the `/api/flashcards/*` routes and the Supabase database run for
real. Only OpenRouter is faked — at the HTTP layer, by a local stub
(`e2e/support/openrouter-mock.mjs`) the runner starts automatically and the dev
server is pointed at via `OPENROUTER_BASE_URL`. Playwright manages both servers
itself on a dedicated port (**4331**), separate from `npm run dev` (4321).

### Setup

1. Install the browser once: `npx playwright install chromium`
2. Add a real test account to `.env` (Supabase points at prod — this project has
   no local DB):

   ```
   E2E_USERNAME=<test account email>
   E2E_PASSWORD=<test account password>
   ```

   `e2e/auth.setup.ts` signs in once and saves the session to
   `e2e/.auth/user.json` (gitignored); every spec then starts authenticated.

### Running locally

```bash
# headless, all specs (also what CI would run)
npm run test:e2e

# UI mode — pick a spec, press play, watch the browser render every step;
# the left panel lists each action with a DOM snapshot of what was clicked
npm run test:e2e:ui          # = npx playwright test --ui

# one real browser window, in real time
npx playwright test e2e/flashcard-generation-persists.spec.ts --headed

# step through action-by-action
npx playwright test e2e/seed.spec.ts --debug

# record a trace, then time-travel through before/after screenshots of every action
npx playwright test --trace on
npx playwright show-trace
```

Filter to one test with `-g "<title fragment>"`. The `setup` (login) project
always runs first — `chromium` depends on it.

> A run really signs in as the test account and really creates/deletes a
> flashcard in the production Supabase project. Each spec cleans up its own rows
> (unique `[e2e-…]` tag) through the API.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL` and `SUPABASE_KEY` as secrets in your Cloudflare dashboard or via `npx wrangler secret put`.

## CI

GitHub Actions runs lint + build on every push and PR to `main`. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets in GitHub for the build step.

## License

MIT
