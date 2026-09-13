---
project: "Filament Registry"
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 1
  hard_deadline: "2026-07-05"
  after_hours_only: true
created: 2026-05-18
updated: 2026-09-14
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "tarcie w przepływie pracy + dane uwięzione w kartach katalogowych + brakująca funkcja + paraliż decyzyjny; dodatkowo tanie filamenty nie mają profili RFID (w przeciwieństwie do markowych), więc ręczna konfiguracja jest nieunikniona"
    - topic: "persona scope"
      decision: "hobbysta druku 3D pracujący sam — jeden nazwany użytkownik; MVP to narzędzie osobiste, uwierzytelnianie istnieje dla kontroli dostępu, a nie dla współdzielenia"
    - topic: "core insight"
      decision: "parsowanie kart katalogowych przez AI usuwa krok o największym tarciu; narzędzia slicerów są zamknięte w ekosystemach; magazyn ponad producentami + śledzenie projektów + automatyczne odejmowanie to nowa wartość. Na przyszłość: automatyczne rekomendacje ze zdjęcia (odłożone)"
  frs_drafted: 15
  quality_check_status: accepted
---

## Wizja i problem

Hobbysta druku 3D zarządzający wieloma szpulami filamentu od różnych producentów
nie ma zintegrowanego narzędzia łączącego śledzenie magazynu z zarządzaniem
parametrami druku. Parametry są zakopane w kartach katalogowych producentów
(PDF-y, strony WWW); tańsze zamienniki nie mają profili RFID jak szpule markowe
(np. Bambu), więc każda nowa szpula wymaga ręcznego ustawienia. Własne parametry
odkryte na stole testowym (ustawienia prasowania, konkretne kalibracje przepływu)
nie mają gdzie mieszkać.

Kluczowa obserwacja: parsowanie kart katalogowych przez AI usuwa pojedynczy krok
o największym tarciu w całym przepływie — ręczne wyszukanie i wpisanie parametrów.
Rozwiązania producentów slicerów (PrusaSlicer, Bambu Studio, Cura) są zamknięte w
swoich ekosystemach; nie istnieje narzędzie do magazynu filamentu działające ponad
producentami. Nową wartością jest połączenie zarządzania magazynem, śledzenia
projektów, automatycznego odejmowania stanu i ekstrakcji parametrów wspieranej
przez AI. Ścieżka na przyszłość: rekomendacje filamentu ze zdjęcia (odłożone poza
MVP).

## Użytkownik i persona

### Persona główna

Hobbysta druku 3D pracujący sam, zarządzający wieloma szpulami filamentu od
różnych producentów i prowadzący wiele projektów druku. Sięga po aplikację,
zaczynając nowy projekt — musi wiedzieć, czy dostępny filament wystarczy na
planowane zużycie i jakie są poprawne parametry druku dla wybranej szpuli
(włącznie z własnymi wartościami znalezionymi na stole testowym, a nie tylko
domyślnymi producenta).

W MVP jeden nazwany użytkownik. Uwierzytelnianie istnieje dla kontroli dostępu, a
nie po to, żeby dzielić się z innymi. Scenariusze wieloosobowe i wielodrukarkowe
są jawnie odłożone.

## Kontrola dostępu

Logowanie e-mailem i hasłem. Jedno konto właściciela; wszystkie dane należą do
tego konta. Model płaski — w MVP bez ról admin / gość / obserwator. Najmniejszy
model dostępu, przy którym aplikacja jest użyteczna: jedna osoba, jedna tożsamość,
pełny dostęp do własnych danych.

Bez rozdziału ról. Scenariusze wieloosobowe są non-goalem dla v1.

## Kryteria sukcesu

### Główne

8-krokowy przepływ pierwszej sesji przechodzi od początku do końca bez błędów:

1. Użytkownik loguje się (e-mail + hasło)
2. Użytkownik dodaje filament, wklejając tekst karty katalogowej producenta; AI
   wyciąga ustrukturyzowane parametry druku (temperatura dyszy, temperatura stołu,
   prędkość, przepływ)
