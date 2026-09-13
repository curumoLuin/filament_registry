---
project: "Filament Registry"
doc: tech-stack
version: 1
status: active
updated: 2026-09-14
---

# Stack technologiczny

Każda pozycja odpowiada na to samo pytanie: *co to dało i co by się stało bez
tego*. Wersje są przypięte dokładnie w `package.json` — ten dokument tłumaczy
wybory, nie numery.

## Runtime i framework

| Wybór | Wersja | Dlaczego to, a nie alternatywa |
| --- | --- | --- |
| **Astro** (`output: 'server'`) | 5.18.2 | Aplikacja to głównie dokumenty renderowane na serwerze z dwoma faktycznie interaktywnymi miejscami. Framework SPA zrobiłby z każdej strony bundle kliencki po to, żeby obsłużyć dwa formularze. Wyspy pozwalają, żeby te dwa miejsca były Reactem, a reszta została czystym HTML-em działającym bez JS-a po stronie klienta. |
| **@astrojs/node** (standalone) | 9.5.5 | Daje jeden proces Node. Działa identycznie pod `astro dev`, `node ./dist/server/entry.mjs` i na dowolnym hoście kontenerowym. Bez vendor lock-inu, bez rozważań o zimnym starcie i bez ograniczeń API runtime'u edge. |
| **React** | 19.3.0 | Tylko dwie wyspy: ekstraktor karty katalogowej i builder pozycji projektu. Wybrany dla znajomości narzędzia, nie z powodów architektonicznych. |
| **TypeScript** | 5.9.3 | `astro/tsconfigs/strict`. Warstwa domenowa mocno się na nim opiera — kody naruszeń i klucze parametrów to typy unijne, więc nieobsłużony przypadek jest błędem kompilacji. |
| **Tailwind CSS** (`@tailwindcss/vite`) | 4.3.3 | Bez pliku konfiguracyjnego, bez osobnego kroku builda, bez dyskusji o nazewnictwie w projekcie jednoosobowym. |

## Dane i tożsamość

| Wybór | Wersja | Dlaczego |
| --- | --- | --- |
| **Supabase Postgres** | — | Zadecydowały dwa wymagania i oba są funkcjami Postgresa, a nie aplikacji: prawdziwa transakcja z blokadą wiersza dla atomowej zmiany statusu (FR-014) oraz row-level security dla izolacji kont. Baza dokumentowa oznaczałaby pisanie obu rzeczy ręcznie. |
| **Supabase Auth** | — | PRD wymaga kontroli dostępu, a nie produktu do zarządzania tożsamością. E-mail i hasło, sesja w ciasteczku, świadomie brak publicznej rejestracji. |
| **@supabase/ssr** | 0.12.7 | Obsługa sesji w ciasteczkach działająca z SSR. |
| **@supabase/supabase-js** | 2.116.0 | Klient. Zawsze tworzony per request jako zalogowany użytkownik; klucz service-role nigdy nie trafia na ścieżkę obsługi żądania. |
| **Zod** | 3.25.76 | Każda granica API parsuje wejście. Konwersje siedzą w schemacie, więc handlery tras zostają cienkie. |

## AI

| Wybór | Dlaczego |
| --- | --- |
| **OpenRouter, opcjonalnie** | Ekstrakcja parametrów z karty katalogowej. Świadomie nie jest elementem krytycznym: bez klucza, przy błędzie sieci albo przy niewiarygodnej wartości `src/lib/ai/extract.ts` schodzi do parsera deterministycznego. Funkcja działa nawet przy całkowitym braku skonfigurowanego dostawcy AI. |
| **Parser deterministyczny jako podłoga** | `src/lib/domain/parameters.ts`. Zakresy wiarygodności per pole, obsługa środka zakresu, synonimy etykiet po angielsku i po polsku. To ta część jest pokryta testami jednostkowymi; model nie jest, bo jest niedeterministyczny i opcjonalny. |

## Testy

| Wybór | Wersja | Rola |
| --- | --- | --- |
| **Vitest** | 3.2.7 | Suite uruchamiany przy każdej zmianie. 33 testy na czystych modułach domenowych, każdy przypisany do numerowanego ryzyka z `test-plan.md`. Bez bazy, bez sieci, milisekundy. |
| **Playwright** | 1.63.0 | Jeden scenariusz z perspektywy użytkownika — 8-krokowy przepływ pierwszej sesji z PRD — plus cofnięcie odjęcia i odmowa dostępu anonimowego. Dowodzi, że całość jest spięta; nie tu mieszkają przypadki brzegowe. |

## CI

GitHub Actions (`.github/workflows/ci.yml`): `npm ci`, testy jednostkowe, build
produkcyjny, przy każdym pushu i pull requeście. Suite E2E świadomie nie jest w
CI — wymaga zaseedowanego projektu Supabase, a zielony pipeline zależny od
współdzielonego, zmiennego stanu jest gorszy niż brak pipeline'u.

## Ograniczenia, które ten stack narzuca

- **Zmienne `PUBLIC_*` są wstawiane na etapie builda przez Vite.** Konfiguracja
  runtime musi więc być czytana przez `src/lib/server/env.ts`, który sprawdza
  oba źródła. To była realna awaria, zanim stała się regułą.
- **Adapter Node oczekuje runtime'u Node.** Przejście na platformę edge
  (Cloudflare Workers) oznacza zamianę na `@astrojs/cloudflare` i ponowną
  weryfikację — patrz `context/deployment/deploy-plan.md`.
- **Playwright potrzebuje binarek przeglądarki** (`npx playwright install chromium`),
  dlatego suite E2E jest bramką lokalną/ręczną, a nie częścią CI.
- **`node_modules` zależy od platformy.** Natywne binarki różnią się między
  Linuksem a macOS; po przeniesieniu repo między nimi trzeba przeinstalować.

## Świadomie nieobecne

Brak menedżera stanu, ORM-a, biblioteki komponentów, Redisa, kolejki i stosu
observability. Jeden użytkownik, kilkadziesiąt rekordów, jeden proces. Każda z
tych rzeczy byłaby kosztem bez odpowiadającego mu wyeliminowanego ryzyka.
