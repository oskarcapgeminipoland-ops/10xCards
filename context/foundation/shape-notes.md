---
project: "10xCards"
context_type: greenfield
created: 2026-08-12
updated: 2026-08-12
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "primary persona scope"
      decision: "primary = self-directed foreign-language learner; secondary = exam-prep student"
    - topic: "pain category"
      decision: "workflow friction"
    - topic: "insight"
      decision: "AI/LLMs are only now good enough to generate accurate flashcards from arbitrary text"
    - topic: "auth strategy"
      decision: "email + password login; flat permission model, no admin roles in MVP"
  frs_drafted: 9
  quality_check_status: accepted
---

# Shape Notes — 10xCards

## Seed idea (verbatim, from idea-notes.md)

> ## 10xCards - MVP ideas
>
> ### Główny problem
> Manualne tworzenie wysokiej jakości fiszek edukacyjnych jest czasochłonne, co zniechęca do korzystania z efektywnej metody nauki jaką jest spaced repetition.
>
> ### Najmniejszy zestaw funkcjonalności
> - Generowanie fiszek przez AI na podstawie wprowadzonego tekstu (kopiuj-wklej)
> - Manualne tworzenie fiszek
> - Przeglądanie, edycja i usuwanie fiszek
> - Prosty system kont użytkowników do przechowywania fiszek
> - Integracja fiszek z gotowym algorytmem powtórek
>
> ### Co NIE wchodzi w zakres MVP
> - Własny, zaawansowany algorytm powtórek (jak SuperMemo, Anki)
> - Import wielu formatów (PDF, DOCX, itp.)
> - Współdzielenie zestawów fiszek między użytkownikami
> - Integracje z innymi platformami edukacyjnymi
> - Aplikacje mobilne (na początek tylko web)
> - Eksport fiszek (PDF itp.)
>
> ### Kryteria sukcesu
> - 75% fiszek wygenerowanych przez AI jest akceptowane przez użytkownika
> - Użytkownicy tworzą 75% fiszek z wykorzystaniem AI

---

## Vision & Problem Statement

Osoba samodzielnie ucząca się języka obcego, w momencie gdy przerabia nowy materiał (artykuł, rozdział podręcznika, lekcję) i chce utrwalić go metodą spaced repetition, staje przed koniecznością ręcznego rozpisania tego materiału na fiszki — na tyle czasochłonnym, że w praktyce rezygnuje z tej metody nauki, zanim zdąży z niej skorzystać.

Wysokiej jakości generowanie fiszek z dowolnego wklejonego tekstu wymaga modeli językowych (LLM), które dopiero od niedawna są wystarczająco dobre i tanie, by zrobić to trafnie i bez nadzoru eksperta. To obniża barierę wejścia do spaced repetition z "rozpisz ręcznie dziesiątki fiszek" do "wklej tekst i zaakceptuj propozycje".

## User & Persona

**Primary persona:** Samouk językowy — osoba samodzielnie ucząca się języka obcego, regularnie napotykająca nowe materiały (artykuły, rozdziały podręczników, lekcje) do przyswojenia. Sięga po produkt w momencie, gdy kończy przerabiać fragment materiału i chce utrwalić go metodą spaced repetition, ale nie chce tracić czasu na ręczne rozpisywanie fiszek — bez tego narzędzia w ogóle rezygnuje z tej metody nauki.

### Secondary persona

Student przygotowujący się do egzaminu z dużym materiałem do opanowania — ta sama potrzeba (zamiana materiału na fiszki bez ręcznej pracy), ale zdominowana presją czasową sesji egzaminacyjnej. MVP serwuje przede wszystkim personę główną.

## Access Control

Logowanie przez e-mail i hasło. Rejestracja i logowanie wymagane, by tworzyć, przechowywać i przeglądać fiszki — dane fiszek są przypisane do konta użytkownika i dostępne z dowolnego urządzenia po zalogowaniu.

Płaski model uprawnień: wszyscy zalogowani użytkownicy mają te same uprawnienia i widzą wyłącznie własne fiszki. Brak ról administracyjnych w MVP. Niezalogowany użytkownik trafiający na chronioną trasę jest kierowany do logowania/rejestracji.

## Success Criteria

### Primary
- 75% fiszek wygenerowanych przez AI jest akceptowane przez użytkownika (nie odrzucane).
- Użytkownicy tworzą 75% wszystkich swoich fiszek z wykorzystaniem generowania AI (a nie ręcznie).

### Secondary
- Użytkownicy wracają do aplikacji regularnie (retencja) — kontynuują sesje powtórek, a nie tylko jednorazowo generują zestaw fiszek.

### Guardrails
- Treść wklejona przez użytkownika oraz wygenerowane z niej fiszki nie są udostępniane innym użytkownikom — widoczne wyłącznie dla właściciela konta.
- Generowanie fiszek przez AI nie blokuje możliwości ręcznego tworzenia i edycji fiszek — manualna ścieżka działa niezależnie od dostępności/wydajności AI.

### MVP flow (locked)

1. Użytkownik rejestruje się / loguje (e-mail + hasło).
2. Wkleja tekst źródłowy (kopiuj-wklej).
3. AI generuje propozycje fiszek z tego tekstu.
4. Użytkownik przegląda propozycje — akceptuje / edytuje / odrzuca każdą.
5. Zaakceptowane fiszki trafiają do jego zestawu (można też dodać fiszkę ręcznie).
6. Użytkownik rozpoczyna sesję powtórek wykorzystującą gotowy algorytm SRS.

Szacowany budżet: 3 tygodnie pracy po godzinach — flow mieści się w budżecie, brak potrzeby scope-down.

## Functional Requirements

