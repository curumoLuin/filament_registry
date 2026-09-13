---
project: "Filament Registry"
doc: deploy-plan
version: 1
status: planned          # NIE wykonane — patrz ## Postęp
updated: 2026-09-14
inputs:
  - context/foundation/infrastructure.md
  - context/foundation/tech-stack.md
---

# Plan wdrożenia

**Status: zaplanowane, niewykonane.** Publiczny URL jest dla bloku 10xBuilder
opcjonalny ("⭐ opcjonalnie, mile widziane"), a termin certyfikacji wypadł, zanim
ta praca została wykonana. Ten dokument zawiera decyzję i procedurę, żeby było to
krótką sesją, a nie projektem badawczym. Nie jest zapisem wdrożenia, które się
odbyło.

## Na jakie pytanie to odpowiada

Nie "którą platformę polecają prowadzący", tylko: która platforma pasuje do
*tego* stacku, *tego* operatora i do agenta, który powinien umieć z nią pracować
z poziomu terminala.

## Porównanie punktowe

Pięć kryteriów przyjaznych agentowi: kompletność CLI, stopień managed/serverless,
dokumentacja czytelna dla agenta, skryptowalne API wdrożeniowe oraz obecność MCP
albo CLI.

| Platforma | CLI | Managed | Dokumentacja dla agenta | API wdrożenia | MCP/CLI | Wymagana zmiana kodu | Werdykt |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Cloudflare Workers** | Pass — `wrangler` robi wszystko bez panelu | Pass | Pass — llms.txt, MDX | Pass | Pass — oficjalny serwer MCP | **Tak** — zamiana `@astrojs/node` → `@astrojs/cloudflare` | **Wybrane** |
| Fly.io | Pass — `flyctl` | Partial — utrzymujesz maszynę | Partial | Pass | tylko CLI | Brak | Zapasowa |
| Render | Partial — prowadzi przez panel | Pass | Partial | Partial | tylko CLI | Brak | Zapasowa |
| DigitalOcean App Platform | Pass — `doctl` | Pass | Partial | Pass | tylko CLI | Brak | Brak darmowego planu dla usług webowych |
| Vercel / Netlify | Pass | Pass | Pass | Pass | CLI | Zamiana adaptera | Wykonalne; bez przewagi nad Cloudflare w tym przypadku |

**Decyzja: Cloudflare Workers.** Darmowy plan wystarcza dla narzędzia
jednoosobowego, `wrangler` daje agentowi pełną operacyjność z terminala, a to
ścieżka opisana w materiałach kursu, więc otaczająca wiedza jest dostępna.

**Znane ryzyko, przyjęte i zapisane:** Cloudflare uruchamia runtime edge, nie
Node. Zamiana adaptera to jedyna realna niewiadoma w tym planie. Aplikacja jest
dobrym kandydatem — używa `fetch`, `@supabase/ssr` i nie sięga do systemu plików
— ale wsparcie sesji w Astro jest przez adapter Node skonfigurowane na
przechowywanie w plikach i wymagałoby Workers KV albo wyłączenia, jeśli nie jest
używane. **Jeśli zamiana zacznie sprawiać problemy, nie debuguj jej pod presją
czasu: zejdź na Fly.io**, który uruchamia istniejący build Node bez zmian.

## Warunki wstępne (człowiek, jednorazowo)

1. Konto Cloudflare — `dash.cloudflare.com/sign-up`, potwierdzenie e-maila.
2. `npx wrangler login` — OAuth w przeglądarce.
3. Projekt Supabase — już postawiony (`arckdjwnocvmiadxtfsd`, Frankfurt).
4. `gh auth login` — do statusu PR-ów i podglądów wdrożeń.

## Procedura

```bash
# 1. adapter
npm rm @astrojs/node
npm i @astrojs/cloudflare
#    astro.config.mjs: import cloudflare from '@astrojs/cloudflare'
#                      adapter: cloudflare()

# 2. weryfikacja lokalna PRZED wdrożeniem — tu mieszka ryzyko
npm run build
npx wrangler dev            # przejdź logowanie, ekstrakcję, oznaczenie jako wydrukowany

# 3. sekrety (nigdy w wrangler.toml, nigdy w repo)
npx wrangler secret put PUBLIC_SUPABASE_URL
npx wrangler secret put PUBLIC_SUPABASE_ANON_KEY
#    OPENROUTER_API_KEY tylko jeśli ekstrakcja przez LLM ma działać na produkcji

# 4. wdrożenie
npx wrangler deploy

# 5. weryfikacja pod publicznym adresem
#    - anonimowe żądanie przekierowuje na /login
#    - logowanie na konto demo
#    - wklejenie karty katalogowej, ekstrakcja, zapis
#    - oznaczenie projektu jako wydrukowany, sprawdzenie dokładnego odjęcia
```

## Sekrety

URL Supabase i klucz publikowalny są już publiczne (opisane w README — granicą
jest RLS, nie klucz). Mimo to trafiają jako sekrety Workera, a nie do
commitowanej konfiguracji, żeby rotacja była jedną komendą. `OPENROUTER_API_KEY`
to prawdziwy sekret i nie może trafić do repozytorium.

## Podglądy wdrożeń

`wrangler` publikuje adres podglądu per gałąź. Sięgają one do tego samego
projektu Supabase, więc podgląd pisze do żywych danych — akceptowalne dla
narzędzia jednoosobowego i warte drugiego projektu Supabase w momencie, w którym
przestanie być prawdą.

## Wycofanie

`npx wrangler rollback` — jedna komenda, jedna poprzednia wersja, sekundy.
Weryfikacja przez przeładowanie publicznego adresu. Baza nie jest wycofywana:
migracje są addytywne i nie istnieje żadna migracja destrukcyjna, więc samo
wycofanie Workera jest dziś bezpieczne. Przestanie takie być przy pierwszej
migracji usuwającej albo zmieniającej nazwę kolumny — wtedy trzeba wrócić do tej
sekcji.

## Uprawnienia

| Akcja | Kto |
| --- | --- |
| `wrangler deploy` na produkcję | człowiek zatwierdza |
| `wrangler rollback` | agent może wykonać — to bezpieczny kierunek |
| Odczyt logów, lista wdrożeń | agent |
| Rotacja sekretu | człowiek |
| Dowolna destrukcyjna operacja na bazie | człowiek, nigdy delegowane |

## Checklista weryfikacyjna

- [ ] Anonimowe żądanie do `/filaments` przekierowuje na `/login`
- [ ] Trasa API zwraca 401 przy braku sesji
- [ ] Logowanie działa względem żywego projektu Supabase
- [ ] Ekstrakcja z karty katalogowej zwraca parametry (ścieżka parsera działa bez klucza)
- [ ] Oznaczenie projektu jako wydrukowany odejmuje dokładnie zadeklarowane zużycie
- [ ] Powrót do szkicu przywraca dokładnie tę samą ilość
- [ ] `npm run test:e2e` przechodzi z `E2E_BASE_URL` ustawionym na publiczny adres

## Postęp

- [ ] Faza 1 — zamiana adaptera, zweryfikowana lokalnie przez `wrangler dev`
- [ ] Faza 2 — skonfigurowane sekrety
- [ ] Faza 3 — pierwsze wdrożenie, checklista weryfikacyjna zamknięta
- [ ] Faza 4 — publiczny adres zapisany w README i w formularzu zgłoszeniowym

*Nic z powyższego nie zostało wykonane. MVP działa lokalnie i tam jest
zweryfikowane; patrz `docs/screenshots/` oraz suite E2E.*
