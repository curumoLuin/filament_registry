# Wnioski z pracy nad projektem

> Rejestr powtarzalnych reguł i wzorców, dopisywany wyłącznie na końcu.
> Do przeczytania na starcie researchu, planowania, implementacji i review.

Każdy wpis trafił tutaj, bo kosztował realny czas na tym projekcie. Reguły są
napisane tak, żeby dotyczyły *następnego* wystąpienia problemu, a nie żeby
opisywać konkretny błąd.


## Znormalizuj separatory zakresów zanim wyciągniesz liczby

- **Kontekst**: Parsowanie kart katalogowych producentów, gdzie wartości podawane są jako zakresy — `220-250 °C`, `80 – 90`, `200 to 220`.
- **Problem**: Naiwne `-?\d+` czyta myślnik w `220-250` jako znak minus, daje `[220, -250]` i środek zakresu równy −15. Wartość nie przechodzi potem kontroli wiarygodności, więc pole raportuje się jako nieodczytane. Błąd wygląda więc jak "parser czegoś nie znalazł", a nie jak "parser odwrócił znak".
- **Reguła**: Wyciągając liczby z tekstu pisanego przez człowieka, najpierw zamień separatory zakresu między cyframi na spację, a dopiero potem dopuść wiodący minus tam, gdzie poprzedza go znak inny niż cyfra. Testuj na prawdziwej wartości ujemnej (`-40`) obok prawdziwego zakresu (`220-250`) — poprawienie jednego przypadku w izolacji psuje drugi.
- **Dotyczy**: research, plan, implementacja, impl-review


## Podstawianie zmiennych w czasie builda to nie jest konfiguracja runtime

- **Kontekst**: Astro/Vite wstawia wartości `import.meta.env.PUBLIC_*` do bundle'a na etapie builda.
- **Problem**: Ten sam artefakt wdrożony do kontenera, który podaje konfigurację jako zmienne środowiskowe przy starcie, widzi puste stringi. Lokalnie z plikiem `.env` wszystko działa, więc awaria pojawia się dokładnie w tym środowisku, w którym jest najdroższa.
- **Reguła**: Czytaj konfigurację przez jeden akcesor, który sprawdza zmienne z builda *oraz* `process.env`, i nigdy nie odwołuj się do `import.meta.env.X` poza nim. Weryfikuj uruchamiając zbudowany serwer ze zmiennymi podanymi wyłącznie przy starcie — nie serwerem deweloperskim.
- **Dotyczy**: plan, implementacja, impl-review


## Wyspy renderowane po stronie serwera potrzebują jawnego sygnału gotowości

- **Kontekst**: Astro renderuje wyspy na serwerze, a hydratacja następuje później. Stan Reacta nie istnieje, dopóki hydratacja się nie wykona.
- **Problem**: Dane wpisane przed hydratacją aktualizują DOM, ale nie stan Reacta, a pierwszy render po hydratacji je wyrzuca. Widoczny objaw to kontrolka, która nigdy nie staje się aktywna — co czyta się jako zepsuty komponent, a nie jako wyścig. Narzędzia automatyzujące trafiają na to regularnie, realny użytkownik na wolnym łączu okazjonalnie.
- **Reguła**: Każda wyspa trzymająca stan formularza wystawia informację o tym, kiedy stała się interaktywna (atrybut `data-hydrated`), a wszystko, co steruje nią programowo, czeka na ten sygnał zamiast na timeout. Traktuj "szybko wpisane dane są po cichu gubione" jako realny defekt, a nie artefakt testu.
- **Dotyczy**: plan, implementacja, impl-review


## Adresuj serwer deweloperski tak, jak sam się ogłasza

- **Kontekst**: Runnery testów i health checki odpytujące lokalny serwer deweloperski.
- **Problem**: Astro binduje `localhost`. Na macOS rozwiązuje się to na `::1` przed `127.0.0.1`, więc checker odpytujący `127.0.0.1` dostaje timeout mimo w pełni sprawnego serwera. Błąd wygląda jak problem ze startem serwera i kieruje uwagę na serwer zamiast na adres.
- **Reguła**: Używaj nazwy hosta, którą narzędzie wypisuje, a nie adresu IP, który zakładasz, że jest jej odpowiednikiem. Kiedy serwer "nie startuje", najpierw sprawdź, czy checker i serwer zgadzają się co do rodziny adresów.
- **Dotyczy**: research, implementacja, impl-review


## Runner testów nie dziedziczy niczego z ładowania env przez aplikację

- **Kontekst**: Playwright i Vitest działają jako osobne procesy Node; mechanizm ładowania `.env` z frameworka ich nie obejmuje.
- **Problem**: Brakujące dane logowania podmieniają się na wartości domyślne i suite pada na pierwszej asercji po logowaniu z komunikatem "Invalid email or password" — co wygląda jak błąd uwierzytelniania w aplikacji i kieruje śledztwo do zupełnie niewłaściwej warstwy.
- **Reguła**: Konfiguracja testów ładuje własne środowisko i **zatrzymuje się od razu z czytelnym komunikatem**, gdy brakuje wymaganej wartości. Nigdy nie dawaj danym logowania cichego fallbacku: brak konfiguracji nie może udawać defektu produktu.
- **Dotyczy**: plan, implementacja, impl-review


## Wartości wyliczane zamiast przechowywanych wszędzie tam, gdzie muszą się zgadzać

- **Kontekst**: Ilości w magazynie, które muszą odpowiadać fizycznemu obiektowi.
- **Problem**: Przechowywana kolumna `remaining` wymaga drugiego zapisu, żeby nadążyć za zdarzeniem, które ją zmienia. Każda ścieżka wykonująca jeden zapis bez drugiego zostawia wartość błędną w sposób, którego żaden ekran nie potrafi wyjaśnić ani naprawić.
- **Reguła**: Kiedy ilość jest czystą funkcją zapisanych zdarzeń, wyliczaj ją (widok) zamiast przechowywać. Przechowywane agregaty zostaw na przypadki, w których koszt odczytu został zmierzony i jest nie do przyjęcia — a wtedy potraktuj uzgadnianie danych jako nazwane ryzyko w planie testów.
- **Dotyczy**: framing, plan, implementacja


## `$$` w stringu zastępującym w JavaScripcie to escape, a nie dwa dolary

- **Kontekst**: Generowanie SQL-a (albo dowolnego tekstu zawierającego `$`) przez `String.prototype.replace`.
- **Problem**: `replace(a, "end $$;")` daje `end $;`, bo `$$` oznacza pojedynczy literalny `$`. W plpgsql po cichu psuje to dollar-quoting, a baza zgłasza "unterminated dollar-quoted string" — błąd opisujący objaw i całkowicie ukrywający przyczynę.
- **Reguła**: Używaj *funkcji* zastępującej (`replace(a, () => text)`) zawsze, gdy zastąpienie jest danymi, a nie wzorcem. Weryfikuj wygenerowany SQL licząc ograniczniki przed wykonaniem.
- **Dotyczy**: implementacja, impl-review