### Uwierzytelnianie
- FR-001: Użytkownik może zarejestrować konto przy użyciu adresu e-mail i hasła. Priority: must-have
  > Socrates: No counter-argument raised; stands as written.
- FR-002: Użytkownik może zalogować się na istniejące konto przy użyciu e-maila i hasła. Priority: must-have
  > Socrates: No counter-argument raised; stands as written.

### Generowanie fiszek przez AI
- FR-003: Użytkownik może wkleić tekst źródłowy, na podstawie którego AI wygeneruje propozycje fiszek. Priority: must-have
  > Socrates: No counter-argument raised; stands as written.
- FR-004: Użytkownik może dla każdej wygenerowanej propozycji: zaakceptować ją, edytować przed akceptacją, albo odrzucić. Priority: must-have
  > Socrates: No counter-argument raised; stands as written.

### Ręczne zarządzanie fiszkami
- FR-005: Użytkownik może ręcznie utworzyć fiszkę, niezależnie od AI. Priority: must-have
  > Socrates: Counter-argument considered: "skoro MVP jest AI-first, ręczne tworzenie mogłoby zostać odłożone do v2." Resolution: kept — formularz fiszki jest i tak potrzebny do edycji propozycji AI (FR-004) i edycji istniejących fiszek (FR-007), więc ręczne tworzenie jest tanim dodatkiem, nie osobnym kosztem.
- FR-006: Użytkownik może przeglądać listę swoich fiszek. Priority: must-have
  > Socrates: No counter-argument raised; stands as written.
- FR-007: Użytkownik może edytować istniejącą fiszkę. Priority: must-have
  > Socrates: No counter-argument raised; stands as written.
- FR-008: Użytkownik może usunąć fiszkę, po potwierdzeniu w dialogu potwierdzającym. Priority: must-have
  > Socrates: Counter-argument considered: "usuwanie bez potwierdzenia grozi przypadkową utratą danych." Resolution: FR rozszerzony o wymóg potwierdzenia przed usunięciem.

### Powtórki (spaced repetition)
- FR-009: Użytkownik może rozpocząć sesję powtórek, w której gotowy algorytm SRS dobiera fiszki z jego zestawu. Priority: must-have
  > Socrates: No counter-argument raised; stands as written.

## User Stories

### US-01: Użytkownik generuje fiszki z wklejonego tekstu

- **Given** zalogowany użytkownik z tekstem, który chce przekształcić w fiszki
- **When** wkleja tekst źródłowy i prosi o wygenerowanie fiszek przez AI
- **Then** widzi listę wygenerowanych propozycji fiszek, którą może przejrzeć — dla każdej propozycji zaakceptować, edytować przed akceptacją, albo odrzucić; zaakceptowane fiszki trafiają do jego zestawu

#### Acceptance Criteria
- Odrzucone propozycje są odrzucane i nie trafiają do zestawu użytkownika
- Edytowane propozycje zapisywane są z wprowadzonymi przez użytkownika zmianami, nie z oryginalną treścią wygenerowaną przez AI
- Zaakceptowane fiszki są natychmiast dostępne w widoku listy fiszek oraz w puli fiszek do powtórek

## Business Logic

Aplikacja łączy generowanie fiszek przez AI z gotowym algorytmem powtórek, by wspólnie decydować, czego użytkownik powinien się nauczyć i kiedy powinien to powtórzyć.

Regułę zasilają dwa rodzaje wejść od użytkownika: tekst źródłowy wklejony do wygenerowania fiszek oraz oceny przypomnienia (recall), które użytkownik podaje podczas sesji powtórek. Wyjściem reguły jest zestaw fiszek pytanie-odpowiedź oraz harmonogram określający, kiedy każda fiszka pojawi się ponownie w sesji powtórek.

Użytkownik napotyka tę regułę jako dwa niewidoczne "za kulisami" mechanizmy: fiszki same się tworzą z wklejonego tekstu (bez ręcznego formułowania pytań i odpowiedzi), a następnie same wracają we właściwym momencie podczas sesji powtórek (bez ręcznego planowania, kiedy co powtórzyć).

## Non-Functional Requirements

- Generowanie fiszek z wklejonego tekstu daje użytkownikowi widoczną informację zwrotną (ciągły sygnał postępu, następnie wynik) — użytkownik nigdy nie zostaje z pustym/zawieszonym ekranem podczas oczekiwania na AI.
- Produkt jest w pełni użyteczny na najnowszych dwóch wersjach głównych przeglądarek desktopowych.

## Non-Goals

- **Brak własnego algorytmu powtórek** — używamy gotowego, sprawdzonego algorytmu SRS zamiast budować własny (jak SuperMemo, Anki); to świadoma decyzja buy-vs-build, nie luka.
- **Brak importu wielu formatów (PDF, DOCX itp.)** — jedynym wejściem dla generowania AI jest wklejony tekst (kopiuj-wklej).
- **Brak współdzielenia zestawów fiszek między użytkownikami** — każdy użytkownik ma własny, prywatny zestaw; spójne z guardrailem prywatności z Fazy 3.
- **Brak integracji z innymi platformami edukacyjnymi** — produkt działa samodzielnie, bez importu/eksportu do zewnętrznych systemów.
- **Brak aplikacji mobilnych** — na początek tylko web, zgodnie z `product_type: web-app`.
- **Brak eksportu fiszek (PDF itp.)** — fiszki żyją wyłącznie wewnątrz aplikacji.

## Quality cross-check

All elements present — no gaps recorded. Access Control, Business Logic, Project artifacts, Timeline-cost acknowledgment, and Non-Goals all passed on first check (greenfield session; Preserved behavior n/a).

---

