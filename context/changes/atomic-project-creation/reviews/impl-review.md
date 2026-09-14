<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Atomowe tworzenie projektu wraz z pozycjami

- **Plan**: `context/changes/atomic-project-creation/plan.md`
- **Zakres**: fazy 1–3 (kroki automatyczne; 1.2 i 2.3 pozostają ręczne)
- **Data**: 2026-09-14
- **Werdykt**: NEEDS ATTENTION
- **Znaleziska**: 0 krytycznych · 6 ostrzeżeń · 6 obserwacji
- **Stan**: 8 naprawionych · 2 odłożone · 2 przyjęte bez działania

## Werdykty

| Wymiar | Werdykt |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (kroki automatyczne) |

Przegląd wymiaru Safety & Quality nie był czytaniem kodu: agent postawił
jednorazową instancję PostgreSQL 16, odtworzył warstwę Supabase (`auth.users`,
`auth.uid()` z GUC, role `authenticated`/`anon`), wykonał `0001` i `0002`, po
czym odegrał każdy scenariusz z dwóch różnych kont. Znaleziska opisane niżej
jako „potwierdzone" zostały faktycznie wywołane, a nie wywnioskowane.

## Znaleziska

### F1 — `filament_id` z cudzego konta przechodzi przez funkcję

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny kompromis; warto się zatrzymać
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/0002_atomic_project_creation.sql:48-63`
- **Detail**: Polityka `project_filaments_owner_all` sprawdza wyłącznie
  właściciela *projektu*. Klucz obcy do `public.filaments` egzekwuje systemowy
  trigger referencyjny, który jest zwolniony z RLS. Potwierdzone: konto A
  wywołało funkcję z `filament_id` szpuli konta B i wiersz powstał. Bilans B
  pozostaje nienaruszony (widok `filament_inventory` jest `security_invoker`),
  a A nie może tego spieniężyć — `set_project_status` zgłosi `FILAMENT_MISSING`.
  Zostaje jednak wyrocznia istnienia: powodzenie kontra naruszenie klucza obcego
  mówi zalogowanemu użytkownikowi, czy dany UUID istnieje globalnie w
  `filaments`. Trasa API dziś to blokuje (`validateUsage`), ale klucz
  publikowalny jest jawny, a funkcja ma `grant execute to authenticated` — RPC
  da się wywołać z pominięciem trasy. Luka jest starsza niż ta zmiana, ale to
  właśnie ta zmiana czyni funkcję *jedyną* ścieżką zapisu, więc to tu jest
  miejsce na jej zamknięcie.
- **Fix**: `join public.filaments f on f.id = line.filament_id` w insercie —
  wtedy ownership egzekwuje samo RLS — plus porównanie `row_count` z
  `jsonb_array_length(p_lines)` i `raise FILAMENT_MISSING` na różnicy.
  Ta jedna zmiana zamyka również F2 i F3.
- **Decision**: FIXED — commit w tej gałęzi

### F2 — literówka w nazwie `filament_id` daje po cichu NULL

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny kompromis; warto się zatrzymać
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/0002_atomic_project_creation.sql:56,59-63`
- **Detail**: `project_filaments.filament_id` jest celowo nullowalny (FR-008,
  miękka referencja), a funkcja nigdy go nie sprawdza. Potwierdzone: wejście z
  kluczem `filamentid` — jedna litera mniej — przeszło i utworzyło projekt,
  którego jedyna pozycja rodzi się w stanie „filament usunięty". Taki projekt
  nigdy nie da się wydrukować i nie da się go naprawić. To dokładnie ta klasa
  defektu, dla której powstało R-10, wchodząca innymi drzwiami. Asymetria:
  pomyłka w `filament_name_snapshot` albo `estimated_usage_g` wywoła NOT NULL,
  cicho przechodzi wyłącznie `filament_id`.
- **Fix**: jak w F1 — join po `filaments` odrzuca zarówno NULL, jak i cudzy
  identyfikator.