3. Użytkownik przegląda i akceptuje wyciągnięte parametry; filament trafia do
   magazynu w zadeklarowanej ilości
4. Użytkownik tworzy projekt, wybiera filament i deklaruje szacowane zużycie w
   gramach
5. System waliduje: szacowane zużycie ≤ dostępna ilość (widoczne przed
   utworzeniem projektu)
6. Użytkownik ogląda zagregowane parametry druku dla projektu
7. Użytkownik oznacza projekt jako wydrukowany
8. Stan magazynu zostaje pomniejszony o zadeklarowaną ilość, a nowa wartość jest
   widoczna na liście filamentów

Ten dokładnie przepływ weryfikuje test E2E w Playwrighcie.

### Drugorzędne

Parser AI przyjmuje również wklejony tekst karty katalogowej (nie tylko URL),
dając ścieżkę awaryjną dla kart, których nie da się pobrać po adresie.

### Gwarancje

- Odjęcie z magazynu jest dokładne: kiedy projekt zostaje oznaczony jako
  wydrukowany, odjęta ilość równa się zadeklarowanemu zużyciu. Bez cichego
  zaokrąglania i bez błędów w wyliczeniu.
- Parametry wyciągnięte przez AI są zawsze pokazywane do przeglądu i
  potwierdzenia przed zapisaniem czegokolwiek. Ostatnie słowo należy do
  użytkownika.
- Uwierzytelnianie nie dopuszcza trywialnie odgadywalnych ścieżek; hasła nie są
  przechowywane otwartym tekstem.

## Historyjki użytkownika

### US-01: Hobbysta przechodzi pełny przepływ pierwszej sesji

- **Zakładając**, że zalogowany użytkownik ma pusty magazyn
- **Kiedy** wkleja tekst karty katalogowej Prusament PLA, przegląda wyciągnięte
  przez AI parametry, akceptuje je, tworzy projekt z szacowanym zużyciem 200 g,
  ogląda zagregowane parametry i oznacza projekt jako wydrukowany
- **Wtedy** filament pojawia się w magazynie z ilością początkową pomniejszoną o
  200 g, a zagregowane parametry były widoczne przed zmianą statusu

#### Kryteria akceptacji

- Ekstrakcja AI zwraca co najmniej: temperaturę dyszy, temperaturę stołu,
  prędkość druku i przepływ
- Stan magazynu przed utworzeniem projektu jest widoczny dla użytkownika w
  trakcie konfiguracji projektu
- Walidacja uniemożliwia utworzenie projektu, jeśli szacowane zużycie przekracza
  dostępną ilość
- Pomniejszenie stanu po oznaczeniu "wydrukowany" równa się dokładnie
  zadeklarowanemu szacowanemu zużyciu

## Wymagania funkcjonalne

### Uwierzytelnianie

- FR-001: Użytkownik może zalogować się e-mailem i hasłem. Priorytet: must-have
  > Sokrates: Konto jest zakładane wcześniej przez migrację/skrypt; w MVP brak UI
  > rejestracji. Skrypt seedujący jest częścią udokumentowanego setupu — dla
  > narzędzia jednoosobowego akceptowalne.

### Zarządzanie filamentem

- FR-002: Użytkownik może dodać filament ręcznie, podając nazwę, producenta,
  kolor, typ materiału, ilość początkową w gramach oraz parametry druku
  (temperatura dyszy, temperatura stołu, prędkość, przepływ, chłodzenie).
  Priorytet: must-have
  > Sokrates: Rozważono kontrargument "ręczne wprowadzanie to martwy kod, jeśli AI
  > zawsze działa". Rozstrzygnięcie: zostaje jako must-have — wartości z kalibracji
  > na stole testowym i tańsze zamienniki bez RFID wymagają wprowadzenia ręcznego.

