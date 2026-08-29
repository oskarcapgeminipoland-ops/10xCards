---
change_id: testing-ai-generation-parsing
title: Testy jednostkowe potoku generowania AI — parsowanie i walidacja odpowiedzi LLM
status: archived
created: 2026-08-29
updated: 2026-08-29
archived_at: 2026-08-29T13:42:09Z
---

## Notes

Faza 1 rolloutu z `context/foundation/test-plan.md` §3: "Potok generowania AI — czysta walidacja i parsowanie".

Ryzyka pokryte:
- **#1** — potok po cichu odrzuca wszystkie propozycje mimo poprawnego wejścia / zmiana promptu psuje kontrakt JSON, bez błędu.
- **#5 (część)** — współdzielony schemat walidacji: pytanie ≤500, odpowiedź ≤1000, tekst źródłowy ≤5000; kopie rozjeżdżają się klient/serwer/DB.

Typ testów: unit (czyste funkcje, brak I/O).

Risk response intent:
- **#1**: udowodnij, że dla dowolnego stringa `content` z LLM potok zdejmuje code-fence ```json, odrzuca WYŁĄCZNIE elementy realnie niezgodne ze schematem, capuje do 5 i poprawnie liczy `droppedCount`; payload z fence / nie-tablica / częściowo zepsuty nigdy nie rzuca i nigdy nie zwraca `[]`, gdy zawierał poprawne elementy. Wyzwanie: „happy-path jest reprezentatywny" oraz „`droppedCount` jest kosmetyczny".
- **#5 (część)**: udowodnij, że schemat pytania/odpowiedzi odrzuca puste-po-trim i przekroczenie 500/1000 z komunikatem, przyjmuje wartości brzegowe, i jest to TEN SAM obiekt importowany przez route i formularz; przekroczony body do route → 400, nigdy surowy 500 z CHECK-a w DB.