- **Decision**: FIXED — commit w tej gałęzi

### F3 — martwy strażnik z komentarzem opisującym stan niemożliwy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — decyzja szybka, poprawka oczywista
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/0002_atomic_project_creation.sql:65-72`
- **Detail**: `v_count = 0` jest nieosiągalne. Sprawdzone zostało każde wejście
  mogące dać zero wierszy: `[]` odpada linijkę wyżej, `[null]` i `[1,2]` zgłasza
  sam `jsonb_to_recordset`, `[{}]` łamie NOT NULL. Niepusta tablica zawsze daje
  co najmniej jeden wiersz. To gorsze niż martwy kod — komentarz przedstawia go
  jako aktywne zabezpieczenie.
- **Fix**: dać mu prawdziwą pracę (porównanie z `jsonb_array_length`) albo
  usunąć. Wybrane: prawdziwa praca, w ramach poprawki F1.
- **Decision**: FIXED — commit w tej gałęzi

### F4 — `grant execute … to authenticated` nie zawęża dostępu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — decyzja szybka, poprawka oczywista
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/0002_atomic_project_creation.sql:78`
- **Detail**: Potwierdzone na `proacl`: `{=X/postgres, postgres=X/postgres,
  authenticated=X/postgres}`. Wiodące `=X` to PUBLIC, nadane automatycznie przy
  `create function` — więc `anon` również może wywołać tę funkcję. Ratuje nas
  wyłącznie strażnik `auth.uid() is null` (anon dostaje `NOT_AUTHENTICATED`,
  errcode 42501 → 403). Zamyka się poprawnie, ale komentarz w migracji i
  `plan.md:60` sugerują zawężenie, którego tam nie ma. `set_project_status` ma
  ten sam kształt — to samo należałoby zrobić w osobnej zmianie.
- **Fix**: `revoke execute … from public;` przed `grant`.
- **Decision**: FIXED — commit w tej gałęzi, poprawiony po wykonaniu migracji
  na prawdziwej instancji (patrz F11)

### F5 — surowy komunikat Postgresa trafia na ekran użytkownika

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — decyzja szybka, poprawka oczywista
- **Dimension**: Safety & Quality
- **Location**: `src/lib/server/db-errors.ts:23`, `src/pages/api/projects/index.ts:60`
- **Detail**: `humanise()` kończy się `return message`, więc błąd spoza mapy
  czterech prefiksów ląduje w adresie przekierowania i zostaje wyrenderowany.
  Potwierdzone komunikaty osiągalne przez bezpośrednie wywołanie RPC to m.in.
  naruszenia `project_filaments_project_id_filament_id_key`,
  `projects_name_check` i `project_filaments_estimated_usage_g_check` — czyli
  nazwy tabel i ograniczeń. Przez interfejs wszystkie cztery są uprzedzone
  przez Zod i `validateUsage`, więc to ujawnienie schematu, nie awaria. Trasy
  filamentów robią dziś to samo, więc jest to przynajmniej spójne z resztą.
- **Fix**: ogólny komunikat zastępczy w `humanise()` i log po stronie serwera.
- **Decision**: DEFERRED — dotyczy także tras filamentów; osobna zmiana

### F6 — `plan.md` mówi, że funkcja zwraca wiersz `projects`

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: `context/changes/atomic-project-creation/plan.md:46`
- **Detail**: Funkcja zwraca `uuid`; skrót planu i powierzchnie kontraktowe mają
  to poprawnie, w planie została stara wersja.
- **Fix**: poprawić zdanie w planie.
- **Decision**: FIXED — commit w tej gałęzi

