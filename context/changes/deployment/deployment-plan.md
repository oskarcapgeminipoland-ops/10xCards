# Cloudflare Workers Integration & Deployment Plan — 10xCards

## Context

`context/foundation/infrastructure.md` (Lesson 5 research) recommends Cloudflare Workers and is already the configured adapter (`@astrojs/cloudflare` in `astro.config.mjs`). The repo is at the bootstrapped-starter stage — auth only, no flashcard generation yet — and has never actually been deployed: `wrangler.jsonc` exists but still carries template defaults, CI only runs lint+build (and on the wrong branch), and there's no deploy job anywhere. This plan turns the research into a first real production deployment plus a repeatable CI pipeline, while fixing the doc/config inconsistencies discovered during exploration and pre-empting two concrete, externally-verified failure modes (a `@supabase/ssr` bundling crash on Workers, and an `astro:env`/wrangler-vars propagation bug) before they surface as an opaque production failure.

Research performed for this plan (beyond `infrastructure.md`): confirmed via GitHub that the `astro:env`/wrangler-vars bug (withastro/astro#16790) was fixed in `@astrojs/cloudflare@14.1.2`, but the fix is scoped to plain `vars` — `getSecret`-backed values (which is what this project's `access: "secret"` env fields use) were already working pre-fix, lowering the real risk for this project specifically. Also confirmed a separate, still-open, project-relevant gotcha: `@supabase/ssr` gets bundled into the Worker instead of externalized, causing a `require('ws')`/`Dynamic require of 'stream'` crash at runtime (multiple corroborating reports: Cloudflare Discord via Answer Overflow, supabase/supabase#37592 open); fix is a one-line `vite.ssr.external` addition. Also confirmed `cloudflare/wrangler-action#374`: `wrangler versions upload` cannot set secrets on an undeployed version — informed the deploy-strategy choice below (user selected direct deploy, sidestepping this entirely).

**Chosen deploy strategy:** direct `wrangler deploy` on merge to `main` (no staged versions/preview-URL flow) — simplest, matches `tech-stack.md`'s `auto-deploy-on-merge` hint, avoids the versions/secrets gotcha entirely.

**Plan storage note:** this plan is persisted at `context/changes/deployment/deployment-plan.md` (the `context/changes/` convention for an in-progress change) rather than at `context/deployment/deploy-plan.md` as `CLAUDE.md`'s Lesson-5 section describes for the generic Plan Mode flow — noting the deviation here so it isn't a surprise to anyone reading `CLAUDE.md` later. Phase 9 updates this same file with an outcome/audit section as phases complete.

**Status:** Not yet executed — this is the plan, not an audit log. Check boxes off as each phase completes.

---

## Phase 1 — Prerequisites: CLI & Supabase Configuration

### 1a. Local toolchain

- [ ] Confirm Node matches `.nvmrc` (`22.14.0`): `nvm use` (or `nvm install 22.14.0` if missing)
- [ ] `npm ci` to install deps — `wrangler` (`^4.90.0`) and the Supabase CLI (`supabase`, `^2.23.4`) are already devDependencies; invoke both via `npx`, no global install needed

### 1b. Wrangler CLI authentication

- [ ] Authenticate locally: `npx wrangler login` — opens a browser OAuth flow, stores a token under `~/.wrangler/config/` (outside the repo, never committed)
- [ ] Verify: `npx wrangler whoami` — confirms the authenticated identity and lists every Account ID associated with it
- [ ] **Edge case — multiple Cloudflare accounts on one login:** `wrangler whoami` lists all associated Account IDs. Make sure the `account_id` written into `wrangler.jsonc` in Phase 4 matches the intended one, not just whichever comes first/default
- [ ] **Edge case — headless/CI environment:** `wrangler login`'s browser flow doesn't work in CI. CI instead authenticates via the `CLOUDFLARE_API_TOKEN` environment variable (already the plan for Phase 7's GitHub Actions step) — no interactive login there, and no `wrangler login` should ever run in a CI job
- [ ] **Edge case — SSO/enterprise Cloudflare accounts:** browser OAuth may route through an SSO provider and can hang or fail in some sandboxed/remote-desktop setups. If so, skip `wrangler login` entirely: create the API token directly via the dashboard (Phase 3) and confirm it works with `CLOUDFLARE_API_TOKEN=<token> npx wrangler whoami` instead

### 1c. Supabase — local vs. production

Two distinct Supabase contexts matter here and are easy to conflate: the **local Docker-based instance** (already used for dev per this repo's existing setup) and the **hosted production project** (needed for the deployed Worker's secrets in Phase 5/6).

- [ ] **Local (dev):** `npx supabase start` (requires Docker Desktop running) → `npx supabase status` prints the local API URL and `anon` key → these values go into `.dev.vars` (Phase 5)
  - **Edge case — Docker not installed/running:** `supabase start` fails with a connection error. Either install Docker Desktop and ensure it's running before this step, or skip local Supabase entirely and point `.dev.vars` at a Supabase-hosted **dev/staging** project instead (no Docker dependency, but slower iteration and state shared across anyone using that project)
- [ ] **Production:** create a hosted project at supabase.com/dashboard (separate from the local instance) → **Project Settings → API** → copy the **Project URL** and **anon/public key** → these are the exact values for `wrangler secret put SUPABASE_URL`/`SUPABASE_KEY` (Phase 5/6)
  - **Edge case — anon key vs. service_role key:** this project's `SUPABASE_KEY` must be the **anon/public** key (client-safe, RLS-enforced). Never set the `service_role` key here or expose it to the Worker's public env — it bypasses RLS entirely
- [ ] **Critical edge case — Auth redirect URLs:** Supabase's email-confirmation flow (`src/pages/auth/confirm-email.astro`, `src/pages/api/auth/signup.ts`) redirects back to a URL Supabase must have allow-listed. In the **production** Supabase project: **Authentication → URL Configuration** → set **Site URL** to the deployed `*.workers.dev` origin (or custom domain, once one exists) and add it under **Redirect URLs**. Skipping this means confirmation emails link back to `localhost` or a default that 404s in production — a deploy-side integration gap that local testing never exercises and code review can't catch, since it only manifests against the real deployed origin. Re-check this again if a custom domain is added later.
- [ ] Optional: `npx supabase link --project-ref <ref>` links the local CLI to the hosted project — only needed if this project starts using `supabase/migrations/`, which it doesn't today (only `auth.users` is used, per `README.md`)

## Phase 2 — Reconcile & Housekeeping

- [ ] Fix `context/foundation/tech-stack.md`: `deployment_target: cloudflare-pages` → `cloudflare-workers` (2 occurrences, lines ~8 and ~34) — it currently contradicts `infrastructure.md`, which correctly notes the Astro adapter no longer supports Pages
- [ ] Fix `.github/workflows/ci.yml`: `branches: [master]` → `branches: [main]` on both `push` and `pull_request` triggers (CI currently never runs on the actual default branch)
- [ ] Fix `README.md`'s CI section: same `master` → `main` correction
- [ ] Rename `wrangler.jsonc`'s `"name"` from the template default `10x-astro-starter` to the real project name (e.g. `10xcards`) — this becomes part of the `*.workers.dev` URL and can't be silently changed later without orphaning the old Worker
- [ ] Run `npm audit`; review the moderate-severity advisories already flagged in `context/changes/bootstrap-verification/verification.md` against `wrangler`/`miniflare`/`ws`/`esbuild` (transitive via `wrangler ^4.90.0`) and update if a patched release exists
- [ ] Add `.dev.vars.example` (mirror of `.env.example`) so the Cloudflare-local-dev path has its own documented template instead of reusing `.env.example` by convention only

## Phase 3 — Cloudflare Account & Credentials (manual gate)

- [ ] Confirm/create a Cloudflare account at dash.cloudflare.com (see Phase 1b for CLI login)
- [ ] Note the **Account ID** (right sidebar of the dashboard) — will be committed directly into `wrangler.jsonc` as `account_id` (this is a public identifier, not a secret, per Cloudflare's own docs — avoids needing a `CLOUDFLARE_ACCOUNT_ID` GitHub secret and simplifies the CI step)
- [ ] Create a scoped API token: **My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template**
  - **Edge case:** a token can't be scoped to a Worker script that doesn't exist yet. Accept account-level `Workers Scripts:Edit` for the first deploy (Phase 6), then return to **My Profile → API Tokens → Edit** and add a resource filter narrowing it to the specific script once it exists — per this project's "tokens are scoped, not master keys" convention
- [ ] Store the token as a GitHub repo secret named `CLOUDFLARE_API_TOKEN` (Settings → Secrets and variables → Actions) — never paste the value into chat or a committed file
- [ ] Production Supabase project + Auth redirect URLs are already handled in Phase 1c — confirm those values are in hand before Phase 5

## Phase 4 — Wrangler & Astro Config Hardening

- [ ] Add `"account_id": "<id from Phase 3>"` to `wrangler.jsonc`
- [ ] `compatibility_date` decision: **leave at `2026-05-08` as-is** — `nodejs_compat` is already explicit in `compatibility_flags` (so there's no silent default-flag risk either way), and bumping it without a specific feature need only adds an unforced-error surface per the risk already logged in `infrastructure.md`. Document this decision explicitly in Phase 9's audit trail rather than silently drifting it later.
- [ ] **Pre-empt the `@supabase/ssr`-on-Workers crash** by adding `ssr.external` to `astro.config.mjs`:
  ```js
  vite: {
    plugins: [tailwindcss()],
    ssr: { external: ["@supabase/ssr"] },
  },
  ```
  Without this, `@supabase/ssr` gets inlined into the Worker bundle instead of externalized, producing a `require('ws')` / `Dynamic require of 'stream' is not supported` crash at runtime — confirmed by multiple independent reports for this exact adapter+library combination. Cheaper to add now than to debug blind after a failed first deploy.
- [ ] `@astrojs/cloudflare` version check: current pin `^13.5.0` predates the `astro:env`-vars fix (landed in `14.1.2`). Run `npm view @astrojs/cloudflare@latest peerDependencies` — if it requires Astro 7 (this project is Astro 6.3.1), **stay on the 13.x line**: the 14.1.2 fix only affects plain `vars`, and this project's `SUPABASE_URL`/`SUPABASE_KEY` use `access: "secret"` (routed through `getSecret`, which multiple sources confirm was already working pre-fix). Smoke-test confirms either way in Phase 6 — don't force a major-version Astro bump just to chase this.

## Phase 5 — Secrets Configuration (manual gate — real values, never pasted into chat)

- [ ] Local: `cp .dev.vars.example .dev.vars`, fill in the local/dev Supabase URL + anon key from Phase 1c (already gitignored)
- [ ] Production: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` — interactive prompts, run by a human at a terminal with the production values from Phase 1c
- [ ] Verify: `npx wrangler secret list` shows both names (values are never displayed)

## Phase 6 — First Manual Deploy & Smoke Test

- [ ] `npm run build`
- [ ] `npx wrangler deploy`
- [ ] Open the resulting `*.workers.dev` URL and exercise the full auth flow end-to-end: sign-up → confirm-email → sign-in → `/dashboard` redirect. This single flow simultaneously tests the `astro:env` secret-propagation path, the `@supabase/ssr` bundling fix, **and** the Auth redirect-URL configuration from Phase 1c.
- [ ] Run `npx wrangler tail` while testing. Three specific failure signatures to watch for, each with its own targeted fix:
  - `SUPABASE_URL`/`SUPABASE_KEY` reading as `undefined` in `src/lib/supabase.ts` → astro:env propagation issue survived → fall back to importing `env` directly from `"cloudflare:workers"` instead of `"astro:env/server"`
  - `require is not defined` / `Dynamic require of 'ws'` or `'stream' is not supported` → the `ssr.external` fix from Phase 4 either wasn't deployed or didn't fully resolve it → confirm the rebuild picked it up; if it persists, also try adding `"nodejs_compat_v2"` explicitly alongside `"nodejs_compat"` in `compatibility_flags`
  - Confirmation email links to `localhost` or 404s → Phase 1c's Site URL/Redirect URLs weren't actually saved, or were set before the Worker had a stable URL — recheck **Authentication → URL Configuration** in the production Supabase project
- [ ] If all pass cleanly: the CPU-time-on-AI-generation-path risk from `infrastructure.md`'s risk register stays open but inert for now — flashcard generation isn't implemented yet, so defer load-testing it until that feature ships

## Phase 7 — CI/CD Pipeline (direct deploy on merge)

- [ ] Add a deploy job to `.github/workflows/ci.yml`, gated to run only after lint+build succeed, only on push to `main` (not on PRs):
  ```yaml
  deploy:
    needs: ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx astro sync
      - run: npm run build
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
      - uses: cloudflare/wrangler-action@v4
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy
  ```
  (`account_id` isn't passed as an action input since it's committed in `wrangler.jsonc` per Phase 4.)
- [ ] Verify: push a trivial commit to `main`, confirm the Action runs, deploys, and `npx wrangler deployments list` reflects the new deploy

## Phase 8 — Rollback Drill (do this once, before it's ever needed for real)

- [ ] `npx wrangler deployments list` to see history
- [ ] `npx wrangler rollback [deployment-id]` to a prior version; confirm the site serves the older version
- [ ] Roll forward again; confirm back on latest
- [ ] Document: rollback reverts the Worker in seconds but does **not** revert Supabase schema/data — any future DB migration tied to a bad deploy needs its own manual reversal (already flagged in `infrastructure.md`'s risk register)

## Phase 9 — Observability & Audit Trail

- [ ] Confirm `"observability": { "enabled": true }` (already in `wrangler.jsonc`) is actually surfacing data in the Cloudflare dashboard after Phase 6's deploy
- [ ] Optional, skip for MVP unless it's clearly earning its keep: connect the GA remote MCP server (`https://observability.mcp.cloudflare.com/mcp`, OAuth-backed) for structured agent log/analytics queries — CLI `wrangler tail` is sufficient at this traffic scale
- [ ] Update this file with an outcome/audit section capturing what was actually executed and the decisions made (account_id committed to `wrangler.jsonc`, `compatibility_date` left as-is and why, direct-deploy CI strategy chosen over staged versions, the two pre-empted gotchas and their fixes) so downstream milestone-planning skills have accurate ground truth for "what's already deployed"

---

## Verification Summary

End-to-end proof this worked: a fresh commit to `main` triggers CI → build → `wrangler deploy` unattended, the deployed `*.workers.dev` URL serves the full sign-up/sign-in/dashboard flow (including a real confirmation-email round trip) without the three watched-for error signatures, `wrangler tail` shows clean request logs, and a `wrangler rollback` dry run has been exercised at least once so it's not being learned for the first time during a real incident.
