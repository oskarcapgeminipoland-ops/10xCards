---
project: 10xcards
lesson: "Moduł 3, Lekcja 3 — hooks (lokalne warstwy jakości)"
created_at: 2026-08-29
branch: chore/claude-per-edit-hooks
status: planned
scope: >
  Dwa lokalne hooki Claude Code w .claude/settings.json (projekt):
  lint per-edit (PostToolUse) + typecheck (Stop). Pre-commit / pre-push / CI
  poza zakresem tej lekcji.
---

## 1. Cel i kontekst

Turn quality gates into automatic, deterministic checks that fire **while the
agent works**, bez polegania na tym, że model o nich pamięta. Zakres tej lekcji
to konfiguracja hooków i lokalnych warstw jakości — nic więcej (bez E2E, bez
debug-workflow, bez zmian w definicji bramek jakości).

Powiązania z istniejącymi dokumentami:

- `test-plan.md` §5 — wiersz **„post-edit hook"** (`local (pętla agenta)`,
  `recommended after §3 Phase 5`), z adnotacją „konfiguracja to Moduł 3
  Lekcja 3, nie ta lekcja". Ten dokument realizuje właśnie tę adnotację.
- `test-plan.md` §5 — wiersz **„lint + typecheck"** (`local + CI`, `required`):
  hooki są lokalną, wczesną warstwą tej samej bramki. **Nie** zmieniamy jej
  definicji — edycja bramek jakości to Lekcja 1 (`/10x-test-plan`).
- `CLAUDE.md` → sekcja „10xDevs AI Toolkit - Module 3, Lesson 3" — reguły
  layeringu (per-edit → pre-commit → pre-push → CI), zasada „keep per-edit
  hooks fast", `PostToolUse` matcher `Write|Edit`.

## 2. Zakres

### W zakresie

| # | Element | Warstwa |
| - | ------- | ------- |
| 1 | Hook **lint** po każdej edycji pliku przez agenta | per-edit (`PostToolUse`, matcher `Write\|Edit`) |
| 2 | Hook **typecheck** raz na koniec tury agenta | `Stop` |
| 3 | Helper w Node do parsowania stdin hooka (bez `jq`) | `.claude/hooks/` |
| 4 | Skrypt `typecheck` w `package.json` (`astro check`) | reużywalny też dla przyszłego pre-commit / CI |

### Poza zakresem (świadomie)

- Hook `vitest related <plik> --run` (testy powiązane z edytowanym plikiem) —
  przykład z materiału kursowego, ale nie objęty treścią zadania. Kandydat na
  osobną iterację.
- Warstwa **pre-commit** (Husky + lint-staged). Uwaga: `.husky/pre-commit`
  istnieje (`npx lint-staged`) i konfiguracja `lint-staged` jest w
  `package.json`, ale husky **nie jest okablowany** — brak skryptu `prepare`,
  `core.hooksPath` nieustawione, brak `.husky/_/`. Aktywacja to osobne zadanie.
- Warstwa **pre-push** i **CI** (`.github/workflows/ci.yml` — trigger nadal na
  `master`, nie `main`).
- Jakakolwiek edycja `test-plan.md` (definicje ryzyk / bramek — Lekcja 1).

## 3. Uzgodnione decyzje