### F7 — trzy dodatki, których plan nie przewidywał

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Scope Discipline
- **Location**: `src/lib/server/db-errors.ts`, `src/pages/api/projects/[id]/status.ts:5`, `README.md:92-94`
- **Detail**: Wyodrębnienie `humanise()` nie było w zakresie, ale plan wymagał,
  by nowy `NO_LINES` szedł tą samą ścieżką co stary — bez wspólnego modułu nie
  dało się tego spełnić; uznane za dorozumiane. `status.ts` leży w obszarze
  „czego nie robimy", ale zmiana jest czysto importowa i nie tyka logiki
  odjęcia. Nowy prefiks `NOT_AUTHENTICATED` i krok z migracją `0002` w README
  to dodatki bez umocowania w planie — sensowne, ale nieplanowane.
- **Fix**: brak działania; odnotowane jako świadome odstępstwo.
- **Decision**: ACCEPTED

### F8 — powierzchnia kontraktowa bez pokrycia testem

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: `src/lib/server/db-errors.ts`
- **Detail**: `humanise()` jest zarejestrowaną powierzchnią kontraktową i czystą
  funkcją stringową, a nie ma ani jednego testu. Cztery przypadki kosztowałyby
  kilka linijek.
- **Fix**: dopisać `tests/unit/db-errors.test.ts` i wiersz w mapie pokrycia.
- **Decision**: FIXED — 6 testów, mapa pokrycia R-10 rozszerzona o wiersz jednostkowy

### F9 — czysto: transakcyjność, RLS, idempotencja migracji

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality / Data Safety
- **Location**: —
- **Detail**: Potwierdzone: naruszenie ograniczenia przy insercie pozycji
  zostawia `count(*) = 0` w `projects` — PostgREST opakowuje RPC w jedną
  transakcję, a wyjątek plpgsql wycofuje całość. Czyli cel zmiany został
  osiągnięty. Podrobiony `user_id` odrzuca `projects_owner_all`. Brak
  dynamicznego SQL i powierzchni wstrzyknięcia; wszystkie odwołania są
  kwalifikowane schematem, więc `search_path` nie jest tu problemem. `0002`
  wykonana dwukrotnie pod rząd przechodzi bez błędu. `numeric(10,3)`
  zaokrągla zgodnie z oczekiwaniem, `nullif(p_description, '')` odtwarza
  poprzednie zachowanie co do znaku.
- **Fix**: brak.
- **Decision**: ACCEPTED

### F10 — `FILAMENT_MISSING` z ładunkiem liczbowym dawał zdanie bez sensu

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW — decyzja szybka, poprawka oczywista
- **Dimension**: Pattern Consistency
- **Location**: `supabase/migrations/0002_atomic_project_creation.sql`, `src/lib/server/db-errors.ts`
- **Detail**: Znalezione dopiero przy weryfikacji poprawki do F1/F2. Ponownie
  użyty prefiks `FILAMENT_MISSING` niósł teraz liczbę, a `humanise()` był
  napisany pod nazwę szpuli. Potwierdzone wyjście: „Filament no longer in
  inventory: 1 of 3 lines do not point to a spool in your inventory" — zdanie
  doklejone do zdania. Prefiks to kontrakt razem ze *kształtem* ładunku, nie
  sam napis.
- **Fix**: osobny prefiks `LINES_NOT_IN_INVENTORY: <ile> of <ze ilu>` z własną
  gałęzią w `humanise()`, odmieniającą komunikat przez liczbę.
- **Decision**: FIXED — commit w tej gałęzi

## Weryfikacja poprawek

Poprawki do F1–F4 zostały zweryfikowane na odbudowanej od zera instancji
PostgreSQL, tym samym sposobem co pierwotne znaleziska. Wynik: 8/8 punktów
kontrolnych zdanych.

- Konto A nie przyczepi już szpuli konta B, a wyrocznia istnienia zamknęła się
  przy okazji: cudzy UUID i UUID nieistniejący dają teraz identyczne wyjście.
- Literówka `filamentid` kończy się odmową zamiast projektem nie do wydrukowania.
- Ścieżka szczęśliwa (1 i 3 pozycje) bez zmian, zaokrąglenie `numeric(10,3)`
  poprawne, duplikat pozycji nadal wycofuje całość bez sieroty.
