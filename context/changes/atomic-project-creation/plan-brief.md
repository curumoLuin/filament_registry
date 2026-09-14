# Atomowe tworzenie projektu wraz z pozycjami — skrót planu

> Pełny plan: `context/changes/atomic-project-creation/plan.md`
> Badanie: `context/changes/atomic-project-creation/research.md`

## Co i dlaczego

Tworzenie projektu wraz z listą użytego filamentu zapisuje dziś dwa niezależne
zapytania do bazy, a niespójność po nieudanym drugim zapytaniu sprząta
kompensacja napisana w kodzie trasy API. Ta zmiana przenosi cały zapis do jednej
funkcji plpgsql, dzięki czemu niepodzielność wynika z transakcji bazy danych, a
nie z tego, że kod kompensujący zdążył się wykonać. Źródłem jest finding **F2**
z przeglądu implementacji.

## Punkt wyjścia

`POST /api/projects` wstawia wiersz do `projects`, potem wiersze do
`project_filaments`, a gdy drugi insert zawiedzie — kasuje przed chwilą
utworzony projekt. Druga strona tego samego cyklu życia, `set_project_status()`,
jest już atomowa i działa pod blokadą wiersza w plpgsql. Obie ścieżki zapisu są
więc dziś zbudowane według dwóch różnych zasad.

## Stan docelowy

Trasa API wykonuje jedno wywołanie RPC `create_project_with_lines()`. Albo
powstaje projekt razem ze wszystkimi pozycjami, albo nie powstaje nic — bez
pośrednich stanów widocznych dla kogokolwiek, także dla równoległego odczytu.
Z kodu aplikacji znika logika kompensacyjna. Dla użytkownika nie zmienia się nic
poza tym, że nie może już zobaczyć projektu bez pozycji.

## Podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Miejsce niepodzielności | Funkcja plpgsql | PostgREST nie ma transakcji rozciągniętej na wiele żądań | Badanie |
| Tryb bezpieczeństwa | `security invoker` | RLS ma pozostać granicą; symetria z `set_project_status` | Badanie |
| Źródło `user_id` | `auth.uid()` wewnątrz funkcji | Parametr dałby się podmienić przez klienta | Plan |
| Kształt wejścia | `p_lines jsonb` | Jedna lista pozycji zamiast n wywołań | Plan |
| Walidacja w TS | Zostaje bez zmian | Odpowiada za komunikaty; baza jest ostatecznym arbitrem | Badanie |
| Priorytet | Nie P0 | Szkoda jest kosmetyczna, nie księgowa — nie psuje bilansu filamentu | Badanie |

## Zakres

**W zakresie:** migracja `0002` z funkcją `create_project_with_lines`;
przepisanie `src/pages/api/projects/index.ts` na wywołanie RPC; usunięcie
kompensacji; wpis R-10 w rejestrze ryzyk i mapie pokrycia; nowa pozycja w
`docs/reference/contract-surfaces.md`.

**Poza zakresem:** edycja istniejącego projektu (ta ścieżka nie tworzy
wierszy w dwóch tabelach naraz); zmiany w widoku `filament_inventory`; zmiany w
`set_project_status`; jakiekolwiek zmiany w interfejsie użytkownika.

## Podejście

Funkcja przyjmuje nazwę, opis i tablicę `jsonb` pozycji, ustala właściciela z
`auth.uid()`, wstawia projekt, rozwija tablicę przez `jsonb_to_recordset` do
`project_filaments` i zwraca `uuid` nowego projektu. Całość wykonuje się w
transakcji pojedynczego wywołania, więc błąd na dowolnym kroku wycofuje
wszystko. Puste wejście kończy się `raise exception` z prefiksem `NO_LINES`,
który `humanise()` już dziś potrafi zamienić na komunikat po polsku.

## Fazy

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Funkcja w bazie | Migracja `0002` + funkcja wykonana w Supabase | Migracja wykonana ręcznie — łatwo zapomnieć |
| 2. Trasa API | Jedno wywołanie RPC zamiast dwóch insertów | Rozjazd nazw pól między `jsonb` a tabelą |
| 3. Dokumentacja | R-10, mapa pokrycia, powierzchnie kontraktowe | Pominięcie któregoś z trzech plików |

**Warunki wstępne:** dostęp do edytora SQL w Supabase; działające `npm test`
(40 testów) i `npm run build` przed rozpoczęciem.
**Szacowany rozmiar:** jedna sesja, trzy fazy, dwa kroki ręczne.

## Ryzyka i założenia

- Kroki 1.2 i 2.3 są ręczne: migracji nie da się wykonać z tego środowiska,
  bo nie sięga ono `*.supabase.co`. Bez nich faza 2 nie ma czego wywołać.
- Zakładamy, że `jsonb_to_recordset` z jawnym `as (filament_id uuid,
  usage_g numeric)` wystarczy — nazwy kluczy muszą się zgadzać co do znaku.
- Migracja `0002` zakłada, że `0001` została wykonana na tej instancji.

## Kryteria sukcesu

- Utworzenie projektu z niepoprawną pozycją nie zostawia w bazie ani projektu,
  ani żadnego wiersza `project_filaments`.
- `npm test` i `npm run build` przechodzą; utworzenie projektu przez interfejs
  działa tak samo jak przed zmianą.
- W kodzie trasy nie ma już żadnego `delete` wykonywanego w reakcji na błąd.
