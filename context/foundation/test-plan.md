# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-08-29

## 1. Strategy

Testy w tym projekcie kierują się trzema nienegocjowalnymi zasadami:

1. **Koszt × sygnał.** Wygrywa najtańszy test, który daje realny sygnał dla
   danego ryzyka. Nie promuj do e2e dlatego, że e2e „wydaje się bezpieczniejsze".
   Nie nakładaj modelu wizyjnego na deterministyczny diff wizualny, który już
   łapie tę regresję.
2. **Obawy użytkownika to pełnoprawny dowód.** Ryzyka zakotwiczone w „zespół
   martwi się o X, a porażka ujawniłaby się gdzieś w obszarze <…>" mają taką
   samą wagę jak linijki PRD czy dane o churnie.
3. **Ryzyka to scenariusze, nie lokalizacje w kodzie.** Ten plan dokumentuje
   *co może zawieść* i *dlaczego uważamy to za prawdopodobne* — na podstawie
   dokumentów, wywiadu i *sygnału* z kodu (churn, struktura, baza testów). NIE
   twierdzi, że wie, która linia jest właścicielem porażki. Tę wiedzę produkuje
   `/10x-research` w trakcie każdej fazy rolloutu. Jeśli plan i research nie
   zgadzają się co do tego, gdzie żyje porażka — ground truth jest research.

Zakres hot-spotów użyty do ważenia prawdopodobieństwa: `src/`
(jednolity kod aplikacji Astro/React w TS; bez monorepo; wykluczone `context/`,
`supabase/migrations/`, `dist/`, `node_modules/`, konfiguracja).

## 2. Risk Map

Najważniejsze scenariusze porażki, przed którymi projekt musi się bronić,
uporządkowane wg ryzyka = impact × likelihood. Ryzyka są scenariuszami porażki
w kategoriach użytkownika/biznesu, nie nazwami testów. Kolumna Source cytuje
*dowód, który wyniósł to ryzyko na wierzch* — nigdy konkretny plik jako „miejsce,
gdzie żyje porażka" (to zadanie researchu, patrz §1 zasada #3).

