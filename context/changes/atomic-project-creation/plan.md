# Atomowe tworzenie projektu wraz z pozycjami — Plan

> Change: `context/changes/atomic-project-creation/change.md`
> Research: `context/changes/atomic-project-creation/research.md`

## Overview

Zastąpić dwa niezależne zapytania tworzące projekt jednym wywołaniem funkcji w
Postgresie, tak żeby projekt i jego pozycje powstawały w jednej transakcji.

## Current State Analysis

`src/pages/api/projects/index.ts:45–72` wstawia projekt, potem pozycje, a przy
błędzie drugiego insertu kasuje projekt osobnym zapytaniem. Kompensacja może paść
sama, zostawiając projekt bez pozycji — niemożliwy do wydrukowania i do
naprawienia z UI.

## Desired End State

Utworzenie projektu to jedno wywołanie RPC. Błąd na dowolnej pozycji wycofuje
całość; w bazie nie może powstać projekt bez pozycji. Trasa API traci ścieżkę
kompensacji.

### Key Discoveries

- PostgREST nie daje transakcji obejmującej wiele żądań — jedyną drogą jest
  pojedyncze RPC (`research.md`).
- Projekt zna już ten wzorzec: `set_project_status` w `0001_init.sql:105` to
  plpgsql `security invoker` robiący dokładnie to po drugiej stronie cyklu życia.
- RLS działa wewnątrz `security invoker` bez dodatkowej pracy — polityki
  `projects_owner_all` i `project_filaments_owner_all` obowiązują tak samo.

## What We're NOT Doing

- Nie przenosimy walidacji dostępności do SQL-a. Zostaje w TypeScripcie, gdzie
  jest pokryta testami (R-02) i gdzie potrafi wskazać szpulę oraz wielkość braku.
- Nie ruszamy `set_project_status` ani ścieżki odjęcia z magazynu.
- Nie zmieniamy formularza ani wyspy `ProjectForm`.
- Nie dodajemy zadania sprzątającego osierocone projekty — problem znika u źródła.

## Implementation Approach

Nowa migracja `0002_atomic_project_creation.sql` z funkcją
`create_project_with_lines(p_name, p_description, p_lines jsonb)`. Pozycje
przekazywane jako `jsonb`, bo liczba pozycji jest zmienna. Funkcja wstawia
projekt, rozwija tablicę pozycji i zwraca wiersz `projects`.

Trasa API zamienia dwa zapytania na jedno `supabase.rpc(...)` i traci blok
kompensacji.

## Critical Implementation Details

- `security invoker` — RLS musi obowiązywać jak dotąd; funkcja nie może
  podnosić uprawnień.
- `user_id` ustawiany z `auth.uid()` wewnątrz funkcji, nie przyjmowany z
  parametru — inaczej klient mógłby utworzyć projekt na cudzym koncie (polityka
  `with check` i tak by to odrzuciła, ale parametr byłby zaproszeniem do błędu).
- Pusta tablica pozycji ma podnosić `NO_LINES` — ten sam prefiks błędu, którego
  używa już `set_project_status`, żeby `humanise()` obsłużył oba tak samo.
- `grant execute ... to authenticated`, symetrycznie do istniejącej funkcji.

## Phase 1: Funkcja w bazie danych

### Overview

Migracja z funkcją tworzącą projekt i pozycje w jednej transakcji.

### Changes Required

- `supabase/migrations/0002_atomic_project_creation.sql` — nowy plik

### Success Criteria

#### Automated
- Migracja wykonuje się na czystej bazie bez błędu

#### Manual
- Funkcja widoczna w `information_schema.routines`
- Wywołanie z pustą tablicą pozycji podnosi `NO_LINES`

## Phase 2: Trasa API korzysta z RPC

### Overview

Zamiana dwóch zapytań na jedno wywołanie; usunięcie kompensacji.

### Changes Required

- `src/pages/api/projects/index.ts` — insert + insert + delete → `supabase.rpc`

### Success Criteria

#### Automated
- `npm test` przechodzi (40 testów — warstwa domenowa nietknięta)
- `npm run build` przechodzi

#### Manual
- Utworzenie projektu z dwoma filamentami działa jak dotąd
- Wymuszony błąd pozycji nie zostawia projektu w bazie

## Phase 3: Rejestr ryzyk i dokumentacja

### Overview

Zapisać ryzyko, które ta zmiana zamyka, i powierzchnię kontraktową, którą dodaje.

### Changes Required

- `context/foundation/test-plan.md` — ryzyko R-10 + wiersz mapy pokrycia
- `docs/reference/contract-surfaces.md` — `create_project_with_lines`

### Success Criteria

#### Automated
- Brak

#### Manual
- R-10 ma źródło wskazujące na przegląd implementacji
- Powierzchnia kontraktowa ma definicję, konsumentów i checklistę

## Testing Strategy

### Unit Tests

Brak nowych. Gwarancja jest granicą transakcji bazy, a nie czystą funkcją —
nie ma czego wywołać. To ta sama sytuacja co R-07, gdzie kontrolą jest
definicja polityki RLS.

### Integration Tests

Brak — projekt nie ma warstwy testów integracyjnych i ta zmiana nie uzasadnia
jej wprowadzenia.

### Manual Testing Steps

1. Wykonać `0002_atomic_project_creation.sql` w edytorze SQL Supabase
2. Utworzyć projekt z dwoma filamentami — działa jak dotąd
3. Wywołać RPC z pustą tablicą pozycji — `NO_LINES`, brak projektu w bazie
4. Wywołać RPC z nieistniejącym `filament_id` — błąd klucza obcego, brak projektu
5. `npm run test:e2e` — regresja ścieżki szczęśliwej

## Performance Considerations

Jedno żądanie sieciowe zamiast dwóch lub trzech. Nieistotne przy tej skali,
ale kierunek właściwy.

## Migration Notes

Migracja jest addytywna — dodaje funkcję, niczego nie usuwa ani nie zmienia.
Wycofanie to `drop function`. Bezpieczna do wykonania na żywej bazie.

## References

- `context/changes/atomic-project-creation/research.md`
- `context/foundation/prd.md` — FR-009, FR-013, FR-014
- `supabase/migrations/0001_init.sql:105` — wzorzec `set_project_status`

## Progress

> Konwencja: `- [ ]` oczekuje, `- [x]` zrobione. Po wylądowaniu kroku dopisz ` — <commit sha>`. Nie zmieniaj tytułów kroków.

### Phase 1: Funkcja w bazie danych

#### Automated

- [ ] 1.1 Napisz migrację 0002 z funkcją create_project_with_lines

#### Manual

- [ ] 1.2 Wykonaj migrację w edytorze SQL Supabase i potwierdź obecność funkcji

### Phase 2: Trasa API korzysta z RPC

#### Automated

- [ ] 2.1 Zamień dwa zapytania na wywołanie RPC i usuń kompensację
- [ ] 2.2 Uruchom npm test i npm run build

#### Manual

- [ ] 2.3 Utwórz projekt przez UI i potwierdź brak regresji

### Phase 3: Rejestr ryzyk i dokumentacja

#### Automated

- [ ] 3.1 Dopisz R-10 do rejestru ryzyk i mapy pokrycia
- [ ] 3.2 Dopisz create_project_with_lines do powierzchni kontraktowych
