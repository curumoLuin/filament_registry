---
change_id: atomic-project-creation
title: Atomowe tworzenie projektu wraz z pozycjami
status: impl_reviewed
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

Przegląd implementacji wykonany — raport w `reviews/impl-review.md`. Siedem
znalezisk naprawionych w tej gałęzi, dwa świadomie odłożone.

Wszystkie kroki wykonane — automatyczne i ręczne. Migracja `0002` wykonana na
instancji docelowej i zweryfikowana pod rolą `authenticated` (1.2), projekt
dwufilamentowy utworzony przez interfejs bez regresji (2.3).