| # | Risk (scenariusz porażki) | Impact | Likelihood | Source (dowód — nie kotwica) |
|---|---|---|---|---|
| 1 | Użytkownik wkleja poprawny tekst i dostaje **pusty lub bezużytecznie krótki** zestaw propozycji fiszek — potok (zdjęcie code-fence → walidacja per-item → cap do 5 → `droppedCount`) po cichu odrzuca wszystko, albo zmiana promptu psuje kontrakt JSON. Brak błędu, więc nikt się nie orientuje. | High | High | wywiad Q1 + Q3 + Q4; `context/archive/2026-08-25-ai-flashcard-generation/plan.md` (Testing Strategy: logika parsowania = „highest-value first target"); hot-spot `src/lib/services/` (10 commitów/30d), `src/lib/schemas/` (5 commitów/30d) |
| 2 | Awaria dostawcy AI (429 free-tier / timeout / sieć / zła konfiguracja) **kończy się pustym lub zawieszonym ekranem** zamiast czytelnym komunikatem z działającym „Spróbuj ponownie" — mapowanie wariantów błędu → status HTTP → tekst dla użytkownika pęka lub nowa ścieżka błędu jest nieobsłużona. | High | High | PRD §Non-Functional Requirements („użytkownik nigdy nie zostaje z pustym/zawieszonym ekranem"); `context/foundation/infrastructure.md` §Risk Register (zmienność free-tier, limit CPU-time Workers); `context/archive/2026-08-25-ai-flashcard-generation/plan.md` (tabela mapowania typu błędu na status); wywiad Q3 |
| 3 | Żądanie uwierzytelnione jako użytkownik B **czyta lub modyfikuje fiszkę albo stan powtórek użytkownika A** przez endpoint API (accept, aktualizacja/usuwanie po `id`, submit powtórki). Dla ścieżki submit RLS na tabeli stanu powtórek waliduje wyłącznie `user_id` nowego wiersza, **nie to, na co wskazuje jego klucz obcy do fiszki** — jawny pre-check własności w warstwie serwisu jest jedyną granicą. | High | Med | PRD §Access Control + §Success Criteria (Guardrails — prywatność treści i fiszek); `context/archive/2026-08-27-first-review-session/plan.md` §Critical Implementation Details (RLS nie waliduje własności przez FK); hot-spot `src/pages/api/` (12 commitów/30d) |
| 4 | Tekst wpisany w wyszukiwarkę fiszek **wstrzykuje dodatkowe warunki** do zapytania PostgREST — poprzedni fix escapował metaznaki mini-języka filtrów (`,` `.` `(` `)` `\`) oraz wildcardy LIKE (`%` `_`), ale brak testu regresyjnego, więc refactor tej funkcji po cichu otwiera lukę z powrotem. | Med | Med | `context/foundation/lessons.md` (lekcja: escapuj wszystkie metaznaki mini-języka filtrów PostgREST, nie tylko SQL-LIKE); hot-spot `src/lib/services/` (10 commitów/30d) |
| 5 | Ścieżka create/edit **zapisuje treść łamiącą wspólne limity**, albo limity klient / serwer / DB **rozjeżdżają się** — jeden schemat walidacji (pytanie ≤500, odpowiedź ≤1000) jest współdzielony przez formularz i route, drugi (tekst źródłowy ≤5000) po obu stronach; zmiana jednej kopii bez odbicia w pozostałych daje albo odrzucenie CHECK w DB jako surowy 500, albo przyjęcie zbyt długiej treści. | Med | Med | wywiad Q4; `context/archive/2026-08-23-manual-flashcard-management/plan.md` + `context/archive/2026-08-25-ai-flashcard-generation/plan.md` (intencja utrzymania limitów w lockstep klient/serwer/DB); hot-spot `src/lib/schemas/` (5 commitów/30d), `src/types.ts` (5 commitów/30d) |
| 6 | Kolejka powtórek **po cichu gubi fiszki nigdy nie powtarzane** albo źle sortuje sesję — dobór due („wiersz stanu jest null LUB due ≤ now") oraz porządek („due rosnąco, NULL na końcu; never-reviewed dopełnia; cap 20") są sklejane w kodzie aplikacji zamiast w SQL LEFT JOIN. Błąd w kształcie INNER JOIN = nowe fiszki użytkownika nigdy nie trafiają do powtórki. | Med | Med | `context/archive/2026-08-27-first-review-session/plan.md` §Critical Implementation Details + §Performance Considerations (LEFT vs INNER JOIN; sklejanie w kodzie odeszło od pierwotnego planu); wywiad Q4 (sąsiednie — „wyświetlanie" listy/talii) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| #1 | Dla danego stringa `content` z LLM potok zdejmuje code-fence ```json, odrzuca **tylko** elementy realnie niezgodne ze schematem, capuje do 5 i poprawnie liczy `droppedCount`; payload z fence / nie-tablica / częściowo zepsuty nigdy nie rzuca i nigdy nie zwraca `[]`, gdy były w nim poprawne elementy | „odpowiedź z happy-path jest reprezentatywna" — free-tier owija w fence, dodaje prozę, zwraca obiekt zamiast tablicy, przekracza długość; „`droppedCount` jest kosmetyczny" — to jedyny sygnał, że doszło do częściowej porażki | dokładne brzmienie kontraktu promptu; regex zdejmujący fence; gdzie dziś żyje walidacja per-item + cap (podział na moduł parsujący vs serwis); czy moduł parsujący jest import-clean (bez `astro:env/server`) | unit (czyste funkcje, brak I/O) | oracle problem — asercja „wynik == to, co parser wypluł na nagranej realnej odpowiedzi"; zamiast tego ręcznie zbudowane adversarialne stringi `content` z niezależnie znanym poprawnym wynikiem |
| #2 | Każdy wariant błędu klienta OpenRouter (config / timeout / network / api-429 / api-inne) mapuje na swój status HTTP i komunikat w route, a wyspa generatora **wychodzi** ze stanu „generating" do widocznego stanu błędu z działającym retry dla każdego wariantu — nigdy nie kręci się w kółko | „200 od OpenRouter oznacza sukces" (semantycznie zły content to też błąd); „stan końcowy = error, więc UI się podniósł" (maszyna faz może nie wyjść z „generating" na każdej gałęzi) | tabela typ-błędu → status → tekst w route generowania; przejścia maszyny faz w wyspie generatora; jak klient klasyfikuje AbortError vs błąd sieci | integration dla route (mock granicy `complete()` / `fetch`) + unit na reduktorze faz wyspy, jeśli da się go wyodrębnić; e2e tylko gdy logiki wyspy nie da się wyizolować | happy-path-only; over-mock (test sprawdza własny mock); asercja tekstu komunikatu słowo w słowo (sprawdzaj mapowanie, toleruj brzmienie) |
| #3 | Żądanie jako użytkownik B nie może zaakceptować/edytować/usunąć fiszki użytkownika A ani utworzyć/zmienić wiersza stanu powtórek wskazującego na `flashcard_id` użytkownika A — każde zwraca 404 (not-found ≡ not-owned) i **nie zapisuje żadnego wiersza** | „RLS to załatwia" — dla ścieżki submit RLS waliduje tylko własny `user_id` nowego wiersza, nie cel klucza obcego, więc jawny pre-check własności w serwisie jest faktyczną granicą; „zalogowany ⇒ uprawniony" | pre-check własności w serwisie powtórek; polityki RLS obu tabel; konwencja not-found-vs-not-owned w route po `id`; czy route accept ustawia `user_id` po stronie serwera, nie z body | integration przeciw lokalnemu Supabase z dwoma zaseedowanymi użytkownikami (RLS nie da się ćwiczyć unitem) | test z jednym użytkownikiem (nigdy nie przechodzi ścieżki cross-account); asercja na kształcie 200/403/404 skopiowanym z handlera zamiast weryfikacji, że wiersz w DB nie powstał/nie zmienił się |
| #4 | Fraza z metaznakami mini-języka filtrów PostgREST (`,` `.` `(` `)` `\`) oraz wildcardami LIKE (`%` `_`) jest traktowana jako **literał podłańcucha** — nie dodaje warunków OR, nie poszerza wyniku poza wiersze wołającego, nie wywala zapytania | „escapowanie `%` i `_` wystarczy" (mini-język filtrów ma własne metaznaki); „RLS czyni to bezpiecznym, więc test zbędny" (RLS ogranicza zasięg, ale injection to nadal defekt) | dokładna konstrukcja stringa filtra / `.or()`; helper escapujący i które znaki pokrywa; czy gdzieś użyto łańcuchowanego `.ilike()` zamiast interpolacji | unit na helperze escapującym (string → escapowany string) + jedno integracyjne wyszukiwanie z wrogą frazą (zbiór wierszy niezmieniony) | oracle problem — oczekiwany string escapowany skopiowany z outputu samego helpera; zamiast tego wyprowadź oczekiwane escapowanie z gramatyki PostgREST niezależnie |
| #5 | Schemat pytania/odpowiedzi odrzuca puste-po-trim i przekroczenie 500/1000 z komunikatem, przyjmuje wartości brzegowe, i jest to **ten sam obiekt** importowany przez route i formularz; schemat tekstu źródłowego egzekwuje 5000 identycznie po obu stronach; przekroczony body do route → **400, nigdy surowy 500** z CHECK-a w DB | „walidacja po stronie klienta wystarczy" (serwer musi rewalidować); „CHECK w DB jest backstopem" (naruszenie CHECK wychodzi jako 500, nie czyste 400) | dokładne limity w schematach; CHECK-i w migracji; wszystkie miejsca importu schematu; jak route mapuje błąd walidacji na 400 | unit (schemat in/out) + cienki integration, że przekroczony POST zwraca 400 | wyprowadzanie stałej limitu w teście ze schematu (introspekcja `.max`) zamiast twardego 500/1000/5000 wziętego niezależnie z wymagań/DB |
| #6 | Dla miksu fiszek never-reviewed i wcześniej powtarzanych: kolejka sesji zawiera **każdą** never-reviewed (do capu 20), wyklucza te z `due > now()`, sortuje most-overdue-first z never-reviewed na dopełnieniu, a flaga „czy są jakiekolwiek fiszki" odróżnia „brak fiszek w ogóle" od „nic nie jest due" | „INNER JOIN / zwykły filtr są równoważne" — po cichu gubią never-reviewed na zawsze; „puste `items` ⇒ brak fiszek" — trzeba odróżnić od „nic nie due" | faktyczna logika sklejania w serwisie powtórek (dwa `select("*")` + merge w kodzie); sortowanie „due rosnąco, NULL na końcu"; wartość dziennego limitu; tania query na flagę „czy są jakiekolwiek fiszki" | unit na czystej funkcji stitch/sort/cap, jeśli da się ją wyodrębnić od wywołań Supabase; inaczej integration na lokalnym Supabase z zaseedowanym stanem | kruche założenia czasowe (potrzebny wstrzykiwany `now()`); asercja dokładnych dat due z FSRS (rola biblioteki) zamiast decyzji include/exclude/order |

## 3. Phased Rollout

Każdy wiersz to odrębna faza rolloutu, która otworzy własny folder zmiany przez
`/10x-new`. Status przesuwa się od lewej do prawej po wartościach z tabeli poniżej;
orchestrator aktualizuje Status w miarę pojawiania się artefaktów na dysku.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Potok generowania AI — czysta walidacja i parsowanie | Poprawny tekst nigdy po cichu nie daje pustego zestawu; adversarialne odpowiedzi LLM nie rzucają wyjątku | #1, #5 (część) | unit | planned | testing-ai-generation-parsing |
| 2 | Taksonomia awarii dostawcy AI — mapowanie błędów route i wyspy | Żadna awaria AI nie kończy się zawieszonym ekranem; każdy wariant błędu → właściwy status i działający retry | #2 | integration + unit | not started | — |
| 3 | Cross-account i parytet wejścia na ścieżce zapisu | Użytkownik B nie tknie danych A przez żaden endpoint zapisu; przekroczone limity → 400 nie 500; wyszukiwarka nie wstrzykuje warunków | #3, #5, #4 | integration (lokalny Supabase, 2 użytkowników) | not started | — |
| 4 | Logika selekcji kolejki powtórek | Fiszki never-reviewed nigdy nie znikają z sesji; sortowanie i cap trzymają się reguł | #6 | unit lub integration | not started | — |
| 5 | Okablowanie bramek jakości | Zablokowanie podłogi w CI: `npm run test`, typecheck, job integracyjny z 2 użytkownikami, rekomendacja lokalnego hooka post-edit | cross-cutting (regresja) | gates | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened`
→ `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

Klasyczna baza testów dla tego projektu. Narzędzia AI-native (jeśli są) noszą datę
`checked:`, żeby przyszły czytelnik widział, które linie wymagają re-weryfikacji.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | 4.1.11 | skonfigurowany; dziś **1 plik** (`src/lib/fsrs/scheduler.test.ts`), środowisko Node, brak pluginów React/Astro. `npm run test` = `vitest run` |
| API / boundary mocking | brak — patrz §3 Faza 2 | — | mock granicy OpenRouter / `fetch`; kandydat: wbudowane `vi.mock` / `vi.stubGlobal` z Vitest, bez nowej zależności |
| integracja z DB | Supabase CLI (lokalnie, Docker) | 2.23.4 (devDep) | `npx supabase start` + `npx supabase db reset`; wymagane do #3 i #6 — RLS oraz pre-check własności nie da się ćwiczyć unitem. Docker bywał niedostępny w środowisku agenta (patrz plany F-01/S-02) |
| e2e | brak — świadomie odłożone | — | patrz §7. Skill `claude-in-chrome` dostępny jako ewentualna warstwa manualna/wizualna, nie zautomatyzowana |
| accessibility | brak — poza zakresem MVP | — | patrz §7 |
| (optional) AI-native | brak — checked: 2026-08-29 | n/a | brak Playwright MCP w sesji; nie planowane w tym rollout |

**Stack grounding tools (current session):**
- Docs: brak Context7 / dedykowanego MCP dokumentacji — `WebFetch` dostępny jako generyczny fallback; checked: 2026-08-29
- Search: brak Exa.ai — `WebSearch` dostępny jako generyczny fallback; checked: 2026-08-29
- Runtime/browser: brak Playwright MCP; skill `claude-in-chrome` (automatyzacja Chrome) dostępny jako możliwa warstwa e2e/wizualnej weryfikacji, nie użyty w tej strategii; checked: 2026-08-29
- Provider/platform: brak MCP Supabase / Cloudflare / GitHub w sesji; obecne CLI `supabase`, `wrangler`, `gh`; Cloudflare observability MCP istnieje, ale nie podpięty do tej sesji — istotny dla alertingu na limit CPU-time, nie dla bramek testowych; checked: 2026-08-29

## 5. Quality Gates

Pełny zestaw bramek, które muszą przejść, zanim zmiana trafi na produkcję.
„required after §3 Phase N" oznacza, że bramka jest egzekwowana po wylądowaniu
tej fazy rolloutu; wcześniej jest `planned`.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI | required | drift składni / typów. **Uwaga:** trigger w `.github/workflows/ci.yml` to nadal `master`, a domyślny branch to `main` → CI nie odpala się na `main`. Naprawa triggera niesiona przez §3 Faza 5 jako prereq |
| unit + integration | local + CI | required after §3 Phase 1 | regresje logiki (#1, #2, #5, #6) |
| integracja z lokalnym Supabase (2 użytkowników) | CI on PR | required after §3 Phase 3 | cross-account / RLS / pre-check własności (#3), parytet limitów (#5) |
| e2e on critical flows | — | deferred — §7 (wywiad Q5) | zerwane krytyczne ścieżki użytkownika; świadomie poza zakresem MVP po godzinach, weryfikacja manualna per faza jak dotąd |
| post-edit hook | local (pętla agenta) | recommended after §3 Phase 5 | regresje w czasie edycji; konfiguracja to Moduł 3 Lekcja 3, nie ta lekcja |
| visual diff / multimodal review | CI on PR | optional | regresje renderowania; max 1–3 ekrany krytyczne, jeśli kiedykolwiek — patrz §7 |
| pre-prod smoke | między merge a prod | optional | błędy środowiskowe (propagacja `astro:env` / rotacja sekretów — patrz `infrastructure.md` §Risk Register) |

## 6. Cookbook Patterns

Jak dodawać nowe testy w tym projekcie. Każda podsekcja wypełnia się, gdy
odpowiednia faza rolloutu wyląduje; wcześniej brzmi „TBD — patrz §3 Faza N".

### 6.1 Dodanie testu jednostkowego

- **Wstępnie** (utrwali §3 Faza 1): kolokacja przy module — `<module>.test.ts`
  obok testowanego pliku.
- **Reference test**: `src/lib/fsrs/scheduler.test.ts` (jedyny istniejący; czysta
  logika, bez importów Astro/React).
- **Run locally**: `npm run test`.
- Reszta konwencji (nazewnictwo katalogów, wzorzec dla modułów parsujących
  import-clean) — TBD, patrz §3 Faza 1.

### 6.2 Dodanie testu integracyjnego

- TBD — patrz §3 Faza 2 (mock granicy OpenRouter) i §3 Faza 3 (lokalny Supabase
  z dwoma użytkownikami).
- Polityka mockowania z góry: mockuj tylko na krawędzi sieci (`fetch` / HTTP do
  OpenRouter). Nigdy nie mockuj modułów wewnętrznych ani klienta Supabase.

### 6.3 Dodanie testu e2e

- Świadomie pominięte w tym rollout — patrz §7 (wywiad Q5).

### 6.4 Dodanie testu dla nowego endpointu API

- TBD — patrz §3 Faza 2 (kształt żądanie → odpowiedź + mapowanie błędów) oraz
  §3 Faza 3 (własność cross-account, efekty uboczne w DB, dwóch użytkowników).

### 6.5 Dodanie testu dla potoku generowania AI

- TBD — patrz §3 Faza 1 (wzorzec „pusty/bezużyteczny zestaw mimo poprawnego
  wejścia" + adversarialne stringi `content`).

### 6.6 Notatki per faza rolloutu

(Opcjonalne. Po wylądowaniu każdej fazy `/10x-implement` dopisuje tu 2–3 linie
o tym, co faza nauczyła — np. gdzie wylądowały fixtures, jaka konwencja nazw.)

## 7. What We Deliberately Don't Test

Wykluczenia uzgodnione w wywiadzie (Faza 2, Q5) oraz w challenger-passie briefu.
Przyszli kontrybutorzy powinni je respektować, dopóki założenie leżące u podstaw
się nie zmieni.

- **Renderowanie UI / komponenty React / snapshoty / style** — brak testów
  renderujących `FlashcardDeck`, `FlashcardGenerator`, formularze, `Topbar`,
  `Welcome.astro`, animacje landingu. *Logikę zasilającą listę* (matematyka
  paginacji / `nextOffset`, escaping wyszukiwarki, wybór stanu pustego, selekcja
  kolejki due) testujemy na warstwie serwis/schema — to nie jest „testowanie UI".
  Re-ewaluacja, jeśli pojawi się integracja testowa React/Astro albo krytyczny
  bug czysto renderowy. (Źródło: wywiad Q5 + napięcie z Q4.)
- **Konfiguracja** — `astro.config.mjs`, `wrangler.jsonc`, `vitest.config.ts`,
  `components.json`, ESLint/Prettier. Re-ewaluacja, jeśli błąd konfiguracji
  spowoduje incydent produkcyjny. (Źródło: wywiad Q5.)
- **Infrastruktura** — Cloudflare Workers, propagacja `astro:env` / sekretów,
  limit CPU-time na ścieżce parsowania odpowiedzi LLM (→ observability / alerting
  per `infrastructure.md`, nie test), deploy / rollback. Re-ewaluacja, jeśli
  projekt wyjdzie poza skalę MVP z PRD. (Źródło: wywiad Q5 + `infrastructure.md`
  §Risk Register.)
- **Gotowe biblioteki** — wnętrze `ts-fsrs` (w tym dokładne stałe interwałów),
  shadcn/ui, samo `zod`, klient Supabase, runtime Astro. Testujemy własny wrapper,
  nie cudzy algorytm. Re-ewaluacja przy majorze którejś z bibliotek. (Źródło:
  wywiad Q5 + `lessons.md`.)
- **Własny rate-limiting endpointu generowania** — nie istnieje; poleganie na
  429 z free-tier OpenRouter to świadoma decyzja produktowa MVP, nie luka do
  testu. (Źródło: challenger-pass briefu.)
- **Przepuszczanie surowego `error.message` z OpenRouter do klienta** w gałęzi
  „api, inne → 502" — komunikaty OpenRouter nie są sekretami; low impact ×
  low likelihood. (Źródło: challenger-pass briefu.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-08-29
- Stack versions last verified: 2026-08-29
- AI-native tool references last verified: 2026-08-29

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
