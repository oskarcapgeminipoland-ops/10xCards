# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Nie kopiuj domyślnych zachowań frameworka do CLAUDE.md/AGENTS.md

- **Context**: Generowanie lub ręczna edycja CLAUDE.md / AGENTS.md na bazie szablonu startera (np. CLAUDE.md.scaffold) lub istniejącej dokumentacji.
- **Problem**: Do CLAUDE.md trafiły zdania powtarzające domyślne zachowanie Astro (prerender=false), wymagane wielkie litery eksportów GET/POST czy domyślny format nazw migracji Supabase CLI — agent i tak to zna z treningu, a jedna z reguł była wręcz niezgodna z konfiguracją projektu (output: "server"). Wykrył to dopiero /10x-rule-review (Check 4: FAIL, 4 znaleziska).
- **Rule**: Przed dopisaniem reguły do CLAUDE.md/AGENTS.md zastosuj test włączenia: "czy agent znałby to bez tego pliku?" Jeśli tak — usuń zdanie albo zostaw tylko część specyficzną dla projektu.
- **Applies to**: plan, implement, impl-review

## Nie dodawaj lodash bez jawnego powodu

- **Context**: Implementacja funkcji w aplikacji TypeScript po stronie frontendu i backendu.
- **Problem**: Agent użył `_.filter()`, mimo że lodash nie jest częścią projektu. To dodałoby niepotrzebną zależność i rozjechało lokalną konwencję pracy z natywnymi API.
- **Rule**: Nie dodawaj lodash bez jasnego wskazania. Projekt preferuje natywne funkcje JS/TS w standardzie 2026+.
- **Applies to**: plan, implement, impl-review

## Zanim edytujesz blok BEGIN/END wstrzyknięty przez zewnętrzne narzędzie, zapytaj o zakres

- **Context**: Edycja plików rules-for-AI (CLAUDE.md/AGENTS.md) zawierających sekcje oznaczone znacznikami `<!-- BEGIN/END @vendor -->` (np. blok wstrzykiwany przez `10x-cli`).
- **Problem**: Znaleziska z `/10x-rule-review` objęły też treść wewnątrz bloku `10x-cli`. Za pierwszym razem agent zaproponował edycję dopiero z ostrzeżeniem po fakcie, a użytkownik musiał dwukrotnie doprecyzowywać zakres (raz "zostaw", raz "jednak napraw"), bo blok może zostać nadpisany przy kolejnym sync narzędzia.
- **Rule**: Zanim zaproponujesz lub wykonasz edycję wewnątrz bloku oznaczonego znacznikiem BEGIN/END narzędzia zewnętrznego, zaznacz to wyraźnie i zapytaj o potwierdzenie zakresu, zanim przedstawisz plan zmian — nie traktuj go jak zwykłej treści projektowej.
- **Applies to**: plan, implement, impl-review
