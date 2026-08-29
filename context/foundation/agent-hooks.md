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
| D10 | Jawne `timeout` na każdym hooku: lint `10000` ms, typecheck `120000` ms. | Materiał kursowy tak robi. Typecheck `Stop` odpala się raz na turę — długi timeout jest tani, a pierwszy `astro check` pobiera language server (sieć). |

## 4. Hook 1 — lint per-edit (`PostToolUse`)

**Trigger:** `PostToolUse` · **Matcher:** `Write|Edit` · **Timeout:** 10 s

**Handler:** `node .claude/hooks/lint-changed.mjs` (czyta zdarzenie z stdin).

**Przepływ helpera:**

1. Wczytaj JSON z stdin → `tool_input.file_path`.
2. Jeśli brak ścieżki / plik poza `process.cwd()` / plik nie istnieje → `exit 0`.
3. Jeśli rozszerzenie ∉ `{.ts, .tsx, .astro}` → `exit 0` (działka Prettiera / nie-lintowalne).
4. Uruchom lokalny `eslint` (`node_modules/.bin/eslint`, fallback `npx eslint`)
   na tym jednym pliku, z `--no-warn-ignored` (flat config ostrzega przy
   przekazaniu ignorowanego pliku).
5. `eslint` czysty → `exit 0`. `eslint` zgłasza problemy → wypisz raport na
   **stderr** i `exit 2` (Claude Code: stderr z `exit 2` trafia do kontekstu
   agenta jako feedback).

**Czego hook NIE robi:** nie woła `--fix`, nie dotyka innych plików, nie lintuje
całego repo.

## 5. Hook 2 — typecheck (`Stop`)

**Trigger:** `Stop` · **Timeout:** 120 s

**Handler:** `node .claude/hooks/typecheck.mjs` (czyta zdarzenie z stdin).

**Przepływ helpera:**

1. Wczytaj JSON z stdin → `stop_hook_active`.
2. Jeśli `stop_hook_active === true` → `exit 0` (guard pętli, D8).
3. Uruchom `npm run typecheck` (`astro check`).
4. Sukces → `exit 0`. Błędy typów → przepuść output na stderr i `exit 2`
   (blokuje zakończenie tury, agent dostaje błędy do naprawy).

**Uwaga:** pierwszy `astro check` w świeżym środowisku pobiera Astro language
server (wymaga sieci); kolejne uruchomienia są szybsze. 120 s timeout to pokrywa.

## 6. Helpery w `.claude/hooks/`

Format: **ESM `.mjs`** (`package.json` ma `"type": "module"`). Zero zależności
poza `node:` built-ins. Wspólny wzorzec: odczyt całego stdin, `JSON.parse`,
`child_process` do narzędzia, przekazanie kodu wyjścia.

Szkic referencyjny (`lint-changed.mjs`):

```js
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, relative, extname } from "node:path";

const LINTABLE = new Set([".ts", ".tsx", ".astro"]);

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

const evt = readStdin();
const filePath = evt?.tool_input?.file_path;
if (!filePath) process.exit(0);

const abs = resolve(filePath);
const rel = relative(process.cwd(), abs);
if (rel.startsWith("..") || rel.includes("..")) process.exit(0); // poza repo
if (!existsSync(abs)) process.exit(0);
if (!LINTABLE.has(extname(abs))) process.exit(0);

const bin = process.platform === "win32" ? "eslint.cmd" : "eslint";
const local = resolve("node_modules/.bin", bin);
const cmd = existsSync(local) ? local : "npx";
const args = existsSync(local)
  ? ["--no-warn-ignored", abs]
  : ["eslint", "--no-warn-ignored", abs];

const res = spawnSync(cmd, args, { encoding: "utf8" });
const out = (res.stdout || "") + (res.stderr || "");
if (res.status === 0) process.exit(0);

process.stderr.write(out.trim() + "\n");
process.exit(2);
```

Szkic `typecheck.mjs` — analogicznie: `stop_hook_active` guard → `spawnSync("npm",
["run", "typecheck"])` → `exit 0` / `exit 2`.

## 7. Pliki do utworzenia / zmiany

| Plik | Zmiana |
| ---- | ------ |
| `.claude/settings.json` | **nowy** — sekcja `hooks` z `PostToolUse` (matcher `Write\|Edit`) i `Stop` |
| `.claude/hooks/lint-changed.mjs` | **nowy** — helper lint per-plik |
| `.claude/hooks/typecheck.mjs` | **nowy** — helper typecheck z guardem pętli |
| `package.json` | **edycja** — jedna linia: `"typecheck": "astro check"` w `scripts` |
| `context/foundation/agent-hooks.md` | **nowy** — ten dokument |

Planowana zawartość `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/lint-changed.mjs", "timeout": 10000 }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/typecheck.mjs", "timeout": 120000 }
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

## 9. Log zmian dokumentu

- `2026-08-29` — utworzenie; założenia uzgodnione w rozmowie (4 pytania: typecheck
  jako `Stop`, wołany przez skrypt `astro check`; lint per-plik przez helper Node;
  reakcja lintu report-only + exit 2).
