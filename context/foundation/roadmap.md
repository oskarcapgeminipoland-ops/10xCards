---
project: "10xCards"
version: 1
status: draft
created: 2026-08-22
updated: 2026-08-23
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: 10xCards

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Osoba samodzielnie ucząca się języka obcego rezygnuje ze spaced repetition, bo ręczne rozpisywanie fiszek z każdego nowego materiału jest zbyt czasochłonne. 10xCards obniża tę barierę: użytkownik wkleja tekst źródłowy, AI generuje propozycje fiszek, a użytkownik tylko akceptuje/edytuje/odrzuca — zamiast formułować pytania i odpowiedzi od zera. Zaakceptowane fiszki trafiają do gotowego algorytmu powtórek (SRS), który decyduje, kiedy każda z nich wróci do powtórki.

## North star

**S-01: Użytkownik wkleja tekst, generuje propozycje fiszek przez AI, akceptuje/edytuje/odrzuca każdą, a zaakceptowane trafiają do jego zestawu** — to jedyna historyjka w PRD z pełnym Given/When/Then i jedyna, która da się bezpośrednio zmierzyć wobec głównego kryterium sukcesu (75% akceptacji fiszek AI, 75% fiszek tworzonych przez AI zamiast ręcznie).

> "Gwiazda przewodnia" (north star) to tu najmniejszy kompletny fragment produktu, który — jeśli zadziała — dowodzi, że kluczowa hipoteza produktu jest prawdziwa: że AI potrafi z wklejonego tekstu wygenerować fiszki wystarczająco dobre, by ludzie je akceptowali zamiast pisać ręcznie. Umieszczamy ją najwcześniej, jak pozwalają na to jej zależności, bo cała reszta roadmapy ma sens tylko wtedy, gdy to się potwierdzi.
>
> Na wyraźną prośbę użytkownika, sekwencjonowanie traktuje S-01 razem z bezpośrednio następującym po nim S-02 (pierwsza sesja powtórek) jako jeden ciasno powiązany rdzeń walidacyjny: S-02 jest zaplanowany od razu po S-01, bez żadnego innego slice'a pomiędzy nimi, żeby jak najszybciej sprawdzić pełną pierwszą pętlę użytkownika (rejestracja → generowanie → akceptacja/zapis → pierwsza powtórka), nie tylko jej połowę.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
| --- | --- | --- | --- | --- | --- |
| F-01 | flashcard-data-foundation | (foundation) schemat + migracja + RLS dla encji fiszki (per-user izolacja) | — | Success Criteria (Guardrails), Access Control, FR-001, FR-002 | done |
| F-02 | ai-provider-integration | (foundation) minimalne okablowanie dostawcy AI (OpenRouter): klucz API, sekrety, cienki klient | — | FR-003, FR-004 | ready |
| S-01 | ai-flashcard-generation | wkleja tekst, generuje propozycje fiszek przez AI, akceptuje/edytuje/odrzuca, zaakceptowane widzi w swoim zestawie | F-01, F-02 | US-01, FR-003, FR-004, FR-006 | proposed |
| S-02 | first-review-session | rozpoczyna sesję powtórek, w której gotowy algorytm SRS dobiera fiszki z jego zestawu | S-01, F-01 | FR-009 | proposed |
| S-03 | manual-flashcard-management | ręcznie tworzy, edytuje i usuwa (z potwierdzeniem) fiszkę niezależnie od AI | F-01 | FR-005, FR-007, FR-008 | proposed |

## Streams

Pomoc nawigacyjna — grupuje elementy dzielące ten sam łańcuch zależności. Kanoniczna kolejność wciąż wynika z grafu zależności poniżej (`## Foundations` + `## Slices`); ta tabela to tylko proponowana kolejność czytania po równoległych ścieżkach.

| Stream | Theme | Chain | Note |
| --- | --- | --- | --- |
| A | Rdzeń pętli AI (generuj → zapisz → powtórz) | `F-01` → `S-01` → `S-02` | Cel = szybkość: dowozi gwiazdę przewodnią i pierwszą powtórkę jednym ciągiem — najkrótsza droga do sygnału o głównym kryterium sukcesu. |
| B | Okablowanie dostawcy AI | `F-02` → `S-01` | Dołącza do Stream A przy `S-01`; F-02 nie zależy od F-01, można budować równolegle. |
| C | Ręczne zarządzanie fiszkami | `S-03` | Zależy tylko od `F-01` (patrz Stream A); niezależny od `S-01`/`S-02` — dobry kandydat do równoległej pracy drugiego agenta. |

## Baseline

Stan repo na `2026-08-22` (auto-zbadany + potwierdzony przez użytkownika). Foundations poniżej zakładają, że to już istnieje i nie odbudowują tego od zera.

