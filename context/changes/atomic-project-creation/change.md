---
change_id: atomic-project-creation
title: Atomowe tworzenie projektu wraz z pozycjami
status: planned
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
