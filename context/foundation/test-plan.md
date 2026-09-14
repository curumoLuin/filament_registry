---
project: "Filament Registry"
doc: test-plan
version: 1
status: active
updated: 2026-09-14
---

# Plan testów

## Po co ten dokument

Nazywa ryzyka, które realnie mogą zaszkodzić użytkownikowi Filament Registry,
porządkuje je i wskazuje, który test automatyczny każde z nich zamyka. Testy
istnieją, bo istnieje ryzyko z tej listy — test, który nie odwzorowuje żadnego
z nich, nie powstaje.

## Co znaczy tutaj "zaszkodzić użytkownikowi"

Aplikacja ma jedno zadanie: poprawnie odpowiadać na dwa pytania. *Czy mam dość
filamentu na ten wydruk?* i *jakich ustawień użyć?* Każde ryzyko poniżej to
sposób na udzielenie błędnej odpowiedzi na jedno z nich. Defekty kosmetyczne i
wygodowe są świadomie poza zakresem pokrycia automatycznego w MVP.

## Rejestr ryzyk

| ID | Ryzyko | Źródło | Dlaczego boli | Prawdopodobieństwo | Wpływ | Priorytet |
| --- | --- | --- | --- | --- | --- | --- |
| R-01 | Odjęcie z magazynu jest niedokładne albo rozjeżdża się przy wielokrotnym przełączaniu Szkic↔Wydrukowany | Gwarancja z PRD: "odjęcie jest dokładne… bez cichego zaokrąglania" | Liczba pozostałych gramów po cichu przestaje odpowiadać fizycznej szpuli. Użytkownik zaczyna wydruk na 300 g na szpuli, o której aplikacja twierdzi, że ma 400 g. To jest ta awaria, przed którą cała aplikacja ma chronić. | Średnie | Krytyczny | **P0** |
| R-02 | Projekt zostaje oznaczony jako wydrukowany, mimo że jeden z filamentów jest przekroczony | PRD FR-013 (podwójna bramka) + nota sokratejska do FR-009 o zasadzie "pierwszy drukuje, ten wygrywa" | Zapisane zostaje nadmierne zużycie, magazyn schodzi poniżej zera albo się rozjeżdża, a wartość "dostępne" przestaje być wiarygodna dla któregokolwiek innego projektu. | Wysokie | Krytyczny | **P0** |
| R-03 | Zmiana statusu projektu wielofilamentowego wykonuje się częściowo — część pozycji odjęta, jedna pada | PRD FR-014 (transakcja wszystko-albo-nic) | Magazyn ląduje w niejednoznacznym stanie pośrednim, którego żaden ekran w aplikacji nie potrafi wyjaśnić ani naprawić. | Średnie | Krytyczny | **P0** |
| R-04 | Projekty w stanie szkicu po cichu rezerwują ilość (albo nie zwalniają jej) | PRD FR-006 (szkice nie rezerwują z góry) | Dostępna ilość pokazuje mniej, niż jest w rzeczywistości; użytkownik jest blokowany przed wydrukami, które faktycznie może wykonać. | Średnie | Wysoki | **P1** |
| R-05 | Parser karty katalogowej zwraca niewiarygodną wartość, która trafia do zapisanego filamentu | Gwarancja z PRD: wynik AI jest zatwierdzany przed zapisem; shape-notes o szpulach bez RFID | Temperatura dyszy 21 °C albo 2100 °C zostaje zapisana przy szpuli i później przepisana do slicera. W najlepszym razie zmarnowany wydruk. | Średnie | Wysoki | **P1** |
| R-06 | Sprzeczne parametry w projekcie wielofilamentowym są prezentowane tak, jakby były zgodne | PRD FR-015 (bloki per filament, ostrzeżenie o konflikcie) | Użytkownik wybiera jedną temperaturę do wydruku z dwóch materiałów i go psuje. | Średnie | Średni | **P2** |
| R-07 | Użytkownik może odczytać albo zmienić filamenty i projekty innego konta | Sekcja kontroli dostępu: jeden właściciel, wszystkie dane należą do tego konta | Wyciek danych między kontami. | Niskie | Wysoki | **P1** |
| R-08 | Sesja zostaje utracona albo nieuwierzytelnione żądania docierają do tras z danymi | PRD FR-001; pytanie o nadużycie — co się stanie, jeśli nikt się nie zaloguje? | Anonimowy dostęp do rejestru. | Niskie | Wysoki | **P1** |
| R-09 | Parametr `redirectTo` na ekranie logowania wyprowadza użytkownika na obcą domenę po udanym uwierzytelnieniu | Przegląd implementacji (`/10x-impl-review`, wymiar Safety & Quality) | Ofiara ląduje na stronie atakującego dokładnie w chwili, w której właśnie zaufała ekranowi logowania — to najlepszy możliwy moment na phishing. Sprawdzenie `startsWith('/')` przepuszcza `//evil.example`, bo przeglądarka czyta to jako adres protokołowo-względny. | Niskie | Wysoki | **P1** |

