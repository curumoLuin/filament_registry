---
project: "Filament Registry"
doc: infrastructure
version: 1
status: active
updated: 2026-09-14
---

# Infrastruktura

## Kształt systemu

```
  przeglądarka
     │  HTML + dwie wyspy React
     ▼
  Astro 5 (SSR, adapter @astrojs/node standalone)
     │  ├── src/middleware.ts ......... strażnik sesji przy każdym żądaniu
     │  ├── src/pages/**  ............. trasy i endpointy API
     │  └── src/lib/domain/** ......... czyste reguły biznesowe (bez I/O)
     │
     ├──► Supabase Postgres  ........ dane, wyliczany widok magazynu, RLS
     ├──► Supabase Auth  ............ e-mail i hasło, sesja w ciasteczku
     └──► OpenRouter (opcjonalnie) .. ekstrakcja z karty, degradowalna
```

Jeden proces, jedna baza, bez kolejki, bez cache'a, bez workera w tle. Docelowa
skala z PRD to jeden użytkownik i kilkadziesiąt rekordów; cokolwiek więcej
byłoby infrastrukturą dla samej infrastruktury.

## Komponenty

| Komponent | Wybór | Dlaczego akurat ten |
| --- | --- | --- |
| Framework webowy | Astro 5, `output: 'server'` | Aplikacja to w większości dokumenty renderowane serwerowo z dwoma naprawdę interaktywnymi miejscami. Wyspy pozwalają, żeby te dwa były Reactem, a reszta została zwykłymi formularzami HTML działającymi bez JS-a. |
| Runtime | Node 22 przez `@astrojs/node` (standalone) | Działa identycznie pod `npm run dev`, `node ./dist/server/entry.mjs` i na dowolnym hoście kontenerowym. Bez vendor lock-inu. |
| Baza danych | Supabase Postgres | Potrzebna była prawdziwa transakcja dla atomowej zmiany statusu (FR-014) i row-level security dla izolacji kont. Jedno i drugie to funkcje Postgresa, a nie aplikacji. |
| Uwierzytelnianie | Supabase Auth (e-mail + hasło) | PRD wymaga kontroli dostępu, nie produktu do zarządzania tożsamością. Sesje w ciasteczkach przez `@supabase/ssr`; świadomie brak publicznej rejestracji. |
| LLM | OpenRouter, opcjonalnie | Świadomie nie jest elementem krytycznym — patrz *Degradacja* niżej. |
| Style | Tailwind CSS 4 przez `@tailwindcss/vite` | Bez osobnego kroku builda i bez pliku konfiguracyjnego. |
| Testy | Vitest (jednostkowe), Playwright (E2E) | Patrz `test-plan.md`. |
| CI | GitHub Actions — `.github/workflows/ci.yml` | `npm ci`, testy jednostkowe i build produkcyjny przy każdym pushu i PR-ze. |

## Konfiguracja

Cała konfiguracja to zmienne środowiskowe; w repozytorium nie ma sekretów.

| Zmienna | Wymagana | Do czego |
| --- | --- | --- |
| `PUBLIC_SUPABASE_URL` | tak | Endpoint projektu Supabase |
| `PUBLIC_SUPABASE_ANON_KEY` | tak | Klucz publikowalny — bezpieczny do wysłania do klienta; danych broni RLS |
| `OPENROUTER_API_KEY` | nie | Włącza ekstrakcję przez LLM; brak oznacza użycie parsera deterministycznego |
| `OPENROUTER_MODEL` | nie | Domyślnie `openai/gpt-4o-mini` |
| `E2E_EMAIL` / `E2E_PASSWORD` | tylko testy | Zaseedowane konto dla suite'u Playwright |

`src/lib/server/env.ts` czyta `import.meta.env` z builda **oraz** `process.env` z
runtime'u. Vite wstawia `PUBLIC_*` na etapie builda, więc kontener dostający
konfigurację przy starcie widziałby inaczej puste wartości — to była realna
awaria, wykryta przez uruchomienie zbudowanego serwera wyłącznie ze zmiennymi
runtime.

Klucz service-role nie jest używany przez aplikację w ogóle. Każde zapytanie
działa jako zalogowany użytkownik, żeby to RLS był faktyczną granicą.

## Warstwa danych

Trzy tabele — `filaments`, `projects`, `project_filaments` — oraz:

- **`filament_inventory`** (widok, `security_invoker`): dostępna ilość jest
  *wyliczana*, nigdy przechowywana:
  `initial_quantity_g − Σ(zużycie projektów wydrukowanych)`. Przechowywany
  licznik wymagałby dwóch zapisów, żeby pozostać poprawnym; wartość wyliczana
  nie może się rozjechać.
- **`set_project_status(uuid, text)`** (plpgsql, `security invoker`): blokuje
  każdą powiązaną szpulę, ponownie waliduje dostępność i zmienia status w jednej
  transakcji. To instancja rozstrzygająca dla FR-013/FR-014; reguły w
  TypeScripcie z `src/lib/domain/inventory.ts` biegną wcześniej tylko po to, żeby
  komunikat mógł wskazać szpulę i wielkość braku.
- **RLS** na wszystkich trzech tabelach, zawężony do `auth.uid()`, przy czym
  `project_filaments` dziedziczy własność po swoim projekcie.

Migracje to zwykły SQL w `supabase/migrations/`, wykonywany przez edytor SQL w
Supabase albo `supabase db push`.

## Degradacja

| Gdy to zawiedzie | Co się dzieje |
| --- | --- |
| OpenRouter nieosiągalny, wolny albo bez klucza | Zejście do parsera deterministycznego z `src/lib/domain/parameters.ts`. Użytkownik i tak dostaje wynik i zatwierdza go przed zapisem. |
| Model zwraca niewiarygodną wartość | Odrzucona przez kontrolę zakresu per pole i zastąpiona wartością parsera albo zostawiona pusta i zgłoszona jako nieodczytana. |
| Supabase nieosiągalny w trakcie żądania | Middleware degraduje do stanu "wylogowany" zamiast zwracać 500 na każdej trasie. |
| Dwa projekty walczą o tę samą szpulę | Blokada wiersza wewnątrz `set_project_status` szereguje je; drugi dostaje odmowę z nazwanym brakiem. |

## Wdrożenie

Build produkuje samodzielny serwer Node:

```bash
npm run build
PUBLIC_SUPABASE_URL=… PUBLIC_SUPABASE_ANON_KEY=… node ./dist/server/entry.mjs
```

Zadziała wszystko, co uruchamia Node 22 i podaje zmienne środowiskowe —
DigitalOcean App Platform, Fly.io, Railway, kontener na VPS-ie. Nie ma kodu
zależnego od platformy, stanu na dysku ani sekretu wymaganego w czasie builda,
więc ten sam artefakt działa w każdym środowisku.

Supabase jest usługą zarządzaną; poza migracją nie ma tam nic do utrzymywania.

## Świadomie nieobecne

Brak Redisa, kolejki zadań, konfiguracji CDN, stosu observability i pipeline'u
promocji między środowiskami. Jeden użytkownik, kilkadziesiąt rekordów, jeden
proces. Dołożenie czegokolwiek z tej listy byłoby kosztem bez odpowiadającego mu
wyeliminowanego ryzyka.
