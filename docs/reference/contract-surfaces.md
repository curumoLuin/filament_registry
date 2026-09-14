# Powierzchnie kontraktowe

> Rejestr nazw i schematów, na których opiera się reszta projektu.
> `/10x-plan-review` przeszukuje treść planu pod kątem nagłówków H2 z tego pliku
> i oznacza trafienia jako potencjalne breaking changes.
>
> Każda powierzchnia to osobny H2. W treści: kanoniczna definicja (plik:linia),
> właściciele/konsumenci, checklista breaking change.
>
> Nazwy, których tu nie ma, można zmieniać swobodnie.
>
> Nagłówki celowo zostają w oryginalnym brzmieniu — to identyfikatory z kodu,
> a nie tekst do tłumaczenia.

## filament_inventory

- **Kanoniczna definicja**: `supabase/migrations/0001_init.sql:85` — widok z `security_invoker = on`, wystawiający `available_quantity_g` i `deducted_quantity_g` obok wszystkich kolumn `filaments`. Dostępność to `initial_quantity_g − Σ(estimated_usage_g z project_filaments, których projekt ma status 'printed')`.
- **Właściciele / konsumenci**: `src/lib/server/repository.ts` (`listInventory`, `getInventoryItem`, `toStock`); `set_project_status` czyta go przy ponownej walidacji; E2E asercjonuje na wyrenderowanej wartości.
- **Checklista breaking change**: Ten widok *jest* kontraktem wyliczanej dostępności — nigdy nie zastępuj go przechowywaną kolumną. Zmiana joina albo warunku `status = 'printed'` po cichu zmienia każdą ilość w aplikacji, bez żadnego błędu typów. Jeśli zmienia się kształt, zaktualizuj `InventoryRow`, `toStock()` i granta na widoku, a potem przejdź ponownie ryzyka R-01 i R-04 z planu testów.

## set_project_status

- **Kanoniczna definicja**: `supabase/migrations/0001_init.sql:105` — `public.set_project_status(p_project_id uuid, p_status text) returns public.projects`, `security invoker`, plpgsql. Blokuje wiersz projektu i każdą powiązaną szpulę, ponownie waliduje dostępność, dopiero potem zmienia status — wszystko w jednej transakcji.
- **Właściciele / konsumenci**: Wołana po nazwie przez `supabase.rpc()` w `src/pages/api/projects/[id]/status.ts`. Nie istnieje żadna inna ścieżka zapisu do `projects.status`.
- **Checklista breaking change**: Ta funkcja jest instancją rozstrzygającą dla FR-013/FR-014 — sprawdzenie w TypeScripcie, które biegnie wcześniej, służy komunikatom, nie egzekwowaniu. Nigdy nie omijaj jej bezpośrednim `update`, bo tracisz blokadę wiersza i atomowość. Zmiana nazwy albo sygnatury psuje trasę dopiero w runtime. Prefiksy zgłaszanych przez nią błędów same są kontraktem (niżej).

## create_project_with_lines

- **Kanoniczna definicja**: `supabase/migrations/0002_atomic_project_creation.sql` — `public.create_project_with_lines(p_name text, p_description text, p_lines jsonb) returns uuid`, `security invoker`, plpgsql. Ustala właściciela z `auth.uid()`, wstawia projekt i rozwija `p_lines` do `project_filaments` w jednej transakcji.
- **Właściciele / konsumenci**: Wołana po nazwie przez `supabase.rpc()` w `src/pages/api/projects/index.ts`. Nie istnieje żadna inna ścieżka tworzenia projektu.
- **Checklista breaking change**: Klucze obiektów w `p_lines` (`filament_id`, `filament_name_snapshot`, `estimated_usage_g`) muszą zgadzać się co do znaku z listą kolumn w `jsonb_to_recordset` — rozjazd nazw nie jest błędem, tylko cichym `NULL`. Nigdy nie wracaj do dwóch osobnych insertów z kompensacją w kodzie: niepodzielność ma wynikać z transakcji, a nie z tego, czy kod sprzątający zdążył się wykonać (R-10). Funkcja zgłasza `NO_LINES` — ten sam prefiks co `set_project_status`.

## INSUFFICIENT_QUANTITY / FILAMENT_MISSING / NO_LINES (prefiksy błędów RPC)

- **Kanoniczna definicja**: `supabase/migrations/0001_init.sql` — `INSUFFICIENT_QUANTITY: …`, `FILAMENT_MISSING: …`, `NO_LINES`, `INVALID_STATUS: …`, `PROJECT_NOT_FOUND`; `supabase/migrations/0002_atomic_project_creation.sql` — `NO_LINES`, `NOT_AUTHENTICATED`.
- **Właściciele / konsumenci**: `humanise()` w `src/lib/server/db-errors.ts` dopasowuje je po stringu, żeby wygenerować tekst dla użytkownika; wołają go obie trasy zapisu (`projects/index.ts`, `projects/[id]/status.ts`).
- **Checklista breaking change**: Przeredagowanie komunikatu w Postgresie sprawia, że użytkownik widzi surowy błąd bazy. Zmieniaj oba miejsca razem albo przejdź na dopasowanie po `errcode` zamiast po treści.

## ViolationCode

- **Kanoniczna definicja**: `src/lib/domain/inventory.ts:43` — unia `INSUFFICIENT_QUANTITY`, `FILAMENT_MISSING`, `NON_POSITIVE_USAGE`, `DUPLICATE_FILAMENT`, `NO_LINES`.
- **Właściciele / konsumenci**: `validateUsage` / `markPrinted`; asercje po nazwie w `tests/unit/inventory.test.ts`; renderowane przez `ProjectForm` i widok szczegółów projektu.
- **Checklista breaking change**: Dodanie członu jest bezpieczne (kompletność jest sprawdzana). Zmiana nazwy kompiluje się bez problemu, ale po cichu zmienia to, co asercjonują testy jednostkowe — zaktualizuj ich intencję, nie tylko stringi.