## Mapa pokrycia

| Ryzyko | Test | Lokalizacja | Rodzaj |
| --- | --- | --- | --- |
| R-01 | `deducts exactly the declared usage`, `survives repeated printed/draft toggles without drift`, `handles fractional grams without floating-point drift` | `tests/unit/inventory.test.ts` | jednostkowy |
| R-02 | `rejects marking printed when usage exceeds availability`, `re-validates at print time after another project consumed the spool` | `tests/unit/inventory.test.ts` | jednostkowy |
| R-03 | `applies no deduction at all when one line of a multi-filament project fails` | `tests/unit/inventory.test.ts` | jednostkowy |
| R-04 | `draft projects do not reserve quantity` | `tests/unit/inventory.test.ts` | jednostkowy |
| R-05 | `rejects implausible values instead of saving them` | `tests/unit/parameters.test.ts` | jednostkowy |
| R-06 | `flags parameters that disagree across filaments` | `tests/unit/parameters.test.ts` | jednostkowy |
| R-07 | Polityki row-level security w Postgresie zawężone do `auth.uid()` | `supabase/migrations/0001_init.sql` | polityka bazy |
| R-08 | `redirects an anonymous visitor to the login page`, pełny 8-krokowy przepływ pierwszej sesji | `tests/e2e/first-session.spec.ts` | end-to-end |
| R-09 | `odrzuca adres protokołowo-względny`, `odrzuca wariant z odwrotnym ukośnikiem`, `odrzuca znaki sterujące…` | `tests/unit/safe-redirect.test.ts` | jednostkowy |

## Poziomy testów i uzasadnienie

- **Jednostkowe (Vitest)** — niosą ryzyka P0. Reguły magazynu są czystymi
  funkcjami właśnie po to, żeby R-01 do R-04 dało się przetestować wyczerpująco,
  szybko i bez bazy ani sieci. To ten suite biegnie przy każdej zmianie.
- **End-to-end (Playwright)** — jeden scenariusz: 8-krokowy przepływ pierwszej
  sesji z kryteriów sukcesu PRD, plus strażnik dostępu anonimowego. Dowodzi, że
  elementy są spięte; nie tu pokrywa się przypadki brzegowe.
- **Polityka bazy** — R-07 jest egzekwowane przez RLS, a nie przez kod
  aplikacji, więc kontrolą jest definicja polityki. Zweryfikowane ręcznie na
  drugim koncie.

## Bramki jakości

Punkty kontrolne, przez które zmiana przechodzi, zanim uznamy ją za gotową.
Istnieją, bo agent produkuje wiarygodnie wyglądający kod szybciej, niż człowiek
zdąży go przeczytać — moment oceny musi więc być strukturalny, a nie zależny od
tego, czy ktoś pamiętał.

| Bramka | Co uruchamia | Co blokuje | Dlaczego warta tych sekund |
| --- | --- | --- | --- |
| **G1 · Testy jednostkowe** | `npm test` | każdy commit | Niosą wszystkie ryzyka P0. Hermetyczne i poniżej sekundy, więc nie ma wymówki, żeby je pominąć. |
| **G2 · Typy + build** | `npm run typecheck`, `npm run build` | każdy commit | Warstwa domenowa koduje kody naruszeń i klucze parametrów jako unie; nieobsłużony przypadek jest błędem kompilacji, a nie niespodzianką w runtime. |
| **G3 · Przegląd rejestru ryzyk** | człowiek | zmiany w arytmetyce magazynu, przejściach statusu albo parserze | Jeśli zmieniło się zachowanie objęte nazwanym ryzykiem, rejestr jest nieaktualny do czasu poprawki. Inaczej kod i plan testów cicho się rozjeżdżają. |
| **G4 · Przepływ end-to-end** | `npm run test:e2e` | zmiany dotykające przepływu użytkownika | Dowodzi, że elementy nadal są spięte. Wymaga zaseedowanego projektu, więc jest bramką lokalną, nie CI-ową. |
| **G5 · CI** | GitHub Actions: instalacja, testy, build | merge do `main` | G1 i G2 ponownie, na czystej maszynie, żeby "u mnie działa" nie trafiło na gałąź. |

G1, G2 i G5 są zautomatyzowane. G3 to ocena człowieka i świadomie nią zostaje:
żadne narzędzie nie powie ci, że reguła, którą właśnie zmieniłeś, unieważniła
powód istnienia jakiegoś testu.

## Jak praca z agentem zmienia obraz jakości

Agent pisze wiarygodny kod testów szybciej, niż ktokolwiek zdąży go przeczytać,
co przesuwa miejsce, w którym mieszka ryzyko. Trzy konkretne efekty i reakcja na
każdy z nich.

**Testy dryfują do najłatwiejszego pliku.** Poproszony o "dodanie testów" agent
znajduje najbardziej podatne funkcje i pokrywa właśnie je. Coverage rośnie, a
krytyczny przepływ zostaje bez ochrony. *Przeciwdziałanie:* punktem wejścia jest
rejestr ryzyk, a test nieodwzorowujący żadnego numerowanego ryzyka nie powstaje.
Mapa pokrycia powyżej jest tego kontrolą.

