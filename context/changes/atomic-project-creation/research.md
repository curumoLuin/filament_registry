# Research — atomic-project-creation

> Change: `context/changes/atomic-project-creation/change.md`
> Pytanie: gdzie realnie żyje ryzyko z findingu F2 i jaka jest najtańsza warstwa, która je zamyka.

## Co jest dzisiaj

`src/pages/api/projects/index.ts` tworzy projekt w **dwóch niezależnych
zapytaniach**, z ręczną kompensacją pomiędzy nimi:

| Linia | Operacja |
| --- | --- |
| 45–54 | `insert` do `projects`, `.select('id').single()` |
| 60–68 | `insert` do `project_filaments` dla wszystkich pozycji |
| 69–72 | jeśli drugi insert padnie: `delete` projektu i zwrot błędu |

Między linią 54 a 68 istnieje okno, w którym w bazie leży projekt bez ani jednej
pozycji. Kompensacja z linii 71 jest zwykłym zapytaniem sieciowym — może paść
sama (utrata połączenia, timeout, restart procesu między jednym a drugim
wywołaniem).

## Jaka jest realna szkoda

Osierocony projekt bez pozycji **nie psuje magazynu**. `set_project_status`
podnosi `NO_LINES` i odmawia zmiany statusu, więc żadne błędne odjęcie nie
nastąpi. Skutek jest kosmetyczny, ale trwały: na liście projektów siedzi wiersz,
którego nie da się wydrukować ani naprawić z poziomu UI — użytkownikowi zostaje
go tylko usunąć.

Wniosek: to nie jest ryzyko klasy P0. Poprawka jest warta zrobienia nie z uwagi
na skalę szkody, tylko dlatego, że **druga strona tego samego cyklu życia jest
już atomowa** i asymetria jest myląca dla każdego, kto czyta ten kod.

## Dlaczego dziś nie jest to transakcją

Supabase REST (PostgREST) nie udostępnia transakcji obejmującej wiele żądań.
Klient może wysłać wiele instrukcji tylko w jednym wywołaniu RPC. Projekt zna już
ten wzorzec: `set_project_status` (migracja `0001_init.sql:105`) to plpgsql
`security invoker`, który blokuje wiersze, waliduje i zapisuje w jednej
transakcji.

## Najtańsza warstwa, która to zamyka

Funkcja w Postgresie przyjmująca projekt i jego pozycje jednym wywołaniem.
Wszystko w ciele funkcji dzieje się w jednej transakcji — wyjątek wycofuje
całość, więc okno „projekt bez pozycji" znika **strukturalnie**, a nie przez
staranniejszą obsługę błędów.

Alternatywy odrzucone:

| Wariant | Dlaczego nie |
| --- | --- |
| Ponawianie kompensacji | Nie usuwa okna, tylko zwęża. Ta sama klasa błędu wraca przy kolejnej awarii. |
| Zadanie sprzątające osierocone projekty | Infrastruktura do problemu, który znika przez zmianę jednego zapytania. |
| Wymóg pozycji przez `CHECK` na `projects` | Niewykonalne — pozycje wstawiane są po projekcie, więc ograniczenie fałszywie padałoby zawsze. |

## Czego ta zmiana NIE rusza

- Walidacja dostępności przy tworzeniu (FR-009/FR-013) zostaje w TypeScripcie.
  Jest już przetestowana jednostkowo (R-02) i jej zadaniem jest komunikat
  wskazujący szpulę i wielkość braku. RPC nie duplikuje jej logiki.
- `set_project_status` i cała ścieżka odjęcia z magazynu.
- Kształt formularza i wyspa `ProjectForm`.

## Czym da się to udowodnić

Gwarancja jest **strukturalna**: jedno wywołanie, jedna transakcja. Nie da się
jej pokryć testem jednostkowym, bo nie ma tu czystej funkcji do wywołania — cała
własność żyje w granicy transakcji bazy danych. To ta sama sytuacja co ryzyko
R-07, gdzie kontrolą jest definicja polityki RLS, a nie kod aplikacji.

Weryfikacja: istniejący E2E pokrywa ścieżkę szczęśliwą (regresja), a wycofanie
transakcji sprawdzane jest ręcznie przez wymuszenie błędu w pozycjach.
