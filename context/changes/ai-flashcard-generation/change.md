---
change_id: ai-flashcard-generation
title: Generate and triage AI flashcard proposals from pasted text
status: impl_reviewed
created: 2026-08-25
updated: 2026-08-26
archived_at: null
---

## Notes

Roadmap ID: S-01 — the north star slice (`context/foundation/roadmap.md`). The only PRD story with a full Given/When/Then, and the only one directly measurable against the main success criterion (75% AI-flashcard acceptance rate).

- Outcome: user pastes source text, requests AI-generated flashcard proposals, reviews the list, and for each one accepts / edits-then-accepts / rejects — accepted flashcards immediately appear in their set.
- PRD refs: US-01, FR-003, FR-004, FR-006
- Prerequisites: F-01 (flashcard-data-foundation) and F-02 (ai-provider-integration) — both `done`.
- Parallel with: S-03 (manual-flashcard-management) — already `done`.
- Per the roadmap, S-02 (first-review-session) is meant to follow immediately after this slice with nothing else sequenced in between, to validate the full first-loop hypothesis (generate → save → review) in one continuous push.