- FR-003: Użytkownik może dodać filament, wklejając surowy tekst (kopia karty
  katalogowej, zawartość strony producenta albo dowolny tekst zawierający parametry
  druku); aplikacja automatycznie wyciąga ustrukturyzowane parametry.
  Priorytet: must-have
  > Sokrates: Usunięto pierwotne pobieranie po URL-u dla każdej szpuli — strony
  > renderowane JS-em i limity CDN-ów czynią je niepewnym w tym zastosowaniu.
  > Wklejanie pokrywa wszystkie źródła tekstu bez zależności od sieci. Katalog
  > producentów po URL-u to osobny temat na przyszłość (patrz blok Forward).

- FR-004: Aplikacja może opcjonalnie zapisywać zaakceptowane parametry wyciągnięte
  przez AI do katalogu producent/materiał; przy dodawaniu nowego filamentu, jeśli
  producent i typ materiału pasują do wpisu w katalogu, aplikacja uzupełnia
  brakujące parametry. Priorytet: nice-to-have
  > Sokrates: Wejście ze zdjęcia odłożone — ta sama złożoność pipeline'u wizyjnego
  > co pierwotnie odrzucona funkcja "AI ze zdjęcia". Katalog buduje się sam w
  > czasie z zaakceptowanych ekstrakcji: bez scrapowania i bez zewnętrznej
  > zależności.

- FR-005: Użytkownik może przejrzeć parametry wyciągnięte przez AI, mając
  domyślnie dostępne "Akceptuj wszystko" jednym kliknięciem; edycja pojedynczych
  pól jest dostępna jako furtka. Priorytet: must-have
  > Sokrates: Akceptacja całości to ścieżka szybka; obowiązkowy ekran przeglądu
  > istnieje, ale nie wymusza potwierdzania każdego pola z osobna.

- FR-006: Użytkownik może zobaczyć listę magazynu z dostępną ilością, zdefiniowaną
  jako całkowita ilość początkowa minus ilości odjęte przez projekty wydrukowane.
  Projekty w stanie szkicu nie rezerwują ilości z góry. Priorytet: must-have
  > Sokrates: Wybrano model "szkic nie rezerwuje" — prostszy i spójny z podejściem
  > "pierwszy drukuje, ten wygrywa". Dostępne = całość minus odjęcia projektów
  > wydrukowanych.

- FR-007: Użytkownik może edytować dane i parametry istniejącego filamentu; jeśli
  zmieniona ilość unieważniłaby szacowane zużycie któregokolwiek projektu w stanie
  szkicu, aplikacja ostrzega, ale nie blokuje edycji. Priorytet: must-have
  > Sokrates: Miękkie ostrzeżenie zachowuje władzę użytkownika nad własnymi danymi.
  > Twarda blokada tworzyłaby tarcie w osobistym narzędziu jednoosobowym.

- FR-008: Użytkownik może usunąć filament z magazynu; projekty, które się do niego
  odwoływały, pokazują w miejscu nazwy "filament usunięty". Priorytet: must-have
  > Sokrates: Miękka referencja zamiast twardej blokady. Użytkownik może poprawić
  > dotknięte projekty. Usuwanie filamentów, do których istnieją odwołania, jest
  > dozwolone.

### Zarządzanie projektami

- FR-009: Użytkownik może utworzyć projekt, wybierając filamenty z magazynu i
  podając szacowane zużycie w gramach dla każdego; aplikacja odrzuca utworzenie,
  jeśli zużycie któregokolwiek filamentu przekracza jego dostępną ilość.
  Priorytet: must-have
  > Sokrates: Pierwszy drukuje, ten wygrywa — wiele projektów w stanie szkicu może
  > deklarować zużycie tej samej szpuli bez rezerwacji między projektami. Bramka
  > przy oznaczaniu jako wydrukowany wyłapuje konflikty w momencie wykonania.

- FR-010: Użytkownik może zobaczyć wszystkie projekty i ich bieżący status na
  płaskiej liście. Priorytet: must-have
  > Sokrates: W MVP bez filtrowania po statusie i bez paginacji — użytkownik
  > jednoosobowy z kilkudziesięcioma projektami, płaska lista od najnowszych
  > wystarcza. Filtrowanie to v2.