- `proacl` po `revoke` to `{postgres=X/postgres,authenticated=X/postgres}` —
  `anon` dostaje odmowę na poziomie uprawnień, zanim ciało funkcji ruszy.
  Strażnik na `auth.uid()` jest od teraz naprawdę drugą linią.
- Join nie wprowadził nowych defektów: `f.id` to klucz główny, więc wierszy nie
  da się zwielokrotnić, a `v_count` nie przekroczy długości tablicy.
- `0002` wykonana dwukrotnie pod rząd nadal przechodzi czysto, a samo
  `create or replace` nie gubi odebranego PUBLIC.

## Co zostaje otwarte

- **F5** — ogólny komunikat zastępczy w `humanise()`. Dotyczy również tras
  filamentów, które dziś oddają surowy `error.message`. Osobna zmiana.
- **`set_project_status` ma ten sam nadmiarowy `grant`** co `create_project_with_lines`
  przed poprawką F4. Nie ruszane, bo leży poza zakresem tej zmiany.

### F11 — `revoke … from public` nie wystarcza na Supabase

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — decyzja szybka, poprawka oczywista
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/0002_atomic_project_creation.sql`
- **Detail**: Znalezione dopiero po wykonaniu migracji na prawdziwej instancji,
  czego odtworzona lokalnie warstwa Supabase nie pokazała. Po samym `revoke …
  from public` `proacl` wynosił
  `{postgres=X, anon=X, authenticated=X, service_role=X}` — PUBLIC znikło, ale
  `anon` **zostało**, bo Supabase ma dla schematu `public` ustawione
  `alter default privileges` nadające EXECUTE rolom `anon`, `authenticated` i
  `service_role`. Czyli klucz publikowalny bez zalogowania nadal mógł wywołać
  funkcję. Zamykał ją wyłącznie strażnik na `auth.uid()` — poprawnie, ale to
  dokładnie ta sama iluzja zawężenia, którą miało naprawić F4.
- **Fix**: drugi `revoke execute … from anon;`. Po wykonaniu `proacl` to
  `{postgres=X, authenticated=X, service_role=X}` — potwierdzone na instancji.
- **Decision**: FIXED — wykonane na bazie i zapisane w migracji

### Lekcja

Odtworzenie środowiska lokalnie wyłapało trzy realne defekty, których nie
widać z lektury — ale nie wyłapało czwartego, bo nie odtworzyło domyślnych
uprawnień, które Supabase ustawia poza `0001`. Emulacja jest dobra do sprawdzania
logiki, nie do sprawdzania konfiguracji dostawcy. Ta druga wymaga prawdziwej
instancji.

## Weryfikacja na instancji docelowej (2026-09-14)

Migracja wykonana w edytorze SQL Supabase. Funkcja sprawdzona pod rolą
`authenticated` z ustawionym `request.jwt.claims`, w bloku zakończonym
`raise exception`, więc wszystko zostało wycofane — po weryfikacji w bazie
zero projektów testowych i zero projektów bez pozycji.

| Sprawdzenie | Wynik |
| --- | --- |
| Utworzenie projektu z jedną pozycją | projekt + 1 pozycja |
| Szpula spoza magazynu użytkownika | `LINES_NOT_IN_INVENTORY: 1 of 1` |
| Literówka w nazwie klucza `filament_id` | `LINES_NOT_IN_INVENTORY: 1 of 1` |
| Pusta lista pozycji | `NO_LINES` |
| `prosrc` | zawiera join po `filaments` i oba prefiksy |
| `proacl` | `{postgres=X, authenticated=X, service_role=X}` |

Po stronie aplikacji: `npm test` 46/46, `npm run build` przechodzi,
`npm run test:e2e` 3/3 — w tym pełny ośmiokrokowy przepływ pierwszej sesji,
który tworzy projekt, czyli przechodzi przez nową funkcję. To jest dowód, że
zmiana działa w złożeniu, a nie tylko w izolacji.