**Testy odbijają implementację.** Najgroźniejsza awaria generowanych testów to
test asercjonujący to, co kod aktualnie robi — przechodzi więc zawsze wtedy, gdy
kod jest błędny w ten sam sposób. *Przeciwdziałanie:* ryzyka w tym dokumencie
opisują zachowanie odczuwalne dla użytkownika ("aplikacja twierdzi, że na szpuli
jest 400 g, a jest 100 g"), nigdy wnętrze ("`markPrinted` zwraca ok"), więc
asercja ma wyrocznię ponad kodem. Cookbook powtarza to jako regułę 5.

**Wiarygodny kod wyprzedza review.** *Przeciwdziałanie:* bramki jakości powyżej
są mechaniczne, a nie zależne od pamięci, a granica czystych funkcji sprawia, że
reguły, które mają znaczenie, da się zweryfikować wyczerpująco w milisekundach,
zamiast oglądać je w diffie.

Gdzie agent realnie podnosi tu jakość: wyczerpywanie przypadków brzegowych wokół
znanego ryzyka (gramy ułamkowe, zużycie dokładnie na granicy, pięćdziesiąt cykli
przełączeń) jest żmudne dla człowieka i tanie dla agenta — pod warunkiem że
człowiek zdecydował wcześniej, *które* ryzyko na to zasługuje.

## Świadomie poza pokryciem automatycznym (MVP)

- Regresja wizualna i układ responsywny — PRD deklaruje wyłącznie desktop i nie
  ustala żadnego kontraktu wizualnego.
- Sama ścieżka ekstrakcji przez LLM. Jest niedeterministyczna i opcjonalna, a
  aplikacja schodzi do parsera deterministycznego — i to *ten* parser jest
  przetestowany. Realną kontrolą przed złą ekstrakcją jest ekran przeglądu przed
  zapisem (FR-005), nie test.
- Wydajność i obciążenie. Jeden użytkownik, kilkadziesiąt rekordów.

## Cookbook — jak dopisać tu test

Spisany po to, żeby następny test nie zaczynał się od pustego pliku i nie
dryfował w inną stylistykę.

**1. Zacznij od ryzyka, nie od pliku.** Jeśli nie umiesz nazwać ryzyka, które
test zamyka, najpierw dopisz ryzyko do rejestru — albo przyjmij, że test nie
jest wart pisania. Ryzyka opisują, co poczuje użytkownik ("aplikacja twierdzi,
że na szpuli jest 400 g, a jest 100 g"), nigdy co robi kod ("`markPrinted`
zwraca ok").

**2. Wybierz najtańszy poziom, który to złapie.**
Arytmetyka, walidacja, parsowanie, wykrywanie konfliktów → jednostkowy, na
czystych modułach z `src/lib/domain/`. Spięcie całości, routing, sesja,
przekierowania → end-to-end. Izolacja kont → polityka bazy, weryfikowana ręcznie
na drugim koncie; nie ma tam kodu aplikacji do przetestowania jednostkowo.

**3. Nazwij test po zachowaniu.** `deducts exactly the declared usage`, a nie
`test markPrinted 2`. Nazwa to jedyne, co zobaczy przyszły czytelnik, gdy test
padnie.

**4. Grupuj po ryzyku.** `describe('R-01 · deduction is exact', ...)`. Powiązanie
rejestru z suite'em musi przetrwać czyjąś reorganizację pliku.

**5. Asercjonuj obserwowalny wynik.** `availableQuantityG(...)` równa się 800 —
a nie to, że wewnętrzny licznik został zwiększony. Test odbijający implementację
przechodzi wtedy, gdy implementacja jest błędna w ten sam sposób, co jest gorsze
niż brak testu.

**6. Zaktualizuj mapę pokrycia** w tej samej zmianie i dopisz wiersz ryzyka,
jeśli jest nowe.

**Przykład — R-01, rozjazd przy wielokrotnym przełączaniu.** Ryzyko polega na
tym, że liczba pozostałych gramów przestaje odpowiadać fizycznej szpuli.
Najtańszy poziom to test jednostkowy na czystych funkcjach. Zachowanie brzmi
"pięćdziesiąt przełączeń wydrukowany/szkic zostawia szpulę dokładnie tam, gdzie
była", więc test wykonuje w pętli prawdziwe funkcje przejścia i na końcu
asercjonuje `deductedQuantityG === 0`. Używa `123.456`, a nie okrągłej liczby,
właśnie dlatego, że tropioną awarią jest rozjazd IEEE-754.

## Kryteria wyjścia

`npm test` na zielono, `npm run test:e2e` na zielono względem zaseedowanego
projektu Supabase oraz jednokrotne ręczne przejście 8-krokowego przepływu przed
zgłoszeniem.
