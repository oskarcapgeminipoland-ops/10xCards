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

## Każda funkcja plpgsql w migracji Supabase musi mieć jawny search_path

- **Context**: supabase/migrations/20260823134802_create_flashcards_table.sql:39-47 — definicja funkcji triggera `set_updated_at()`.
- **Problem**: Funkcja plpgsql nie ma jawnie ustawionego `search_path`. Nie jest to obecnie exploitowalne (funkcja nie jest SECURITY DEFINER, invoker-only, dotyka wyłącznie NEW/now()), ale Supabase database linter (reguła 0011_function_search_path_mutable) i tak to zgłasza jako best-practice gap.
- **Rule**: Każda nowa funkcja plpgsql w migracji Supabase musi jawnie ustawiać `search_path` (np. `set search_path = ''`), niezależnie od tego, czy jest SECURITY DEFINER.
- **Applies to**: plan, implement, impl-review

## Escapuj wszystkie metaznaki mini-języka filtrów PostgREST, nie tylko SQL-LIKE

- **Context**: src/lib/services/flashcards.ts:51-53 — interpolacja tekstu wyszukiwania do stringa filtra .or() klienta Supabase JS.
- **Problem**: Escapowane były tylko wildcardy SQL-LIKE (%, _), ale nie znaki specjalne samego mini-języka filtrów PostgREST (, . ( )), przez co wyszukiwana fraza mogła wstrzyknąć dodatkowe warunki do zapytania. RLS ograniczał skutek do własnych wierszy użytkownika (brak wycieku między kontami), ale to nadal był niezaufany input trafiający do ręcznie budowanego stringa zapytania.
- **Rule**: Przy interpolowaniu inputu użytkownika do dowolnego stringa filtra Supabase/PostgREST (.or(), .filter() itp.) escapuj wszystkie metaznaki tego mini-języka (, . ( ) oraz \), nie tylko te istotne dla bieżącego przypadku — albo unikaj interpolacji stringów na rzecz łańcuchowanych wywołań .ilike()/.eq(), które przyjmują wartość jako parametr.
- **Applies to**: plan, implement, impl-review

## Zweryfikuj opcje konfiguracyjne biblioteki wobec zainstalowanej wersji, zanim trafią do planu jako stała

- **Context**: src/lib/fsrs/scheduler.ts:31, src/lib/fsrs/scheduler.test.ts:64-81 — plan zakładał `fsrs({ request_retention: 0.9 })`, implementacja dodała `enable_short_term: false`.
- **Problem**: Plan opisał stałą konfigurację `ts-fsrs` bez uwzględnienia pola `learning_steps`, którego znaczenie ujawniło się dopiero przy pracy z realnym typem `Card` zainstalowanej wersji. Poprawka w implementacji (`enable_short_term: false`) była zasadna, ale miała efekt uboczny: `State.Relearning` stał się praktycznie nieosiągalny, przez co zaplanowany test ("powtórzone Again przesuwa stan w stronę Relearning") przestał sprawdzać to, co plan zakładał — zamiast tego asercja została po cichu zamieniona na proxy (lapses/stability).
- **Rule**: Zanim plan zakotwiczy konkretne opcje konfiguracyjne zewnętrznej biblioteki jako stałą, zweryfikuj je wobec API/typów faktycznie zainstalowanej wersji (nie tylko dokumentacji). Jeśli implementacja mimo to musi odejść od zaplanowanej konfiguracji, zaktualizuj też testy/asercje, które plan napisał pod starą konfigurację — nie zostawiaj asercji cicho osłabionej bez odnotowania tego w planie lub testach.
- **Applies to**: plan, implement, impl-review
