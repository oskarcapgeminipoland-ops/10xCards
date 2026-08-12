---
bootstrapped_at: 2026-08-12T18:35:28Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: 10xcards
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10xcards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack

A solo learner shipping 10xCards in 3 weeks of after-hours work needs a
battle-tested, agent-friendly starter that handles auth and a database out of
the box rather than assembling them by hand — the flow (register/login, paste
text, AI-generated flashcard proposals, accept/edit/reject, spaced-repetition
review sessions) leans on both auth and an AI-generation step from day one.
Astro + React + TypeScript + Supabase + Cloudflare is the recommended default
for (web-app, js), clears all four agent-friendly gates, and its bootstrapper
confidence is first-class — mostly-smooth scaffolding with occasional manual
steps. Auth and AI feature flags are set; payments, realtime, and background
jobs are out of scope per the PRD. CI runs on GitHub Actions with
auto-deploy-on-merge, and deployment targets Cloudflare Pages — what the
starter ships with by default.

## Pre-scaffold verification

| Signal             | Value                                              | Severity | Notes                                                                 |
| ------------------- | --------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| npm package         | not run                                              | n/a      | `cmd_template` starts with `git clone`; no npm package to resolve      |
| GitHub repo         | przeprogramowani/10x-astro-starter last pushed 2026-05-17 | fresh    | from card `docs_url`, via `gh api` fallback (`gh` unavailable; used GitHub REST API directly) |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20 top-level entries (19 moved silently, 1 sidelined as a `.scaffold` sibling); includes full `src/`, `public/`, `supabase/`, `.github/`, `.husky/`, `.vscode/`, and `node_modules/` trees
**Conflicts (.scaffold siblings)**: CLAUDE.md → CLAUDE.md.scaffold (cwd's existing CLAUDE.md was kept)
**.gitignore handling**: moved silently (cwd had no pre-existing `.gitignore`)
**.bootstrap-scaffold cleanup**: deleted (including its cloned `.git/`, removed before move-up per the git-clone strategy)

`context/` in cwd was not touched — the scaffold carried no `context/` path of its own, so the "always preserved" rule had nothing to drop.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 1 CRITICAL, 13 HIGH, 7 MODERATE, 2 LOW (23 total)
**Direct vs transitive**: 0/1/2/0 direct of total 1/13/7/2 (direct packages: `astro` [high, direct], `supabase` [moderate, direct], `wrangler` [moderate, direct]; the CRITICAL finding is transitive via `tar`, pulled in by `supabase`)

#### CRITICAL findings

- **tar** (transitive, via `supabase`) — range `<=7.5.20` — GHSA-23hp-3jrh-7fpw: node-tar Decompression/parse DoS via unlimited input (CVSS 7.5, tiered CRITICAL by npm audit). Fix available (`npm audit fix`).

#### HIGH findings

- **astro** (direct) — range `<=7.0.9` — multiple advisories: GHSA-8hv8-536x-4wqp (reflected XSS via unescaped slot name, CVSS 7.1), GHSA-2pvr-wf23-7pc7 (SSRF in prerendered error page fetch, CVSS 7.5), plus several moderate/low XSS advisories bundled in the same chain. Fix available.
- **brace-expansion** (transitive) — range `<=1.1.17 || 3.0.0 - 5.0.8` — GHSA-3jxr-9vmj-r5cp / GHSA-mh99-v99m-4gvg / GHSA-rgw5-rvv9-x895 (DoS via exponential/unbounded expansion). Fix available.
- **devalue** (transitive) — range `5.6.3 - 5.8.0` — GHSA-77vg-94rm-hx3p: DoS via sparse array deserialization (CVSS 7.5). Fix available.
- **fast-uri** (transitive) — range `3.0.0 - 3.1.4` — GHSA-v2hh-gcrm-f6hx / GHSA-7p8r-x3mc-p8w7 / GHSA-4c8g-83qw-93j6: host confusion via backslash/IDN authority parsing (CVSS 7.5). Fix available.
- **js-yaml** (transitive) — range `4.0.0 - 4.3.0` — GHSA-52cp-r559-cp3m / GHSA-5p4m-2wfm-xmqj: quadratic-CPU DoS via merge-key/omap handling (CVSS 7.5). Fix available.
- **miniflare** (transitive, via `sharp`/`undici`/`ws`) — range `<=0.0.0-fff677e35 || 3.20250204.0 - 5.20260801.0-alpha` — inherits high findings from its dependencies. Fix available.
- **nanoid** (transitive) — range `<=3.3.16` — GHSA-28wg-ghj8-5hjv / GHSA-2v37-7h3g-55p8: generators can loop indefinitely (CVSS 5.9, tiered high). Fix available.
- **postcss** (transitive) — range `<=8.5.22` — GHSA-r28c-9q8g-f849: path traversal via sourceMappingURL leading to arbitrary `.map` disclosure (CVSS 7.5). Fix available.
- **sharp** (transitive, via `astro`/`miniflare`) — range `<0.35.0` — GHSA-f88m-g3jw-g9cj: inherited libvips CVEs (2026-33327/33328/35590/35591). Fix available.
- **svgo** (transitive) — range `4.0.0 - 4.0.1` — GHSA-2p49-hgcm-8545: `removeScripts` plugin leaves some executable scripts intact (CVSS 8.2). Fix available.
- **undici** (transitive, via `miniflare`) — range `7.0.0 - 7.28.0` — multiple advisories incl. GHSA-vmh5-mc38-953g (TLS cert validation bypass via SOCKS5 proxy, CVSS 7.4), GHSA-hm92-r4w5-c3mj (cross-origin request routing via proxy pool reuse, CVSS 7.5), GHSA-4cwx-7wf7-3272 (cache-directive info disclosure, CVSS 7.4). Fix available.
- **vite** (transitive) — range `7.0.0 - 7.3.3` — GHSA-fx2h-pf6j-xcff: `server.fs.deny` bypass on Windows alternate paths (CVSS 7.5). Fix available.
- **ws** (transitive, via `@cloudflare/vite-plugin`/`miniflare`) — range `8.0.0 - 8.20.1` — GHSA-96hv-2xvq-fx4p: memory exhaustion DoS via tiny fragments (CVSS 7.5). Fix available.

#### MODERATE findings

- **@astrojs/language-server** (transitive, via `volar-service-yaml`) — GHSA class advisory, no CVE cited directly on this node.
- **@cloudflare/vite-plugin** (transitive, via `miniflare`/`wrangler`/`ws`).
- **supabase** (direct) — range `1.1.6 - 2.98.2` — via `tar`.
- **volar-service-yaml** (transitive, via `yaml-language-server`).
- **wrangler** (direct) — range `<=0.0.0-kickoff-demo || 3.108.0 - 4.101.0` — via `esbuild`/`miniflare`.
- **yaml** (transitive) — GHSA-48c2-rrv3-qjmp: stack overflow via deeply nested YAML collections (CVSS 4.3).
- **yaml-language-server** (transitive, via `yaml`).

#### LOW / INFO findings

- **@babel/core** (transitive) — GHSA-4x5r-pxfx-6jf8: arbitrary file read via sourceMappingURL comment (CVSS 3.2).
- **esbuild** (transitive, affects `astro`/`wrangler`) — GHSA-g7r4-m6w7-qqqr: arbitrary file read on Windows dev server (CVSS 2.5).

Full raw `npm audit --json` output was captured during the run (not persisted verbatim in this log to keep it readable — the counts and per-package rollup above are a complete summary of every advisory node in the report). `npm audit fix` is available for all listed packages; bootstrapper did not run it — see Next steps.

## Hints recorded but not acted on

| Hint                     | Value               |
| ------------------------ | -------------------- |
| bootstrapper_confidence  | first-class           |
| quality_override         | false                 |
| path_taken               | standard              |
| self_check_answers       | null                  |
| team_size                | solo                  |
| deployment_target        | cloudflare-pages      |
| ci_provider               | github-actions        |
| ci_default_flow          | auto-deploy-on-merge  |
| has_auth                 | true                  |
| has_payments             | false                 |
| has_realtime             | false                 |
| has_ai                   | true                  |
| has_background_jobs      | false                 |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history — the cloned starter's `.git/` was deliberately deleted before move-up.
- Review `CLAUDE.md.scaffold` against your existing `CLAUDE.md` and decide what (if anything) to merge in — the starter's version was sidelined, not applied.
- Address audit findings per your project's risk tolerance: 1 CRITICAL (transitive, via `tar`) and 13 HIGH (1 direct: `astro`) are the ones worth triaging first. `npm audit fix` covers all of them per the audit tool's own report, but bootstrapper did not run it — the full breakdown is in this log.