- FR-011: Użytkownik może zmienić status projektu ze szkicu na wydrukowany; to
  wyzwala odjęcie z magazynu. Priorytet: must-have

- FR-012: Użytkownik może zmienić status projektu z wydrukowanego z powrotem na
  szkic; odjęcie zostaje automatycznie cofnięte. Priorytet: must-have
  > Sokrates: Cofanie jest wspierane — zapobiega uszkodzeniu danych przez
  > przypadkowe kliknięcie, bez osobnego mechanizmu undo. Oba kierunki to jawne
  > przejścia statusu.

### Magazyn i walidacja

- FR-013: Aplikacja waliduje zarówno przy tworzeniu projektu, jak i w momencie
  oznaczania go jako wydrukowany, że zużycie żadnego filamentu nie przekracza jego
  dostępnej ilości; operacja jest odrzucana, jeśli walidacja nie przejdzie w
  którymkolwiek z tych punktów. Priorytet: must-have
  > Sokrates: Podwójna bramka zapobiega cichemu nadmiernemu zużyciu spowodowanemu
  > wydrukowaniem innego projektu między utworzeniem a bieżącym drukiem.

- FR-014: Kiedy projekt zostaje oznaczony jako wydrukowany, aplikacja odejmuje
  wszystkie zadeklarowane zużycia w jednej atomowej transakcji; jeśli
  któregokolwiek filamentu nie da się odjąć (np. został usunięty po utworzeniu
  projektu), cała zmiana statusu pada i żadne częściowe odjęcie nie zostaje
  zastosowane. Priorytet: must-have
  > Sokrates: Transakcja wszystko-albo-nic; częściowe odjęcia tworzą niejednoznaczny
  > stan magazynu. Spójne z miękkim usuwaniem z FR-008.

### Widok parametrów

- FR-015: Użytkownik może zobaczyć parametry druku wszystkich filamentów w
  projekcie jako bloki per filament; parametry sprzeczne między filamentami (np.
  różne temperatury dyszy) są wyróżnione ostrzeżeniem o konflikcie.
  Priorytet: must-have
  > Sokrates: Bloki per filament z ostrzeżeniem dają użytkownikowi kontekst do
  > decyzji; płaskie scalenie gubi tożsamość poszczególnych filamentów, a ta ma
  > znaczenie, gdy wydruk wielomateriałowy wymaga różnych ustawień dla różnych
  > części.

## Logika biznesowa

Aplikacja zamienia nieustrukturyzowaną specyfikację filamentu w ustrukturyzowane
parametry druku, a następnie egzekwuje, że projekt druku może zostać wykonany
tylko wtedy, gdy zadeklarowane zużycie materiału jest pokryte przez dostępny
magazyn.

Reguła przyjmuje dwa rodzaje wejścia: (1) surowy tekst — kopię karty katalogowej,
zawartość strony producenta albo dowolny wklejony tekst zawierający parametry
druku dla materiału; oraz (2) deklaracje projektu — wybór filamentów i szacowane
zużycie w gramach dla każdego z nich.

Wynikiem reguły ekstrakcji jest zestaw ustrukturyzowanych parametrów druku
(temperatura dyszy, temperatura stołu, prędkość, przepływ, chłodzenie) przypisany
do rekordu filamentu — pokazany do przeglądu i zaakceptowany przed zapisem.
Wynikiem reguły cyklu życia magazynu jest zmiana ilości: kiedy projekt przechodzi
w stan wydrukowany, dostępna ilość każdego powiązanego filamentu zmniejsza się o
zadeklarowane zużycie, atomowo. Odjęcie jest odwracalne przy powrocie do szkicu.

Użytkownik spotyka obie reguły w tym samym momencie — przy dodawaniu filamentu z
karty katalogowej (ekstrakcja) i przy przenoszeniu projektu z planowania do
wykonania (walidacja + odjęcie). Razem odróżniają aplikację od arkusza
kalkulacyjnego: ekstrakcja usuwa krok ręcznego wyszukiwania, a bramka cyklu życia
usuwa liczenie w pamięci, ile jeszcze zostało.

