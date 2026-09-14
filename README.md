# Filament Registry

Magazyn filamentu do druku 3D, który odpowiada na dwa pytania, na które hobbysta
odpowiada dziś ręcznie: **czy mam dość materiału na ten wydruk** i **jakich
ustawień chce ta szpula**.

Wklejasz kartę katalogową producenta, a parametry druku zostają z niej wyciągnięte.
Deklarujesz, ile gramów zużyje projekt, a aplikacja tego pilnuje: oznaczenie
projektu jako wydrukowanego odejmuje dokładnie tę ilość, atomowo, a powrót do
szkicu odwraca odjęcie co do grama.

Projekt zaliczeniowy **10xDevs 3.0**, blok 10xBuilder.

---

## Konto demo

Recenzent może uruchomić aplikację na żywej bazie bez żadnej konfiguracji.

```
adres     http://localhost:4321  (po trzech komendach poniżej)
e-mail    user@example.com
hasło     password10xDevs
```

```bash
git clone https://github.com/curumoLuin/filament_registry.git
cd filament_registry
npm install
printf '%s\n' \
  'PUBLIC_SUPABASE_URL=https://arckdjwnocvmiadxtfsd.supabase.co' \
  'PUBLIC_SUPABASE_ANON_KEY=sb_publishable_L2o8obisxwMAWFNsoipjrA_WEPQ0JPk' > .env
npm run dev
```

Konto ma już dwie szpule i dwa projekty — jeden szkic korzystający z obu
filamentów (żeby widać było ostrzeżenie o konflikcie parametrów) i jeden już
wydrukowany (żeby widać było odjęcie z magazynu).

**Gdyby logowanie nie odpowiadało.** Projekt Supabase działa na planie darmowym,
a ten pauzuje instancję po kilku dniach bezczynności. Jeśli aplikacja nie może
połączyć się z bazą, to najprawdopodobniej właśnie to — projekt wraca do życia po
wznowieniu z panelu Supabase. Nie blokuje to oceny: sekcja *Uruchomienie od zera*
niżej stawia całość na własnym, pustym projekcie Supabase w kilka minut, bo
migracja (`supabase/migrations/0001_init.sql`) i dane demonstracyjne
(`supabase/seed.sql`) są w repozytorium.

**O publikowaniu tych wartości.** Klucz *publishable* Supabase jest z założenia
publiczny: trafia do bundle'a klienckiego każdej aplikacji na Supabase i sam z
siebie niczego nie autoryzuje. Konta rozdziela row-level security — każda polityka
w `supabase/migrations/0001_init.sql` jest zawężona do `auth.uid()`, więc ktoś, kto
ma ten klucz i te dane logowania, widzi wiersze konta demo i niczyje inne. Hasło
jest świadomie słabe, bo konto jest świadomie jednorazowe i nie służy do niczego
innego.

---

## Wymagania certyfikacyjne — gdzie znajduje się każde z nich

| Wymaganie (10xBuilder) | Gdzie jest zrealizowane |
| --- | --- |
| **Mechanizm kontroli dostępu** | Supabase Auth, e-mail + hasło. `src/pages/login.astro` to ekran logowania; `src/middleware.ts` chroni każdą trasę i zwraca 401 na trasach API; row-level security w `supabase/migrations/0001_init.sql` zawęża każdy wiersz do `auth.uid()`, więc izolację kont egzekwuje Postgres, a nie kod aplikacji. |
| **Zarządzanie danymi (CRUD)** | Filamenty — tworzenie `src/pages/api/filaments/index.ts`, odczyt `src/pages/filaments/index.astro`, aktualizacja i usuwanie `src/pages/api/filaments/[id].ts`. Projekty — tworzenie `src/pages/api/projects/index.ts`, odczyt `src/pages/projects/`, aktualizacja (status) `src/pages/api/projects/[id]/status.ts`, usuwanie `src/pages/api/projects/[id].ts`. |
| **Logika biznesowa** | Dwie reguły, obie jako czyste moduły w `src/lib/domain/`. (1) *Cykl życia magazynu* — `inventory.ts`: bramka dostępności stosowana przy tworzeniu projektu **i ponownie** w momencie druku, odjęcie wszystko-albo-nic oraz jego dokładne cofnięcie. (2) *Ekstrakcja parametrów* — `parameters.ts`: deterministyczny parser karty katalogowej z zakresami wiarygodności per pole oraz wykrywanie konfliktów w projekcie wielofilamentowym. `src/lib/ai/extract.ts` dokłada opcjonalną warstwę LLM, która w razie czego schodzi do parsera. |
| **Dokumenty kontekstowe** | [`context/foundation/prd.md`](context/foundation/prd.md) · [`shape-notes.md`](context/foundation/shape-notes.md) · [`tech-stack.md`](context/foundation/tech-stack.md) · [`infrastructure.md`](context/foundation/infrastructure.md) · [`roadmap.md`](context/foundation/roadmap.md) · [`test-plan.md`](context/foundation/test-plan.md) · [`lessons.md`](context/foundation/lessons.md) · [`context/deployment/deploy-plan.md`](context/deployment/deploy-plan.md) · [`docs/reference/contract-surfaces.md`](docs/reference/contract-surfaces.md) · [`CLAUDE.md`](CLAUDE.md) (reguły pracy dla agenta) |
| **Testy — co najmniej jeden test z perspektywy użytkownika** | [`tests/e2e/first-session.spec.ts`](tests/e2e/first-session.spec.ts) prowadzi prawdziwą przeglądarkę przez 8-krokowy przepływ pierwszej sesji z PRD: logowanie → wklejenie karty katalogowej → przegląd wyciągniętych parametrów → zapis szpuli → utworzenie projektu z zadeklarowanym zużyciem → podgląd zagregowanych parametrów → oznaczenie jako wydrukowany → potwierdzenie, że magazyn zmniejszył się dokładnie o tę ilość. Drugi test potwierdza cofnięcie odjęcia, trzeci — że anonimowy gość nie dosięgnie danych. Pod spodem `tests/unit/` pokrywa rejestr ryzyk 33 testami jednostkowymi. |

