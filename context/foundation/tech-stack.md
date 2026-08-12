---
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
---

## Why this stack

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