## Wymagania niefunkcjonalne

- Każda operacja trwająca dłużej niż dwie sekundy pokazuje ciągłą, widoczną
  informację zwrotną; użytkownik nigdy nie widzi zamrożonego ekranu w trakcie
  wywołania ekstrakcji AI.
- Tekst przesłany do ekstrakcji nie zostawia śladu w pamięci kontrolowanej przez
  aplikację po zakończeniu żądania; jest używany do jednego wywołania i odrzucany.
- Aplikacja jest w pełni używalna na dwóch ostatnich głównych wersjach Chrome,
  Firefoksa i Edge'a na desktopie, bez instalacji.
- Wszystkie zmiany ilości są atomowe; nieudana transakcja zostawia magazyn w
  stanie sprzed transakcji, bez częściowych odjęć.

## Non-goals

- **Brak internetowej bazy filamentów przez scrapowanie.** Bazy społecznościowe
  albo producenckie budowane scrapowaniem są poza zakresem — źródło niezdefiniowane,
  niezawodność to osobny, duży problem.
- **Brak rekomendacji AI ze zdjęć modelu albo wydruku.** Pipeline wizyjny jest
  odłożony — ta sama złożoność co pierwotnie odrzucona funkcja "AI ze zdjęcia".
- **Brak wsparcia dla wielu użytkowników i wielu drukarek.** Każde wdrożenie jest
  jednoosobowe. Bez współdzielenia, przestrzeni zespołowych i profili drukarek.
- **Brak raportów zużycia i eksportów.** Bez eksportu PDF/CSV, bez wykresów
  historii, bez dashboardu analitycznego. Surowe dane są w bazie; raportowanie jest
  poza zakresem v1.
- **Brak integracji ze slicerem i parsowania G-code'u.** Aplikacja nie czyta plików
  slicera ani do nich nie pisze. Parametry przepisuje się ręcznie.
- **Brak gwarancji UX mobilnego.** Aplikacja celuje w przeglądarki desktopowe. Może
  działać na urządzeniach mobilnych, ale w v1 nie jest pod nie projektowana,
  optymalizowana ani testowana.

## Forward: tech-stack

*Nie jest częścią PRD. Zapisane dla późniejszego kroku wyboru stacku.*

> **Uwaga (2026-09): ten szkic został zastąpiony.** Poniższa lista to wstępna
> intuicja z fazy shapingu, oparta na stacku, który autor zna z pracy zawodowej.
> Faktycznie wybrany stack — Astro + React + Supabase — oraz uzasadnienie każdej
> decyzji znajdują się w `context/foundation/tech-stack.md`. Blok zostaje jako
> zapis tego, co rozważano na wejściu.

- Język: C# (.NET) — wszystkie warstwy
- UI: Blazor WebAssembly + PWA
- Backend: ASP.NET Core Minimal API (.NET 9)
- ORM: Entity Framework Core 9
- Baza danych: SQLite (lokalnie i na produkcji)
- Uwierzytelnianie: ASP.NET Core Identity
- AI: Microsoft.Extensions.AI + SDK Anthropic albo OpenAI (dostawca do ustalenia)
- Testy: xUnit + bUnit (komponenty) + Playwright (E2E)
- CI/CD: GitHub Actions
- Hosting: Render.com albo Azure App Service (plan darmowy)

## Forward: technical-roadmap

*Nie jest częścią PRD. Funkcje odłożone do rozważenia po MVP.*

- Katalog parametrów producent/materiał z uzupełnianiem po URL-u (parametry
  ogólne per producent + typ materiału, nie per kolor)
- Wejście ze zdjęcia/zrzutu etykiety pudełka (pipeline wizyjny)
- Rekomendacje AI ze zdjęć modelu albo wydruku
- Wsparcie dla wielu użytkowników i wielu drukarek
- Raporty zużycia i eksport (PDF/CSV, wykresy historii)
- Integracja ze slicerem (parsowanie G-code'u)
- Integracja ze sprzętem odczytującym RFID
- Społecznościowa internetowa baza filamentów