| # | Decyzja | Uzasadnienie |
| - | ------- | ------------ |
| D1 | Konfiguracja **wyłącznie** w `.claude/settings.json` (projekt, wersjonowana). Nie globalnie (`~/.claude/settings.json`), nie `settings.local.json`. | Współdzielona z zespołem, w repo, zgodna z treścią zadania. |
| D2 | Praca na branchu `chore/claude-per-edit-hooks` (odbity od `main`). | — |
| D3 | **Bez `jq`.** Parsowanie `stdin` hooka przez helper w Node. | `jq` nie jest zainstalowane (brak w PATH Git Bash). `node`/`npx` pewne (projekt Node). Helper w Node działa identycznie pod Git Bash / cmd / PowerShell. |
| D4 | **Hook 1 (lint)** — `PostToolUse`, matcher `Write\|Edit`. Lintuje **tylko edytowany plik**, przefiltrowany do `.ts` / `.tsx` / `.astro`. Inne rozszerzenia → no-op (exit 0). **Bez `--fix`.** | „Scoped, not whole suite" (CLAUDE.md). `eslint .` po każdej edycji = kilka sekund i raporty o plikach, których agent nie tknął. |
| D5 | Reakcja lintu na naruszenie: **report-only + exit 2**. Hook nie zapisuje pliku; wypisuje błędy, `exit 2` → feedback trafia do kontekstu agenta, agent poprawia w następnej turze. | Deterministyczne — hook nigdy nie modyfikuje plików pod agentem (auto-`--fix` może rozjechać `old_string` kolejnego `Edit`). Auto-fix i tak nie ucieka: `lint-staged` ma `eslint --fix` na commicie. |
| D6 | **Hook 2 (typecheck)** — typu **`Stop`** (raz, gdy agent kończy turę), nie `PostToolUse`. | `astro check` ~10–30 s zimnego startu, brak trybu pojedynczego pliku. Per-edit blokowałby pętlę agenta na każdej edycji `.astro`/`.ts`. `Stop` daje sygnał do kontekstu bez spowalniania edycji. Zgodne z „full typecheck to zwykle bramka commitowa, nie per-edit". |
| D7 | Typecheck wołany przez **`npm run typecheck`**, gdzie `"typecheck": "astro check"` w `package.json`. | Jedno źródło prawdy — ten sam skrypt użyje pre-commit / CI (Faza 5 test-planu). `astro check`, nie `tsc --noEmit`: samo `tsc` nie rozumie plików `.astro` (frontmatter, propsy w szablonach). |
| D8 | **Guard pętli** w hooku `Stop`: przy `stop_hook_active === true` w stdin hook robi `exit 0` bez uruchamiania `astro check`. | `exit 2` z hooka `Stop` blokuje zakończenie tury i wpycha stderr do agenta. Bez guardu utrzymujący się błąd typów mógłby zapętlić agenta. Guard = agent dostaje **jedną** próbę naprawy po zatrzymaniu; jeśli zatrzyma się ponownie, hook przepuszcza. |
| D9 | Helper ignoruje edycje **poza katalogiem projektu** (scratchpad, `~/.claude`, itp.) oraz pliki, które nie istnieją na dysku po zdarzeniu. | Ścieżka spoza `process.cwd()` lub nieistniejący plik → `exit 0`. |
| D10 | Jawne `timeout` na każdym hooku: lint **`15`**, typecheck **`120`**. | **Jednostka `timeout` w Claude Code to sekundy** (domyślnie 60), nie milisekundy — `10000` z materiału kursowego = ~2,7 h (efektywnie brak limitu), stąd korekta. Lint ~5,5 s → `15` z zapasem; `astro check` ~25 s + pobranie language servera przy 1. uruchomieniu → `120`. |
| D11 | **Dług typecheck (stan zastany):** `astro check` na `main` miał **3 błędy** typów (`flashcards.ts:createFlashcard/createAiFlashcard`, `flashcard-reviews.ts:submitReview`) — sentinel `{ Error }` z `postgrest-js` 2.105 przy braku generyka `Database` w kliencie Supabase; `.overrideTypes()` w tych miejscach nie zdejmuje go do końca. Wybór: **B-lite** — `// @ts-expect-error` (z komentarzem) na 3 liniach, `astro check` → 0 błędów, hook `Stop` jest twardym `exit 2` bez logiki baseline. | Runtime był OK (błędy wyłącznie typów, `error`/`existingError` sprawdzane wyżej). Czysta naprawa = `supabase gen types` + `createServerClient<Database>` + usunięcie ~14 `.overrideTypes` — osobna zmiana (własny `change-id`), grozi rozjechaniem zakresu i odsłonięciem kolejnych zamaskowanych błędów. `@ts-expect-error` (nie `@ts-ignore`) jest samosprzątający: gdy przyczyna zniknie, dyrektywa sama zgłosi się jako „unused". |
| D12 | `.claude/**` dodane do `ignores` w `eslint.config.js`. | `npm run lint` = `eslint .` (całe repo) zaczął łapać `.claude/hooks/*.mjs` i wywalał się („was not found by the project service" — pliki spoza `tsconfig`). `.claude/` to tooling agenta, nie kod aplikacji — poza powierzchnią lintu. Hook per-edit i tak lintuje tylko `.ts/.tsx/.astro`, więc jego nie dotyczy. |
| D13 | **Lekki config eslint dla hooka 1** — `.claude/hooks/eslint.config.mjs`, wołany `--no-config-lookup --config …`. Bez `typescript-eslint` type-checked (`projectService`). | Zmierzone: hook z głównym configiem = **~11 s/edycję** (start programu TS przy każdym wywołaniu, świeży proces, brak demona) — przekracza „kilka sekund" z lekcji, a `PostToolUse` odpala się raz na edycję (3 edycje = ~33 s). Lekki config → **~5,5 s** i dalej łapie składnię / prettier / unused / `react-hooks`. Type-aware zostaje w `npm run lint` + CI. Podłoga na tej maszynie (Windows) to ~4 s na sam start node + eslint. |
| D14 | **Short-circuit typecheck** — `typecheck.mjs` skanuje `git status --porcelain --untracked-files=all`; brak zmienionego pliku `\.(ts\|tsx\|astro\|mts\|cts)$` → `exit 0` bez `astro check`. | Bez tego hook `Stop` odpalał `astro check` (~25 s) na **każdym** końcu tury, też przy czystym Q&A. Sesja 15 tur = ~6 min zmarnowane. Ze skanem tury konwersacyjne = ~0,2 s. |

## 4. Hook 1 — lint per-edit (`PostToolUse`)

**Trigger:** `PostToolUse` · **Matcher:** `Write|Edit` · **Timeout:** 15 s
(jednostka `timeout` w Claude Code to **sekundy**, nie ms — patrz D10)

**Handler:** `node .claude/hooks/lint-changed.mjs` (czyta zdarzenie z stdin).

**Przepływ helpera:**

1. Wczytaj JSON z stdin → `tool_input.file_path`.
2. `exit 0` gdy: brak ścieżki / plik poza `process.cwd()` / ścieżka bezwzględna
   po `relative()` (inny dysk na Windows, D3-P3) / plik nie istnieje.
3. Jeśli rozszerzenie ∉ `{.ts, .tsx, .astro}` → `exit 0` (działka Prettiera / nie-lintowalne).
4. Uruchom `eslint` (`node node_modules/eslint/bin/eslint.js`, fallback `npx`)
   na tym jednym pliku z **lekkim configiem** `--no-config-lookup --config
   .claude/hooks/eslint.config.mjs --no-warn-ignored`.
5. `eslint` czysty → `exit 0`. `eslint` zgłasza problemy → wypisz raport na
   **stderr** i `exit 2` (Claude Code: stderr z `exit 2` trafia do kontekstu
   agenta jako feedback).

**Lekki config (D13).** `.claude/hooks/eslint.config.mjs` celowo **nie** włącza
type-checked configów `typescript-eslint` (`projectService: true` startuje pełny
program TS — zmierzone ~10 s na plik). Bez warstwy type-aware hook schodzi do
**~5,5 s** (Windows; sam node + rozwiązanie modułów eslint/tseslint/astro to ~4 s
podłogi na tej maszynie) i dalej łapie składnię, formatowanie (prettier), unused
vars, `react-hooks`. Reguły type-aware (`no-floating-promises`, `no-unsafe-*`, …)
zostają w `npm run lint` + CI (warstwa commit-gate).

**Czego hook NIE robi:** nie woła `--fix`, nie dotyka innych plików, nie lintuje
całego repo, nie uruchamia reguł type-aware.

**Escape hatch.** Jeśli ~5,5 s/edycja okaże się uciążliwe (tura z 3 edycjami ≈
17 s), przenieść lint na `Stop` ze skanem `git status` jak w hooku typecheck
(raz na turę, nie na edycję) albo do pre-commit.

## 5. Hook 2 — typecheck (`Stop`)

**Trigger:** `Stop` · **Timeout:** 120 s

**Handler:** `node .claude/hooks/typecheck.mjs` (czyta zdarzenie z stdin).

**Przepływ helpera:**

1. Wczytaj JSON z stdin → `stop_hook_active`.
2. Jeśli `stop_hook_active === true` → `exit 0` (guard pętli, D8).
3. **Short-circuit (D14):** `git status --porcelain --untracked-files=all`;
   jeśli żaden zmieniony/nowy plik nie pasuje do `\.(ts|tsx|astro|mts|cts)$`
   (czysta gałąź robocza albo tura bez edycji kodu typowanego) → `exit 0`
   (~0,2 s zamiast ~25 s).
4. Uruchom `npm run typecheck` (`astro check`).
5. Sukces → `exit 0`. Błędy typów → przepuść output na stderr i `exit 2`
   (blokuje zakończenie tury, agent dostaje błędy do naprawy).

**Koszt:** `astro check` ≈ 25 s (regeneracja typów `.astro` + diagnostyka).
Bez short-circuitu odpalałby się na **każdym** końcu tury, też przy czystym
Q&A. `Stop` odpala się raz na turę (nie na edycję), więc mimo kosztu to
akceptowalna warstwa; short-circuit sprowadza tury konwersacyjne do no-opu.
Pierwsze uruchomienie pobiera Astro language server (sieć) — `timeout` 120 s
to pokrywa.

## 6. Helpery w `.claude/hooks/`

Format: **ESM `.mjs`** (`package.json` ma `"type": "module"`). Zero zależności
runtime poza `node:` built-ins. Wspólny wzorzec: odczyt całego stdin,
`JSON.parse` (w `try/catch` → `{}`), `spawnSync` do narzędzia, przekazanie kodu
wyjścia (`0` / `2`).

Pliki (źródło prawdy = kod, nie ten dokument):

- **`lint-changed.mjs`** — hook 1. Filtry ze §4, potem `spawnSync(process.execPath,
  [eslintCli, "--no-config-lookup", "--config", hookConfig, "--no-warn-ignored",
  abs])`. `eslint` wołany jako `node .../eslint/bin/eslint.js`, **nie** przez
  `.bin/eslint.cmd` — Node 22 nie spawnuje `.cmd` bez `shell:true` (CVE-2024-27980).
- **`eslint.config.mjs`** — lekki config tylko dla hooka 1 (D13). Importuje bare
  specifiery (`@eslint/js`, `typescript-eslint`, `eslint-plugin-astro`,
  `eslint-plugin-react-hooks`, `eslint-plugin-prettier/recommended`) — rozwiązują
  się z `node_modules` projektu, bo plik leży w drzewie repo.
- **`typecheck.mjs`** — hook 2. Guard `stop_hook_active` → `git status` short-circuit
  (D14) → `spawnSync("npm run typecheck", { shell: true })` (komenda stała,
  bez inputu użytkownika, więc `shell:true` bezpieczne; potrzebne dla `npm.cmd`).

## 7. Pliki do utworzenia / zmiany

| Plik | Zmiana |
| ---- | ------ |
| `.claude/settings.json` | **nowy** — sekcja `hooks`: `PostToolUse` (matcher `Write\|Edit`) + `Stop` |
| `.claude/hooks/lint-changed.mjs` | **nowy** — helper lint per-plik |
| `.claude/hooks/eslint.config.mjs` | **nowy** — lekki config eslint tylko dla hooka 1 (D13) |
| `.claude/hooks/typecheck.mjs` | **nowy** — helper typecheck: guard pętli + `git status` short-circuit (D14) |
| `package.json` | **edycja** — `"typecheck": "astro check"` w `scripts` |
| `eslint.config.js` | **edycja** — `{ ignores: [".claude/**"] }` (D12) |
| `src/lib/services/flashcards.ts` | **edycja** — 2× `// @ts-expect-error` + komentarz (D11) |
| `src/lib/services/flashcard-reviews.ts` | **edycja** — 1× `// @ts-expect-error` + komentarz (D11) |
| `context/foundation/agent-hooks.md` | **nowy** — ten dokument |

Zawartość `.claude/settings.json` (stan wdrożony):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/lint-changed.mjs", "timeout": 15 }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/typecheck.mjs", "timeout": 120 }
        ]
      }
    ]
  }
}
```

## 8. Weryfikacja

1. **Lint — ścieżka happy:** edycja pliku `.ts` bez błędów → hook `exit 0`,
   brak szumu w kontekście.
2. **Lint — ścieżka błędu:** wprowadź celowy błąd ESLint w pliku `.ts` przez
   `Edit` → hook `exit 2`, raport ESLint widoczny dla agenta, agent poprawia
   w następnej turze. Plik **niezmieniony** przez hook.
3. **Lint — no-op:** edycja `README.md` / `*.json` → hook `exit 0` natychmiast.
4. **Lint — poza repo:** edycja pliku w scratchpad → hook `exit 0`.
5. **Typecheck — Stop:** zakończ turę z błędem typów w `.astro` → hook `Stop`
   `exit 2`, agent dostaje błąd; po naprawie kolejny `Stop` przechodzi.
6. **Typecheck — guard:** przy `stop_hook_active: true` hook `exit 0` bez
   uruchamiania `astro check` (brak pętli).
7. `npm run typecheck` działa samodzielnie z CLI.
8. `npm run lint` / `npm run test` nadal zielone (brak regresji konfiguracji).

## 9. Wynik weryfikacji (2026-08-29)

Wdrożone na branchu `chore/claude-per-edit-hooks`:

| Sprawdzenie | Wynik |
| ----------- | ----- |
| `npm run typecheck` (`astro check`) | ✅ 0 errors, 0 warnings, 5 hints (po D11) |
| `npm run lint` (`eslint .`) | ✅ exit 0 (1 pre-existing warning `no-console` w `api-helpers.ts:53` — nie z tej zmiany) |
| `npm run test` (`vitest run`) | ✅ 56 passed / 3 pliki |
| Hook lint — clean `.ts` / `.astro` | ✅ exit 0, **~5,5 s** (lekki config, D13) |
| Hook lint — plik z błędami ESLint | ✅ exit 2 + pełny raport na stderr, plik niezmieniony (łapie unused / prettier / `no-constant-condition` / `no-empty`) |
| Hook lint — `README.md` / poza repo / inny dysk (`C:\…`) | ✅ exit 0 (no-op) |
| Hook typecheck — tura bez zmian `.ts/.tsx/.astro` | ✅ exit 0 w ~1,2 s (short-circuit D14) |
| Hook typecheck — po zmianie pliku `.ts` | ✅ uruchamia `astro check`, exit 0 (zielony) |
| Hook typecheck — guard `stop_hook_active: true` | ✅ exit 0 w ~1 s, bez `astro check` |

Uwaga operacyjna: hook `Stop` był aktywny już w trakcie sesji wdrożeniowej —
Claude Code podchwycił nowo utworzony `.claude/settings.json` bez restartu.

## 10. Log zmian dokumentu

- `2026-08-29` — utworzenie; założenia uzgodnione w rozmowie (4 pytania: typecheck
  jako `Stop`, wołany przez skrypt `astro check`; lint per-plik przez helper Node;
  reakcja lintu report-only + exit 2).
- `2026-08-29` — wdrożenie + D11 (dług typecheck → `@ts-expect-error` ×3, wariant
  B-lite) + D12 (`.claude/**` w `ignores` eslint). Dodano §9 z wynikiem weryfikacji.
- `2026-08-29` — audyt optymalności → 3 poprawki: **D13** lekki config eslint
  (11 s → 5,5 s/edycję), **D14** short-circuit typecheck przez `git status`
  (25 s → 0,2 s na turach bez zmian kodu), **D10** korekta jednostki `timeout`
  (sekundy: `15` / `120`, nie `10000` / `120000`) + guard „inny dysk" w hooku lint.