Wszystko powyżej wynika z [`context/foundation/test-plan.md`](context/foundation/test-plan.md),
który najpierw nazywa ryzyka, a dopiero potem przypisuje każdemu test, który je
zamyka.

---

## Stack

Astro 5 (SSR, adapter Node) · wyspy React 19 · TypeScript · Tailwind CSS 4 ·
Supabase (Postgres + Auth + RLS) · Zod · Vitest · Playwright.

---

## Uruchomienie od zera

### 1. Instalacja

```bash
npm install
```

### 2. Utworzenie projektu Supabase

1. Załóż projekt na [supabase.com](https://supabase.com).
2. **SQL Editor** → wklej całą zawartość `supabase/migrations/0001_init.sql` → Run,
   a następnie `supabase/migrations/0002_atomic_project_creation.sql` → Run.
   Kolejność ma znaczenie: `0002` zakłada tabele utworzone przez `0001`.
3. **Authentication → Users → Add user** → swój e-mail i hasło, z włączonym
   *Auto Confirm User*. Nie ma publicznej rejestracji: to z założenia narzędzie
   dla jednego właściciela (PRD FR-001).
4. *(opcjonalnie)* **SQL Editor** → `supabase/seed.sql`, po zmianie w środku
   e-maila na konto, które właśnie utworzyłeś. Daje dwie szpule i projekt w
   stanie szkicu.

### 3. Konfiguracja

```bash
cp .env.example .env
```

Uzupełnij `PUBLIC_SUPABASE_URL` i `PUBLIC_SUPABASE_ANON_KEY` z
**Project Settings → API**.

`OPENROUTER_API_KEY` jest opcjonalny. Bez niego ekstrakcja z karty katalogowej
korzysta z wbudowanego parsera deterministycznego — funkcja działa tak czy
inaczej, i jest to świadome: aplikacja nigdy nie zależy twardo od dostępności
modelu.

### 4. Uruchomienie

```bash
npm run dev      # http://localhost:4321
```

---

## Testy

```bash
npm test         # jednostkowe — rejestr ryzyk, bez potrzeby sieci
npm run test:e2e # end-to-end — wymaga zaseedowanego projektu Supabase i E2E_* w .env
```

Suite jednostkowy biegnie przy każdej zmianie; jest szybki i hermetyczny, bo
reguły biznesowe to czyste funkcje bez bazy pod spodem. Suite E2E dowodzi raz, że
całość jest spięta.

Pierwsze uruchomienie E2E wymaga jeszcze przeglądarek:

```bash
npx playwright install chromium
```

---

## Jak działa model magazynu

Dostępna ilość jest **wyliczana, nigdy przechowywana**:

```
dostępne = initial_quantity_g − Σ(szacowane zużycie projektów WYDRUKOWANYCH)
```

Odjęcie jest więc pojedynczą zmianą statusu, a nie drugą mutacją, która mogłaby
rozejść się z pierwszą. Projekty w stanie szkicu świadomie nic nie rezerwują
(PRD FR-006) — dwa szkice mogą deklarować po 600 g z tej samej kilogramowej
szpuli, a wygrywa ten, który zostanie wydrukowany pierwszy. Drugi dostaje odmowę
w momencie druku.

Odmowa następuje dwa razy i jest to celowe: raz w TypeScripcie, żeby komunikat
mógł powiedzieć, *której* szpuli brakuje i ile, a raz wewnątrz
`set_project_status()` w Postgresie, które sprawdza ponownie pod blokadą wiersza
i wykonuje zmianę w jednej transakcji. Instancją rozstrzygającą jest baza;
warstwa TypeScriptu służy wyjaśnieniu.

---

## Układ projektu

```
CLAUDE.md            reguły pracy dla agenta: warstwy, niezmienniki, pułapki
src/lib/domain/      czyste reguły biznesowe — bez I/O, w całości pokryte testami
src/lib/ai/          ekstrakcja przez LLM z deterministycznym fallbackiem
src/lib/server/      klient Supabase, dostęp do env, dostęp do danych
src/middleware.ts    strażnik uwierzytelniania
src/pages/           trasy (Astro) i endpointy API
src/components/      wyspy React: ekstraktor karty katalogowej, builder projektu
supabase/migrations/ schemat, wyliczany widok magazynu, RLS, atomowe RPC statusu
scripts/             zrzuty ekranu
tests/unit/          Vitest — ryzyka R-01 … R-06
tests/e2e/           Playwright — 8-krokowy przepływ pierwszej sesji
context/foundation/  PRD, shape notes, stack, infrastruktura, roadmapa,
                     plan testów, wnioski z pracy
context/deployment/  decyzja i procedura wdrożenia
docs/reference/      powierzchnie kontraktowe — nazwy, od których zależy reszta
docs/screenshots/    zrzuty do zgłoszenia (regeneracja: `npm run screenshots`)
```