## ParameterKey

- **Kanoniczna definicja**: `src/lib/domain/parameters.ts:28` — `keyof PrintParameters`: `nozzleTempC`, `bedTempC`, `printSpeedMms`, `flowRatePct`, `coolingPct`.
- **Właściciele / konsumenci**: Jednocześnie klucze obiektu, kolumny bazy w snake_case (`nozzle_temp_c`…), atrybuty `name` w formularzu i identyfikatory testowe E2E. Cztery warstwy spięte konwencją, nie typem.
- **Checklista breaking change**: Zmiana nazwy musi trafić naraz w pięć miejsc: typ, `RANGES` (`parameters.ts:48`), kolumnę w migracji, `PARAM_FIELDS` w `FilamentForm.tsx` i selektory E2E. Tylko dwa pierwsze sprawdza kompilator.

## RANGES (zakresy wiarygodności)

- **Kanoniczna definicja**: `src/lib/domain/parameters.ts:48` — `[min, max]` per parametr, akceptowane z dowolnej ścieżki ekstrakcji.
- **Właściciele / konsumenci**: Parser deterministyczny oraz normalizator odpowiedzi modelu w `src/lib/ai/extract.ts`; odbicie w ograniczeniach `CHECK` na tabeli `filaments` w migracji.
- **Checklista breaking change**: To jedyna rzecz stojąca między halucynacją modelu a zapisaną temperaturą dyszy. Poszerzenie zakresu musi zostać odzwierciedlone w `CHECK` w migracji, inaczej inserty zaczną padać na bazie zamiast być odrzucane z komunikatem. Zamyka ryzyko R-05 z planu testów.

## data-hydrated

- **Kanoniczna definicja**: `src/components/FilamentForm.tsx:120` i `src/components/ProjectForm.tsx:96` — `"true"`, gdy wyspa się zhydratowała.
- **Właściciele / konsumenci**: `waitForIsland()` w `tests/e2e/first-session.spec.ts`; wszystko, co steruje tymi formularzami programowo.
- **Checklista breaking change**: Usunięcie przywraca wyścig hydratacji — dane wchodzą, stan Reacta zostaje pusty, kontrolki nigdy się nie aktywują. Każda nowa wyspa trzymająca stan formularza musi wystawiać ten sam atrybut.

## PUBLIC_PATHS

- **Kanoniczna definicja**: `src/middleware.ts:5` — pełny zbiór tras bez uwierzytelnienia: `/login`, `/api/auth/login`, `/api/auth/logout`.
- **Właściciele / konsumenci**: Strażnik uwierzytelniania. Nie ma nigdzie drugiej listy dozwolonych ścieżek.
- **Checklista breaking change**: Dodanie wpisu czyni trasę publicznie dostępną. Każde dopisanie wymaga uzasadnienia i sprawdzenia względem ryzyka R-08 z planu testów.

## serverEnv

- **Kanoniczna definicja**: `src/lib/server/env.ts:10` — jedyny dopuszczony czytnik konfiguracji; sprawdza `import.meta.env` z builda, a potem `process.env`.
- **Właściciele / konsumenci**: Fabryka klienta Supabase, ekstraktor OpenRouter. Klucze: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`.
- **Checklista breaking change**: Odwołanie do `import.meta.env.X` gdziekolwiek indziej przywraca błąd wstawiania wartości na etapie builda — działa w dev, pusto w kontenerze konfigurowanym przy starcie. Patrz `context/foundation/lessons.md`.

## project_filaments.filament_id ON DELETE SET NULL

- **Kanoniczna definicja**: `supabase/migrations/0001_init.sql:53`.
- **Właściciele / konsumenci**: Zachowanie miękkiej referencji z FR-008; `filament_name_snapshot` to nazwa pokazywana po usunięciu szpuli; `FILAMENT_MISSING` opiera się na nullu.
- **Checklista breaking change**: Przejście na `CASCADE` niszczy historyczne pozycje projektów i sprawia, że komunikat "filament deleted" staje się nieosiągalny. Przejście na `RESTRICT` blokuje usuwanie, co jest sprzeczne z FR-008.

## data-testid (identyfikatory używane przez E2E)

- **Kanoniczna definicja**: Atrybuty `data-testid` w `src/components/` i `src/pages/`, wybierane w `tests/e2e/first-session.spec.ts`.
- **Właściciele / konsumenci**: Wyłącznie suite E2E. Faktycznie używane: `add-filament-link`, `datasheet-input`, `extract-button`, `extract-summary`, `filament-name`, `filament-manufacturer`, `filament-material`, `filament-quantity`, `save-filament`, `inventory-row`, `available-quantity`, `project-name`, `line-filament`, `line-usage`, `line-available`, `save-project`, `project-row`, `project-status`, `parameter-block`, `mark-printed`, `mark-draft`, `flash-ok`, plus identyfikatory pól `nozzle_temp_c` / `bed_temp_c` / `print_speed_mms`.
- **Checklista breaking change**: Zmiana nazwy używanego identyfikatora wywala suite timeoutem, a nie błędem typów — najwolniejsze możliwe sprzężenie zwrotne. Pozostałe wartości `data-testid` istnieją w komponentach i nie są powierzchniami kontraktowymi, dopóki nie zależy od nich żaden test.
