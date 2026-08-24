---
change_id: manual-flashcard-management
title: Manual flashcard management - create, edit, and delete
status: implementing
created: 2026-08-23
updated: 2026-08-24
archived_at: null
---

## Notes

Roadmap item: S-03 (manual-flashcard-management) — see `context/foundation/roadmap.md`.

Outcome: ręcznie tworzy fiszkę niezależnie od AI, edytuje istniejącą fiszkę oraz usuwa fiszkę po potwierdzeniu w dialogu.

PRD refs: FR-005, FR-007, FR-008.

Prerequisites: F-01 (done). Parallel with: S-01, S-02.

Sequencing note: roadmap frames S-01 as the north star and suggests S-03 after the S-01/S-02 validation pair, but the user deliberately chose to start with S-03 first — it's unblocked today, gives full CRUD + reusable list/edit/delete UI, and validates F-01's schema/RLS in practice before building the AI generation flow on top of it.

UI requirements called out up front: responsive layout, polished ("fajny") design, and a deliberate URL structure with the full flashcard deck living on its own dedicated page/route.

Unknowns: FR-005, FR-007, FR-008 nie mają udokumentowanych historii Given/When/Then w PRD (tylko sam tekst FR) — nieblokujące, tekst FR + rationale w PRD wystarczają jako pasek akceptacji.
