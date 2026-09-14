# Filament Registry — reguły pracy dla agenta

Konwencje i ograniczenia, których **nie da się** wywnioskować z samego kodu.
Reszta (co robi produkt, dlaczego model danych wygląda tak, a nie inaczej)
mieszka w `context/foundation/` — czytaj tamte pliki zamiast powielać je tutaj.

## Komendy

```bash
npm run dev          # http://localhost:4321
npm test             # testy jednostkowe Vitest — szybkie, hermetyczne, bez sieci
npm run test:e2e     # Playwright; sam podnosi serwer deweloperski
npm run build        # build produkcyjny (adapter Node, standalone)
npm run typecheck    # astro check
npm run screenshots  # regeneruje docs/screenshots/ przy działającym serwerze dev
```

`npm test` musi przechodzić przed każdym commitem. Nie potrzebuje bazy ani
sieci — jeśli jakaś zmiana to psuje, znaczy że trafiła w niewłaściwą warstwę.

## Warstwy — reguła, która znaczy najwięcej

```
src/lib/domain/    czyste. bez I/O, bez frameworka, bez Supabase, bez fetch.
src/lib/server/    całe I/O siedzi tutaj: klient Supabase, env, dostęp do danych.
src/pages/api/     cienkie. parsuj → waliduj → wywołaj domenę → wywołaj server → przekieruj.
src/components/    wyspy React. Są dwie. Opieraj się dokładaniu kolejnych.
```

Reguły biznesowe trafiają do `src/lib/domain/`. Jeśli łapiesz się na imporcie
`@supabase/supabase-js` do `domain/`, zatrzymaj się — reguła należy do czystej
funkcji, a I/O do jej wywołującego. To właśnie pozwala testować rejestr ryzyk z
`context/foundation/test-plan.md` wyczerpująco w milisekundach.

## Niezmienniki — nie łam ich bez wcześniejszej zmiany planu testów

- **Dostępna ilość jest wyliczana, nigdy przechowywana.**
  `available = initial_quantity_g − Σ(zużycie projektów wydrukowanych)`,
  liczone przez widok `filament_inventory`. Nigdy nie dodawaj przechowywanej
  kolumny `remaining`. Przechowywany licznik potrzebuje dwóch zapisów, żeby
  pozostać poprawnym; wartość wyliczana nie może się rozjechać.
- **`set_project_status()` w Postgresie jest instancją rozstrzygającą** dla
  zmian statusu. Sprawdzenie w TypeScripcie z `src/lib/domain/inventory.ts`
  biegnie wcześniej tylko po to, żeby komunikat wskazał szpulę i wielkość braku.
  Nigdy nie omijaj RPC bezpośrednim `update` na `projects.status` — tracisz
  blokadę wiersza i atomowość.
- **Granicą bezpieczeństwa jest RLS, nie kod aplikacji.** Każde zapytanie działa
  jako zalogowany użytkownik. Nigdy nie wprowadzaj klucza service-role na ścieżkę
  obsługi żądania.
- **LLM nigdy nie jest elementem krytycznym.** `src/lib/ai/extract.ts` musi
  zawsze schodzić do parsera deterministycznego z
  `src/lib/domain/parameters.ts`. Brak klucza, błąd sieci, timeout i
  niewiarygodna wartość degradują, nigdy nie rzucają wyjątku.
- **Wyekstrahowane parametry są pokazywane do przeglądu przed zapisem.** Nic, co
  wyprodukował model, nie jest utrwalane bez przejścia przez formularz.

## Konwencje

- Czytaj zmienne środowiskowe przez `serverEnv()` z `src/lib/server/env.ts`,
  nigdy bezpośrednio przez `import.meta.env.X` — patrz pułapki niżej.
- Waliduj każde wejście schematami Zod z `src/lib/schemas.ts`.
- Migracje to zwykły SQL w `supabase/migrations/`, wykonywany przez edytor SQL w
  Supabase. Nie ma żadnego runnera migracji.
- Preferuj zwykłe formularze HTML z handlerami POST. Po wyspę React sięgaj
  tylko wtedy, gdy interakcja naprawdę nie może działać bez JS-a po stronie
  klienta.
- Każdy nowy test musi odwzorowywać numerowane ryzyko z
  `context/foundation/test-plan.md`. Test, który nie odwzorowuje żadnego, nie
  powstaje.
- Trzymaj listę zależności krótką. Dodanie jednej to decyzja, nie odruch.

## Pułapki — każda z nich kosztowała realny czas

- **Zmienne `PUBLIC_*` są wstawiane przez Vite na etapie builda.** Kontener
  dostający konfigurację przy starcie widzi puste wartości. `serverEnv()` czyta
  zmienne z builda *i* z runtime'u; używaj go.
- **Astro binduje `localhost`, co na macOS rozwiązuje się na `::1` przed
  `127.0.0.1`.** Cokolwiek odpytuje `127.0.0.1:4321`, dostanie timeout mimo w
  pełni sprawnego serwera.
- **Wyspy hydratują się po renderze serwerowym.** Dane wpisane przed hydratacją
  aktualizują DOM, ale nie stan Reacta, a następny render je wyrzuca.
  `FilamentForm` i `ProjectForm` wystawiają `data-hydrated="true"`; czekaj na to,
  zanim zaczniesz sterować nimi programowo.
- **`node_modules` zależy od platformy.** Instalacja na Linuksie i uruchomienie
  na macOS (albo odwrotnie) pada na natywnych binarkach. Po przeniesieniu
  przeinstaluj.
- **Pasek deweloperski Astro nakłada się na stronę** i ląduje na środku
  pełnostronicowego zrzutu ekranu. `scripts/capture-screenshots.mjs` go ukrywa.
- **Zakresy w kartach katalogowych używają myślnika** (`220-250 °C`). Parser
  normalizuje separatory zakresów przed dopasowaniem cyfr; naiwne `-?\d+` czyta
  to jako −250.

## Definicja ukończenia

1. `npm test` na zielono.
2. `npm run build` na zielono.
3. Jeśli zmiana dotyka przepływu użytkownika — `npm run test:e2e` na zielono.
4. Jeśli zmiana rusza arytmetykę magazynu, przejścia statusu albo parser —
   rejestr ryzyk w `test-plan.md` przejrzany i zaktualizowany w tej samej
   zmianie.
<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
