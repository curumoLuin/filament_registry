---
change_id: atomic-project-creation
title: Atomowe tworzenie projektu wraz z pozycjami
status: implementing
created: 2026-09-14
updated: 2026-09-14
archived_at: null
---

## Notes

Źródło: finding **F2** z przeglądu implementacji (`/10x-impl-review`, wymiar
Safety & Quality, severity WARNING, impact MEDIUM).

Tworzenie projektu to dziś dwa niezależne zapytania plus kompensacja w kodzie
aplikacji. `set_project_status` — czyli druga strona tego samego cyklu życia —
jest już atomowe i siedzi w plpgsql. Ta zmiana wyrównuje obie strony.

Powiązane: FR-009, FR-013, FR-014 w `context/foundation/prd.md`.

## Stan

Wszystkie kroki automatyczne wykonane. Pozostają dwa kroki ręczne po stronie
właściciela projektu: wykonanie migracji `0002` w edytorze SQL Supabase (1.2)
i potwierdzenie przez interfejs, że tworzenie projektu działa bez regresji
(2.3). Do czasu wykonania 1.2 trasa `POST /api/projects` woła funkcję, której
w bazie jeszcze nie ma.
