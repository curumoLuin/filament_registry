---
project: "Filament Registry"
doc: roadmap
version: 1
status: active
updated: 2026-09-14
---

# Roadmapa

## Teraz — MVP (dowiezione)

8-krokowy przepływ pierwszej sesji z PRD, od początku do końca.

- [x] Kontrola dostępu e-mail + hasło, jedno konto właściciela, izolacja przez RLS
- [x] CRUD filamentów, w tym ręczne wprowadzanie wartości z kalibracji na stole testowym
- [x] Wklejenie karty katalogowej → ekstrakcja parametrów → przegląd → zapis
- [x] CRUD projektów z deklarowanym zużyciem w gramach per filament
- [x] Bramka dostępności przy tworzeniu projektu i ponownie w momencie druku
- [x] Atomowe odjęcie przy statusie "wydrukowany", dokładne cofnięcie przy powrocie do szkicu
- [x] Bloki parametrów per filament z ostrzeżeniem o konflikcie między filamentami
- [x] Plan testów oparty na ryzykach; suite jednostkowy dla reguł magazynu i parsera
- [x] Playwright pokrywający pełny przepływ z perspektywy użytkownika
- [x] CI przy każdym pushu: testy jednostkowe + build produkcyjny

## Następne — rzeczy świadomie pominięte w MVP

Uporządkowane według *usuniętego tarcia na godzinę pracy*, a nie według tego,
jak ciekawie brzmią.

1. **Katalog producent/materiał (PRD FR-004, nice-to-have).**
   Zaakceptowane ekstrakcje opcjonalnie trafiają do katalogu z kluczem
   producent + typ materiału; dodanie nowej szpuli znanej kombinacji wstępnie
   wypełnia parametry. Buduje się sam w trakcie normalnego użycia — bez
   scrapowania i bez zewnętrznej zależności.
2. **Rozstrzygnięcie otwartego pytania z PRD.** Drugorzędne kryterium sukcesu
   powstało, zanim ustalono wejście wyłącznie przez wklejenie tekstu, i nadal
   odwołuje się do pobierania z URL-a. Trzeba zdecydować, czy drugorzędnym
   wynikiem jest katalog, pobieranie z URL-a, czy coś innego — i przepisać je.
3. **Historia zużycia per szpula.** Aplikacja pokazuje, ile zostało, ale nie
   dokąd poszło. Lista wydrukowanych projektów per filament to małe zapytanie,
   a odpowiada na pytanie "dlaczego ta szpula jest prawie pusta" bez żadnego
   nowego modelu danych.
4. **Wdrożenie publiczne.** Build to już samodzielny serwer Node bez kodu
   zależnego od platformy (patrz `infrastructure.md`); to praca konfiguracyjna,
   nie programistyczna.
5. **Filtrowanie i sortowanie listy projektów.** Świadomie odłożone w FR-010
   jako temat na v2. Zaczyna mieć sens gdzieś powyżej ~50 projektów.

## Później — warte zrobienia, jeszcze nie warte złożoności

- **Zużycie częściowe.** Prawdziwe wydruki padają w połowie. "Wydrukowany" jest
  dziś zero-jedynkowy; zapisywanie zużycia rzeczywistego obok szacowanego
  zbliżyłoby liczby do stanu szpuli, kosztem drugiej ilości w każdej pozycji.
- **Profile wielu drukarek.** Ten sam filament chce innych ustawień na różnych
  maszynach. Non-goal w v1, bo persona ma jedną drukarkę.
- **Kalibracja przez ważenie szpuli.** Wyliczanie pozostałych gramów z
  zmierzonej masy szpuli minus znana masa rdzenia, jako korekta narastającego
  błędu szacunków.

## Non-goals — nadal zamknięte

Te rzeczy zostają poza zakresem, a powody nie zmieniły się od czasu PRD:

- Scrapowane bazy filamentów — niezdefiniowane źródło, nieograniczony problem z
  niezawodnością.
- Rekomendacje AI ze zdjęć modeli albo wydruków — pipeline wizyjny to osobny
  projekt.
- Wielu użytkowników, współdzielenie, przestrzenie zespołowe.
- Raporty, eksporty, dashboardy analityczne.
- Integracja ze slicerem albo parsowanie G-code'u.
- UX zoptymalizowany pod urządzenia mobilne.

## Jak ta lista jest utrzymywana

Pozycje idą w górę, kiedy realna sesja z aplikacją sprawia, że ich brak zaczyna
przeszkadzać — a nie wtedy, gdy brzmią efektownie. Cały sens MVP polegał na
sprawdzeniu, które z nich faktycznie mają znaczenie w użyciu.
