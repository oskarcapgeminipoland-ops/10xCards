---
change_id: first-review-session
title: First review session powered by ts-fsrs spaced repetition
status: archived
created: 2026-08-27
updated: 2026-08-28
archived_at: 2026-08-28T10:15:25Z
---

## Notes

Review triage complete: F1-F6 all resolved (2 fixed-as-documented, 3 code-fixed, 1 fixed + recorded as lesson). See `reviews/impl-review.md`.

Roadmap: S-02 (`context/foundation/roadmap.md`). Outcome: użytkownik rozpoczyna sesję powtórek, w której gotowy algorytm SRS dobiera fiszki z jego zestawu do powtórzenia. Prerequisites: S-01, F-01 (oba `done`). PRD refs: FR-009.

Biblioteka SRS rozstrzygnięta przez użytkownika poza planowaniem roadmapy: **ts-fsrs**.

Zakres zgłoszony przez użytkownika:
- Sesja powtórek dobierająca fiszki z bazy (AI + manualne) wg algorytmu FSRS.
- Przebieg pojedynczej powtórki: pytanie → własna odpowiedź użytkownika → odkrycie odpowiedzi referencyjnej z fiszki → ocena trudności (Again/Hard/Good/Easy) napędzająca ts-fsrs.
- Trwały stan FSRS per fiszka (stability, difficulty, due date, reps, lapses itd.) — nowy zakres danych ponad `F-01`.

Otwarte pytania do rozstrzygnięcia w `/10x-plan`: dobór puli fiszek na sesję (tylko "due" wg FSRS vs. limit dzienny), czy sesja ma podsumowanie/koniec, gdzie żyje logika FSRS (serwer vs. klient, biorąc pod uwagę SSR na Cloudflare Workers), kształt nowej tabeli/migracji na stan powtórek.