- **Frontend:** partial — szkielet Astro+React jest (`src/layouts/Layout.astro`, strony auth, `src/pages/dashboard.astro`, `src/components/ui/button.tsx`), ale brak jakiegokolwiek UI dla fiszek/generowania.
- **Backend / API:** partial — istnieją tylko endpointy auth (`src/pages/api/auth/{signin,signup,signout}.ts`); brak endpointów dla fiszek, generowania AI czy powtórek.
- **Data:** absent — brak migracji Supabase poza configiem (`supabase/config.toml`); jedyna istniejąca tabela to wbudowana `auth.users`. Brak tabeli fiszek.
- **Auth:** present — pełny flow e-mail+hasło (rejestracja, logowanie, wylogowanie, potwierdzenie e-maila w `src/pages/auth/`), middleware chroniący trasy (`src/middleware.ts`).
- **Deploy / infra:** present — `wrangler.jsonc` skonfigurowany pod Cloudflare Workers, CI+CD w GitHub Actions (`.github/workflows/ci.yml`) z auto-deploy na merge do `main`.
- **Observability:** partial — włączone wbudowane observability Cloudflare Workers (`wrangler.jsonc` → `observability.enabled`), brak dedykowanego trackingu błędów/metryk na poziomie appki.

## Foundations

### F-01: Fundament danych dla fiszek

- **Outcome:** (foundation) w bazie istnieje encja fiszki (pytanie, odpowiedź, właściciel, źródło ai/manual, status) z politykami RLS wymuszającymi, że użytkownik widzi wyłącznie własne fiszki.
- **Change ID:** flashcard-data-foundation
- **PRD refs:** Success Criteria → Guardrails (prywatność treści i fiszek), Access Control (płaski model uprawnień, tylko własne fiszki), FR-001, FR-002 (RLS opiera się na już istniejącym mechanizmie auth — `auth.uid()` — który przypisuje wiersze do właściciela)
- **Unlocks:** S-01, S-03 (obie potrzebują trwałego, izolowanego per-user magazynu fiszek zanim cokolwiek innego ma sens)
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Pominięcie jednego przemyślanego przejścia przez schemat + RLS teraz oznacza, że każdy kolejny slice (S-01–S-03) buduje na ad-hoc, nieprzejrzanym modelu danych zamiast na jednym miejscu, gdzie guardrail prywatności z PRD jest wymuszony raz, poprawnie.
- **Status:** done

### F-02: Okablowanie dostawcy AI

- **Outcome:** (foundation) skonfigurowany dostawca AI (OpenRouter) — klucz API zarządzany jako sekret (`wrangler secret put`), minimalny klient/wrapper gotowy do wywołania z kodu generowania.
- **Change ID:** ai-provider-integration
- **PRD refs:** FR-003, FR-004
- **Unlocks:** S-01 (jedyny slice wołający LLM — bez tego fundamentu generowanie w ogóle nie może wystartować)
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** Założenie konta OpenRouter + wygenerowanie klucza API — zewnętrzne działanie po stronie użytkownika, jeszcze niewykonane (brak zależności/klucza w repo).
- **Unknowns:** —
- **Risk:** Baseline pokazuje zero integracji z dostawcą AI (absent) — bez minimalnego klienta + sekretu S-01 (gwiazda przewodnia) nie może w ogóle wywołać LLM, więc ten fundament musi wylądować przed/równolegle z F-01.
- **Status:** ready

## Slices

### S-01: Użytkownik generuje i przegląda propozycje fiszek z wklejonego tekstu

- **Outcome:** wkleja tekst źródłowy, prosi o wygenerowanie fiszek przez AI, przegląda listę propozycji i dla każdej akceptuje / edytuje przed akceptacją / odrzuca — zaakceptowane fiszki natychmiast widzi w swoim zestawie.
- **Change ID:** ai-flashcard-generation
- **PRD refs:** US-01, FR-003, FR-004, FR-006
- **Prerequisites:** F-01, F-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** To jest gwiazda przewodnia: jedyny slice, który wprost testuje główne kryterium sukcesu (75% akceptacji fiszek AI). Zsekwencjonowanie go zaraz po jego dwóch fundamentach daje najszybszy realny sygnał, zgodnie z celem "szybkość wdrożenia".
- **Status:** proposed

### S-02: Użytkownik rozpoczyna pierwszą sesję powtórek

