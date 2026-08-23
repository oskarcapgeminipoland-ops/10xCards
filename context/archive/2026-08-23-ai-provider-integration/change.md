---
change_id: ai-provider-integration
title: AI provider integration - OpenRouter key, secrets, and thin client
status: archived
created: 2026-08-23
updated: 2026-08-23
archived_at: 2026-08-23T17:02:09Z
---

## Notes

Roadmap item: F-02 (ai-provider-integration) — see `context/foundation/roadmap.md`.

Outcome: (foundation) skonfigurowany dostawca AI (OpenRouter) — klucz API zarządzany jako sekret (`wrangler secret put`), minimalny klient/wrapper gotowy do wywołania z kodu generowania.

PRD refs: FR-003, FR-004.

Unlocks: S-01 (jedyny slice wołający LLM). Prerequisites: none. Parallel with: F-01 (already done).

Blocker status: OpenRouter account + API key have already been created and wired as of 2026-08-23 — `OPENROUTER_API_KEY` is registered in `astro.config.mjs` env schema, set in `.dev.vars` (local dev) and pushed as a Cloudflare Worker secret (prod). What's still open for this change: the actual thin client/wrapper code that calls OpenRouter from generation code (not yet built).
