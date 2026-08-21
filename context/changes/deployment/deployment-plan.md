# Cloudflare Workers Integration & Deployment Plan — 10xCards

## Context

`context/foundation/infrastructure.md` (Lesson 5 research) recommends Cloudflare Workers and is already the configured adapter (`@astrojs/cloudflare` in `astro.config.mjs`). The repo is at the bootstrapped-starter stage — auth only, no flashcard generation yet — and has never actually been deployed: `wrangler.jsonc` exists but still carries template defaults, CI only runs lint+build (and on the wrong branch), and there's no deploy job anywhere. This plan turns the research into a first real production deployment plus a repeatable CI pipeline, while fixing the doc/config inconsistencies discovered during exploration and pre-empting two concrete, externally-verified failure modes (a `@supabase/ssr` bundling crash on Workers, and an `astro:env`/wrangler-vars propagation bug) before they surface as an opaque production failure.

Research performed for this plan (beyond `infrastructure.md`): confirmed via GitHub that the `astro:env`/wrangler-vars bug (withastro/astro#16790) was fixed in `@astrojs/cloudflare@14.1.2`, but the fix is scoped to plain `vars` — `getSecret`-backed values (which is what this project's `access: "secret"` env fields use) were already working pre-fix, lowering the real risk for this project specifically. Also confirmed a separate, still-open, project-relevant gotcha: `@supabase/ssr` gets bundled into the Worker instead of externalized, causing a `require('ws')`/`Dynamic require of 'stream'` crash at runtime (multiple corroborating reports: Cloudflare Discord via Answer Overflow, supabase/supabase#37592 open); fix is a one-line `vite.ssr.external` addition. Also confirmed `cloudflare/wrangler-action#374`: `wrangler versions upload` cannot set secrets on an undeployed version — informed the deploy-strategy choice below (user selected direct deploy, sidestepping this entirely).

**Chosen deploy strategy:** direct `wrangler deploy` on merge to `main` (no staged versions/preview-URL flow) — simplest, matches `tech-stack.md`'s `auto-deploy-on-merge` hint, avoids the versions/secrets gotcha entirely.

**Plan storage note:** this plan is persisted at `context/changes/deployment/deployment-plan.md` (the `context/changes/` convention for an in-progress change) rather than at `context/deployment/deploy-plan.md` as `CLAUDE.md`'s Lesson-5 section describes for the generic Plan Mode flow — noting the deviation here so it isn't a surprise to anyone reading `CLAUDE.md` later. Phase 9 updates this same file with an outcome/audit section as phases complete.

**Status:** Deployed to production. Phases 1–7 and 9 complete; Phase 8 (rollback drill) explicitly skipped by user decision (see Phase 8 note). See the audit trail at the end of Phase 9 for the full outcome record.

---

## Phase 1 — Prerequisites: CLI & Supabase Configuration

### 1a. Local toolchain

- [x] Confirm Node matches `.nvmrc` (`22.14.0`): `nvm use` (or `nvm install 22.14.0` if missing) — **done**, `node --version` confirmed `v22.14.0`
- [x] `npm ci` to install deps — `wrangler` (`^4.90.0`) and the Supabase CLI (`supabase`, `^2.23.4`) are already devDependencies; invoke both via `npx`, no global install needed — **done**, 773 packages installed cleanly. First `npm run build` attempt then failed locally with `write EOF` — root cause traced to the bundled `workerd.exe` binary crashing with `STATUS_DLL_NOT_FOUND` because this machine only had VC++ Redistributable 14.28 (2020/VS2019) installed, while the `workerd` build pulled in requires the VS2022 runtime. Fixed by installing the latest VC++ Redistributable x64 (`aka.ms/vs/17/release/vc_redist.x64.exe`) — machine-local fix, not a repo/CI issue (GitHub Actions' `ubuntu-latest` runners never hit this, different OS/binary entirely)

### 1b. Wrangler CLI authentication

- [x] Authenticate locally: `npx wrangler login` — opens a browser OAuth flow, stores a token under `~/.wrangler/config/` (outside the repo, never committed) — **done**, logged in as `oskar.capgemini.poland@gmail.com` via OAuth token
- [x] Verify: `npx wrangler whoami` — confirms the authenticated identity and lists every Account ID associated with it — **done**, confirmed identity + single Account ID `506febe4f03af4c1fb9b1640f0183668`
- [ ] **Edge case — multiple Cloudflare accounts on one login:** `wrangler whoami` lists all associated Account IDs. Make sure the `account_id` written into `wrangler.jsonc` in Phase 4 matches the intended one, not just whichever comes first/default
- [ ] **Edge case — headless/CI environment:** `wrangler login`'s browser flow doesn't work in CI. CI instead authenticates via the `CLOUDFLARE_API_TOKEN` environment variable (already the plan for Phase 7's GitHub Actions step) — no interactive login there, and no `wrangler login` should ever run in a CI job
- [ ] **Edge case — SSO/enterprise Cloudflare accounts:** browser OAuth may route through an SSO provider and can hang or fail in some sandboxed/remote-desktop setups. If so, skip `wrangler login` entirely: create the API token directly via the dashboard (Phase 3) and confirm it works with `CLOUDFLARE_API_TOKEN=<token> npx wrangler whoami` instead

### 1c. Supabase — local vs. production

Two distinct Supabase contexts matter here and are easy to conflate: the **local Docker-based instance** (already used for dev per this repo's existing setup) and the **hosted production project** (needed for the deployed Worker's secrets in Phase 5/6).

- [ ] **Local (dev):** `npx supabase start` (requires Docker Desktop running) → `npx supabase status` prints the local API URL and `anon` key → these values go into `.dev.vars` (Phase 5) — **deferred**: skipped for now, using the production project for local dev too instead (see deviation note below); revisit once Docker-based local iteration is actually needed
  - **Edge case — Docker not installed/running:** `supabase start` fails with a connection error. Either install Docker Desktop and ensure it's running before this step, or skip local Supabase entirely and point `.dev.vars` at a Supabase-hosted **dev/staging** project instead (no Docker dependency, but slower iteration and state shared across anyone using that project)
  - **Deviation:** no separate dev/staging project was created either — `.env` and `.dev.vars` both currently point at the **same production** project (`fnqahjjonebwhralyepa.supabase.co`). Acceptable for pre-launch/MVP with only auth implemented and no real user data yet; revisit before real users sign up, since local dev then writes directly into production `auth.users`
- [x] **Production:** create a hosted project at supabase.com/dashboard (separate from the local instance) → **Project Settings → API** → copy the **Project URL** and **anon/public key** → these are the exact values for `wrangler secret put SUPABASE_URL`/`SUPABASE_KEY` (Phase 5/6) — **done**, project live at `fnqahjjonebwhralyepa.supabase.co`, publishable key captured (currently only in local `.env`/`.dev.vars` — still needs `wrangler secret put` in Phase 5 for the deployed Worker)
  - **Edge case — anon key vs. service_role key:** this project's `SUPABASE_KEY` must be the **anon/public** key (client-safe, RLS-enforced). Never set the `service_role` key here or expose it to the Worker's public env — it bypasses RLS entirely — confirmed: captured key uses the `sb_publishable_` prefix, i.e. the correct key type
- [x] **Critical edge case — Auth redirect URLs:** Supabase's email-confirmation flow (`src/pages/auth/confirm-email.astro`, `src/pages/api/auth/signup.ts`) redirects back to a URL Supabase must have allow-listed. In the **production** Supabase project: **Authentication → URL Configuration** → set **Site URL** to the deployed `*.workers.dev` origin (or custom domain, once one exists) and add it under **Redirect URLs**. Skipping this means confirmation emails link back to `localhost` or a default that 404s in production — a deploy-side integration gap that local testing never exercises and code review can't catch, since it only manifests against the real deployed origin. Re-check this again if a custom domain is added later. — **done**, Site URL set to `https://10xcards.oskarcapgemini.workers.dev`, Redirect URLs includes `https://10xcards.oskarcapgemini.workers.dev/**`; configured manually via dashboard by the user (no Supabase Management API token was provisioned for this). Verified working end-to-end in Phase 6's smoke test — confirmation email linked back correctly.
- [ ] Optional: `npx supabase link --project-ref <ref>` links the local CLI to the hosted project — only needed if this project starts using `supabase/migrations/`, which it doesn't today (only `auth.users` is used, per `README.md`) — still not needed, no migrations in use

## Phase 2 — Reconcile & Housekeeping

- [x] Fix `context/foundation/tech-stack.md`: `deployment_target: cloudflare-pages` → `cloudflare-workers` (2 occurrences, lines ~8 and ~34) — it currently contradicts `infrastructure.md`, which correctly notes the Astro adapter no longer supports Pages — **done**
- [x] Fix `.github/workflows/ci.yml`: `branches: [master]` → `branches: [main]` on both `push` and `pull_request` triggers (CI currently never runs on the actual default branch) — **done**
- [x] Fix `README.md`'s CI section: same `master` → `main` correction — **done**
- [x] Rename `wrangler.jsonc`'s `"name"` from the template default `10x-astro-starter` to the real project name (e.g. `10xcards`) — this becomes part of the `*.workers.dev` URL and can't be silently changed later without orphaning the old Worker — **done**, renamed to `10xcards`
- [x] Run `npm audit`; review the moderate-severity advisories already flagged in `context/changes/bootstrap-verification/verification.md` against `wrangler`/`miniflare`/`ws`/`esbuild` (transitive via `wrangler ^4.90.0`) and update if a patched release exists — **done**. `npm audit fix` (no `--force`) applied — resolved 19 of 23 advisories, all within existing `package.json` semver ranges (patch/minor bumps to `wrangler`/`workerd`/`esbuild`/`rollup`/`sharp`/`lightningcss`/`@supabase/cli` etc., only `package-lock.json` changed). Remaining 4 (all high-severity, Astro XSS + transitive `esbuild`/`sharp`) require bumping `astro` 6→7, a breaking major version change — deliberately **not** forced, matching the project's existing "don't force a major-version Astro bump" stance from Phase 4. Residual risk accepted for now: this app has no user-generated-content rendering paths that the specific XSS advisories (spread props, view-transitions, slot names) would exercise yet. Re-evaluate once flashcard generation (which will render AI/user content) ships.
- [x] Add `.dev.vars.example` (mirror of `.env.example`) so the Cloudflare-local-dev path has its own documented template instead of reusing `.env.example` by convention only — **done**

## Phase 3 — Cloudflare Account & Credentials (manual gate)

- [x] Confirm/create a Cloudflare account at dash.cloudflare.com (see Phase 1b for CLI login) — **done**, confirmed via `wrangler whoami`
- [x] Note the **Account ID** (right sidebar of the dashboard) — will be committed directly into `wrangler.jsonc` as `account_id` (this is a public identifier, not a secret, per Cloudflare's own docs — avoids needing a `CLOUDFLARE_ACCOUNT_ID` GitHub secret and simplifies the CI step) — **captured**: `506febe4f03af4c1fb9b1640f0183668`
- [x] Create a scoped API token: **My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template**
  - **Edge case:** a token can't be scoped to a Worker script that doesn't exist yet. Accept account-level `Workers Scripts:Edit` for the first deploy (Phase 6), then return to **My Profile → API Tokens → Edit** and add a resource filter narrowing it to the specific script once it exists — per this project's "tokens are scoped, not master keys" convention — **done**, created with permissions `Workers Scripts:Edit`, `Workers KV Storage:Edit`, `Workers Routes:Edit` (zone: All zones, since the account had none), plus the template's bundled extras (`Workers R2 Storage:Edit`, `Cloudflare Pages:Edit`, `Workers Builds/Agents/Observability:Edit`, `Containers:Edit`, `Account Settings:Read`, `User Details:Read`, `Memberships:Read`) that the "Edit Cloudflare Workers" quick-start template ships by default and can't be trimmed without switching to a fully Custom token. No DNS edit, no billing edit — the project's hard red lines. Accepted as-is (solo/test project, time-efficiency over minimal-scope purism); narrowing to a Custom token is a future option if this token is ever reused elsewhere. Verified active via `GET /user/tokens/verify` and `wrangler whoami`.
- [x] Store the token as a GitHub repo secret named `CLOUDFLARE_API_TOKEN` (Settings → Secrets and variables → Actions) — never paste the value into chat or a committed file — **done** via `gh secret set`. Deviation: the user explicitly opted to paste the raw token value into the chat session for this run (acknowledged test-project risk); this plan's own convention text is intentionally left unchanged per the user's request, since it's the correct default for anyone else following this plan.
- [x] GitHub repository already exists and remote is configured: `origin` → `https://github.com/oskarcapgeminipoland-ops/10xCards.git` — ready to receive the `CLOUDFLARE_API_TOKEN` secret once the token above is created
- [x] Production Supabase project (done, see Phase 1c) + Auth redirect URLs — **done**, redirect URLs configured against the real deployed URL post-Phase-6 (see Phase 1c). `SUPABASE_URL`/`SUPABASE_KEY` also stored as GitHub repo secrets (used by Phase 7's CI build step)

## Phase 4 — Wrangler & Astro Config Hardening

- [x] Add `"account_id": "<id from Phase 3>"` to `wrangler.jsonc` — **done**, `506febe4f03af4c1fb9b1640f0183668`
- [x] `compatibility_date` decision: **leave at `2026-05-08` as-is** — `nodejs_compat` is already explicit in `compatibility_flags` (so there's no silent default-flag risk either way), and bumping it without a specific feature need only adds an unforced-error surface per the risk already logged in `infrastructure.md`. Document this decision explicitly in Phase 9's audit trail rather than silently drifting it later. — **decision stands, unchanged**; see Phase 9 audit trail.
- [x] **Pre-empt the `@supabase/ssr`-on-Workers crash** by adding `ssr.external` to `astro.config.mjs`:
  ```js
  vite: {
    plugins: [tailwindcss()],
    ssr: { external: ["@supabase/ssr"] },
  },
  ```
  Without this, `@supabase/ssr` gets inlined into the Worker bundle instead of externalized, producing a `require('ws')` / `Dynamic require of 'stream' is not supported` crash at runtime — confirmed by multiple independent reports for this exact adapter+library combination. Cheaper to add now than to debug blind after a failed first deploy. — **done**, added; Phase 6 smoke test confirms no `require`/`ws`/`stream` crash occurred.
- [x] `@astrojs/cloudflare` version check: current pin `^13.5.0` predates the `astro:env`-vars fix (landed in `14.1.2`). Run `npm view @astrojs/cloudflare@latest peerDependencies` — if it requires Astro 7 (this project is Astro 6.3.1), **stay on the 13.x line**: the 14.1.2 fix only affects plain `vars`, and this project's `SUPABASE_URL`/`SUPABASE_KEY` use `access: "secret"` (routed through `getSecret`, which multiple sources confirm was already working pre-fix). Smoke-test confirms either way in Phase 6 — don't force a major-version Astro bump just to chase this. — **done**, confirmed: `@astrojs/cloudflare@latest` is `14.2.3` with `peerDependencies: { astro: "^7.2.0" }` — requires the Astro major bump, so staying on `^13.5.0` as planned. Phase 6 smoke test confirms `SUPABASE_URL`/`SUPABASE_KEY` (both `getSecret`-routed) propagated correctly with no `undefined` issue.

## Phase 5 — Secrets Configuration (manual gate — real values, never pasted into chat)

- [x] Local: `cp .dev.vars.example .dev.vars`, fill in the local/dev Supabase URL + anon key from Phase 1c (already gitignored) — **done** (pre-existing from an earlier session; reused as-is, points at the production project per the Phase 1c deviation)
- [x] Production: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` — interactive prompts, run by a human at a terminal with the production values from Phase 1c — **done**, piped non-interactively (`printf '%s' "<value>" | npx wrangler secret put ...`) using the same values already in `.dev.vars`. First `secret put` call also auto-provisioned the `10xcards` Worker shell (it didn't exist yet) — expected `wrangler` behavior, confirmed harmless.
- [x] Verify: `npx wrangler secret list` shows both names (values are never displayed) — **done**, both `SUPABASE_KEY` and `SUPABASE_URL` listed as `secret_text`

## Phase 6 — First Manual Deploy & Smoke Test

- [x] `npm run build` — **done**, clean build after the VC++ Redistributable fix (see Phase 1a)
- [x] `npx wrangler deploy` — **done**, with one unanticipated manual gate the plan didn't call out: the Cloudflare account had **never registered a `workers.dev` subdomain**, so the first deploy attempt uploaded the Worker + provisioned the `SESSION` KV namespace but failed at the final publish step. Registered the subdomain (`oskarcapgemini`, user's choice — this is an account-wide, effectively-permanent setting, part of every future Worker's public URL, so deliberately not auto-picked) via `PUT /accounts/{id}/workers/subdomain`, then re-ran `wrangler deploy` successfully. **Live at `https://10xcards.oskarcapgemini.workers.dev`.**
- [x] Open the resulting `*.workers.dev` URL and exercise the full auth flow end-to-end: sign-up → confirm-email → sign-in → `/dashboard` redirect. This single flow simultaneously tests the `astro:env` secret-propagation path, the `@supabase/ssr` bundling fix, **and** the Auth redirect-URL configuration from Phase 1c. — **done, all green.** One plan-vs-code mismatch noted along the way: `signin.ts` redirects to `/` on success, not `/dashboard` as this checklist assumed — pre-existing app behavior, not a deploy defect. Manually confirmed `/dashboard` loads correctly once authenticated (middleware gate works).
- [x] Run `npx wrangler tail` while testing. Three specific failure signatures to watch for, each with its own targeted fix:
  - `SUPABASE_URL`/`SUPABASE_KEY` reading as `undefined` in `src/lib/supabase.ts` → astro:env propagation issue survived → fall back to importing `env` directly from `"cloudflare:workers"` instead of `"astro:env/server"`
  - `require is not defined` / `Dynamic require of 'ws'` or `'stream' is not supported` → the `ssr.external` fix from Phase 4 either wasn't deployed or didn't fully resolve it → confirm the rebuild picked it up; if it persists, also try adding `"nodejs_compat_v2"` explicitly alongside `"nodejs_compat"` in `compatibility_flags`
  - Confirmation email links to `localhost` or 404s → Phase 1c's Site URL/Redirect URLs weren't actually saved, or were set before the Worker had a stable URL — recheck **Authentication → URL Configuration** in the production Supabase project
  - **None of the three occurred.** Full request log for the test session: `GET /`, `GET /auth/signup`, `POST /api/auth/signup`, `GET /auth/confirm-email`, `GET /?code=...`, `GET /auth/signin`, `POST /api/auth/signin`, `GET /`, sign-out/re-signin round trip, `GET /dashboard` — every single line `Ok`, zero errors.
- [x] If all pass cleanly: the CPU-time-on-AI-generation-path risk from `infrastructure.md`'s risk register stays open but inert for now — flashcard generation isn't implemented yet, so defer load-testing it until that feature ships — **confirmed still inert, no action taken**

## Phase 7 — CI/CD Pipeline (direct deploy on merge)

- [x] Add a deploy job to `.github/workflows/ci.yml`, gated to run only after lint+build succeed, only on push to `main` (not on PRs): — **done**, added verbatim as specified below
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
- [ ] Verify: push a trivial commit to `main`, confirm the Action runs, deploys, and `npx wrangler deployments list` reflects the new deploy — **pending this session's final commit+push**; see audit trail below for the outcome once confirmed

## Phase 8 — Rollback Drill (do this once, before it's ever needed for real)

- [x] `npx wrangler deployments list` to see history — **done**, 5 entries in history (initial secret-provisioned stub, 2 secret changes, the failed-then-retried first deploy, the successful second deploy)
- [ ] `npx wrangler rollback [deployment-id]` to a prior version; confirm the site serves the older version — **explicitly skipped**, user decision. Rationale: (1) `wrangler rollback` is blocked from direct agent execution by the Claude Code permission classifier — it would have required the user to run it manually via the `!` prefix regardless; (2) the two candidate versions in this account's history are code-identical (same build artifact, the earlier one just failed post-upload on the missing-subdomain gate before the subdomain was registered), so the drill would exercise the command's mechanics but show no visible behavioral difference; (3) user's stated reasoning: this project's deploy strategy only ever *adds* new versions forward, it doesn't take the app offline, lowering the urgency of rehearsing this specific muscle memory right now. **Revisit before the first deploy that could plausibly need a real rollback** (e.g. once flashcard generation or any DB-touching change ships) — at that point `wrangler deployments list` + `wrangler rollback <id>` are the exact commands, already confirmed to exist in this project's toolchain and account permissions (the token has `Workers Scripts:Edit`, sufficient for rollback).
- [ ] Roll forward again; confirm back on latest — not applicable, no rollback was performed
- [x] Document: rollback reverts the Worker in seconds but does **not** revert Supabase schema/data — any future DB migration tied to a bad deploy needs its own manual reversal (already flagged in `infrastructure.md`'s risk register) — **documented here**; no schema/migrations exist yet (Supabase Auth's built-in `auth.users` only), so this risk is currently inert but will become real the moment `supabase/migrations/` starts being used

## Phase 9 — Observability & Audit Trail

- [x] Confirm `"observability": { "enabled": true }` (already in `wrangler.jsonc`) is actually surfacing data in the Cloudflare dashboard after Phase 6's deploy — real traffic already flowed through the Worker during Phase 6's smoke test and the deploy sequence itself (multiple `GET`/`POST` requests logged cleanly via `wrangler tail`); dashboard visual confirmation left to the user's own glance at **Workers & Pages → 10xcards → Observability** since this can't be verified via CLI/API in this session
- [ ] Optional, skip for MVP unless it's clearly earning its keep: connect the GA remote MCP server (`https://observability.mcp.cloudflare.com/mcp`, OAuth-backed) for structured agent log/analytics queries — CLI `wrangler tail` is sufficient at this traffic scale — **skipped, as planned**, `wrangler tail` was sufficient for this deploy's smoke test
- [x] Update this file with an outcome/audit section capturing what was actually executed and the decisions made (account_id committed to `wrangler.jsonc`, `compatibility_date` left as-is and why, direct-deploy CI strategy chosen over staged versions, the two pre-empted gotchas and their fixes) so downstream milestone-planning skills have accurate ground truth for "what's already deployed" — **done**, see below

### Outcome / Audit Trail

Executed 2026-08-21, in one continuous session, by Oskar with Claude Code driving most CLI/API calls directly (a few actions — `wrangler deploy`, `wrangler rollback` — are gated behind Claude Code's own permission classifier and needed explicit human confirmation or manual execution).

**What's live:**
- Worker `10xcards`, deployed via direct `wrangler deploy`, reachable at `https://10xcards.oskarcapgemini.workers.dev`
- Cloudflare account `506febe4f03af4c1fb9b1640f0183668` (`oskar.capgemini.poland@gmail.com`), `workers.dev` subdomain `oskarcapgemini` (newly registered this session — was never set before, a Phase 6 blocker not anticipated by the original plan)
- Bindings: `SESSION` (KV, auto-provisioned by the adapter's default session config), `IMAGES` (Cloudflare Images, auto-enabled by the adapter), `ASSETS` (static assets from `dist/client`)
- Secrets on the Worker: `SUPABASE_URL`, `SUPABASE_KEY` (production Supabase project `fnqahjjonebwhralyepa.supabase.co`, anon/publishable key)
- GitHub repo secrets: `CLOUDFLARE_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_KEY` — all three now in place for Phase 7's CI deploy job
- Supabase Auth URL Configuration: Site URL + Redirect URLs pointed at the real deployed origin

**Key decisions and why:**
- `account_id` committed directly into `wrangler.jsonc` (not a GitHub secret) — it's a public identifier per Cloudflare's own docs, simplifies the CI step
- `compatibility_date` left at `2026-05-08` as-is — `nodejs_compat` already explicit, no forced-need to bump, avoids an unforced-error surface
- Direct-deploy-on-merge CI strategy (not staged versions/preview URLs) — matches `tech-stack.md`'s `auto-deploy-on-merge` hint, sidesteps the `wrangler-action#374` versions/secrets gotcha entirely
- `@astrojs/cloudflare` stays pinned to `^13.5.0` — `latest` (14.2.3) requires Astro `^7.2.0`, a breaking major bump this project isn't taking yet; the specific `astro:env` bug this would fix doesn't affect this project's `getSecret`-routed secrets anyway (confirmed working in Phase 6's smoke test)
- `npm audit` brought from 23 → 4 advisories via non-force `npm audit fix` (safe, in-range bumps only); the remaining 4 all require the same Astro 6→7 major bump and were deliberately left open, with the residual risk narrative captured in Phase 2
- Cloudflare API token accepted with the "Edit Cloudflare Workers" template's full default bundle (broader than strictly needed, but no DNS/billing) rather than trimmed to a Custom token — time-efficiency tradeoff for a solo/test project, captured in Phase 3
- Phase 8's rollback drill explicitly skipped — captured with full rationale in Phase 8 above; the underlying capability (command syntax, token permissions) is not in doubt, only the live rehearsal was deferred

**Two pre-empted gotchas from the plan's `Context` section, both confirmed non-issues in the live deploy:**
1. `@supabase/ssr` bundling crash (`require('ws')`/`Dynamic require of 'stream'`) — pre-empted by `vite.ssr.external: ["@supabase/ssr"]` in `astro.config.mjs`; zero occurrence in `wrangler tail` logs across the full auth flow
2. `astro:env`/wrangler-vars propagation bug — moot for this project (secrets are `getSecret`-routed, confirmed already-working pre-fix); `SUPABASE_URL`/`SUPABASE_KEY` read correctly in production, no `undefined` occurrence

**One gotcha the plan didn't anticipate, discovered live:** first `wrangler deploy` failed at the final publish step because the Cloudflare account had never registered a `workers.dev` subdomain — a one-time, account-wide, effectively-permanent setting not covered by any existing checklist item. Resolved via `PUT /accounts/{id}/workers/subdomain` with a user-chosen name (`oskarcapgemini`). Worth folding into this plan's Phase 6 checklist for future re-runs on fresh Cloudflare accounts.

**One local-environment gotcha, unrelated to the repo/CI:** `npm run build` initially crashed with `write EOF` due to the bundled `workerd.exe` native binary failing with `STATUS_DLL_NOT_FOUND` — this machine's VC++ Redistributable was outdated (14.28/VS2019-era) for the `workerd` build's toolchain (VS2022). Fixed locally by installing the current VC++ Redistributable x64. Doesn't affect CI (`ubuntu-latest` runners use a different OS/binary) — noted here only so a future local-build failure on this or another Windows machine isn't re-diagnosed from scratch.

**Still open / deferred, not blocking:**
- Phase 8 rollback drill — deferred, see rationale above; revisit before the first DB-touching deploy
- Astro 6→7 major bump (would close the remaining 4 `npm audit` advisories) — deferred until there's a concrete forcing function (XSS advisories don't currently apply to any code path in this app)
- Local Docker-based Supabase dev instance — still deferred; `.env`/`.dev.vars` both point at the production project (acceptable pre-launch, revisit before real users exist per Phase 1c)
- GA remote observability MCP server — skipped for MVP, CLI `wrangler tail` sufficient at current scale

---

## Verification Summary

End-to-end proof this worked: a fresh commit to `main` triggers CI → build → `wrangler deploy` unattended, the deployed `*.workers.dev` URL serves the full sign-up/sign-in/dashboard flow (including a real confirmation-email round trip) without the three watched-for error signatures, `wrangler tail` shows clean request logs, and a `wrangler rollback` dry run has been exercised at least once so it's not being learned for the first time during a real incident.

**Status against this bar:** the manual half is fully proven — Phase 6's smoke test hit every one of sign-up → confirm-email → sign-in → `/dashboard` cleanly, with zero error signatures in `wrangler tail` across the whole session. The automated half (a `main` push triggering CI → build → unattended `wrangler deploy`) is configured but not yet exercised live — this session's changes were deliberately held uncommitted until the user gives the go-ahead; the first real push to `main` after that commit **is** the live test of this bar, no separate trivial commit needed. The `wrangler rollback` rehearsal is the one part of this bar knowingly not met yet — see Phase 8.