- **Outcome:** rozpoczyna sesję powtórek, w której gotowy algorytm SRS dobiera fiszki z jego zestawu do powtórzenia.
- **Change ID:** first-review-session
- **PRD refs:** FR-009
- **Prerequisites:** S-01, F-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - Który gotowy algorytm/biblioteka SRS zostanie użyta (PRD potwierdza tylko decyzję buy-vs-build, nie nazywa konkretnej biblioteki) — Owner: team (do rozstrzygnięcia w `/10x-plan`, nie tutaj). Block: no.
- **Risk:** Zsekwencjonowany bezpośrednio po S-01 na wyraźną prośbę użytkownika — chodzi o zwalidowanie pełnej pierwszej pętli (generuj → zapisz → powtórz) jednym ciągiem, nie tylko połowy hipotezy. Wybór konkretnej biblioteki SRS jest świadomie odłożony do planowania.
- **Status:** proposed

### S-03: Użytkownik ręcznie zarządza swoimi fiszkami

- **Outcome:** ręcznie tworzy fiszkę niezależnie od AI, edytuje istniejącą fiszkę oraz usuwa fiszkę po potwierdzeniu w dialogu.
- **Change ID:** manual-flashcard-management
- **PRD refs:** FR-005, FR-007, FR-008
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-02
- **Blockers:** —
- **Unknowns:**
  - FR-005, FR-007, FR-008 nie mają udokumentowanych historii Given/When/Then w PRD (tylko sam tekst FR) — Owner: user. Block: no (tekst FR + Socrates-rationale w PRD wystarczają jako pasek akceptacji; brak dedykowanego AC nie blokuje planowania).
- **Risk:** Ręczne zarządzanie to wymagany "siatka bezpieczeństwa" (guardrail: manualna ścieżka działa niezależnie od dostępności AI), ale nie testuje głównej hipotezy produktu — stąd sekwencjonowany po parze walidacyjnej S-01/S-02, choć może być budowany równolegle przez drugiego agenta.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
| --- | --- | --- | --- | --- |
| F-01 | flashcard-data-foundation | Fundament danych: schemat + RLS dla fiszek | yes | Run `/10x-plan flashcard-data-foundation` |
| F-02 | ai-provider-integration | Okablowanie dostawcy AI (OpenRouter): sekret + klient | yes | Run `/10x-plan ai-provider-integration`. Wymaga wcześniejszego założenia konta OpenRouter przez użytkownika. |
| S-01 | ai-flashcard-generation | Generowanie i triage fiszek przez AI z wklejonego tekstu | no | Zależy od F-01, F-02 — planuj po nich |
| S-02 | first-review-session | Pierwsza sesja powtórek (SRS) | no | Zależy od S-01, F-01 — planuj po nich; wybór biblioteki SRS do rozstrzygnięcia w trakcie planowania |
| S-03 | manual-flashcard-management | Ręczne tworzenie / edycja / usuwanie fiszek | no | Zależy od F-01 — planuj po nim |

## Open Roadmap Questions

1. **Tylko jedna historia użytkownika (US-01) jest udokumentowana w formacie Given/When/Then.** FR-001, FR-002 (rejestracja, logowanie) oraz FR-005–FR-009 (ręczne tworzenie, przeglądanie listy, edycja, usuwanie, rozpoczęcie sesji powtórek) nie mają odpowiadających im historii z kryteriami akceptacji. — Owner: user. Block: S-02, S-03 (nieblokujące — planowanie może przebiegać na podstawie tekstu FR, bez dedykowanego Given/When/Then).

## Parked

- **Własny algorytm powtórek** — Why parked: PRD §Non-Goals — świadoma decyzja buy-vs-build, używamy gotowego SRS zamiast budować własny (jak SuperMemo, Anki).
- **Import wielu formatów (PDF, DOCX itp.)** — Why parked: PRD §Non-Goals — jedynym wejściem dla generowania AI jest wklejony tekst (kopiuj-wklej).
- **Współdzielenie zestawów fiszek między użytkownikami** — Why parked: PRD §Non-Goals — każdy użytkownik ma własny, prywatny zestaw; spójne z guardrailem prywatności.
- **Integracja z innymi platformami edukacyjnymi** — Why parked: PRD §Non-Goals — produkt działa samodzielnie, bez importu/eksportu do zewnętrznych systemów.
- **Aplikacje mobilne** — Why parked: PRD §Non-Goals — na początek tylko web, zgodnie z `product_type: web-app`.
- **Eksport fiszek (PDF itp.)** — Why parked: PRD §Non-Goals — fiszki żyją wyłącznie wewnątrz aplikacji.

## Done

(Puste przy pierwszym wygenerowaniu. `/10x-archive` dopisze tu wpis — i przełączy `Status` odpowiadającego elementu na `done` — gdy zmiana o pasującym `Change ID` zostanie zarchiwizowana.)

- **F-01: (foundation) w bazie istnieje encja fiszki (pytanie, odpowiedź, właściciel, źródło ai/manual, status) z politykami RLS wymuszającymi, że użytkownik widzi wyłącznie własne fiszki.** — Archived 2026-08-23 → `context/archive/2026-08-22-flashcard-data-foundation/`. Lesson: —.
