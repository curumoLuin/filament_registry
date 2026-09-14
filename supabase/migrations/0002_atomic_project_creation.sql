-- ============================================================================
-- 0002 — atomowe tworzenie projektu wraz z pozycjami (R-10, finding F2)
--
-- Wcześniej trasa POST /api/projects wykonywała dwa niezależne zapytania:
-- wstawienie projektu, a potem wstawienie jego pozycji. Gdy drugie zawiodło,
-- sprzątała po sobie kompensacja napisana w kodzie aplikacji — czyli kolejne,
-- równie zawodne zapytanie. Wystarczyło, że proces zginął pomiędzy nimi, aby
-- w bazie został projekt bez ani jednej pozycji.
--
-- Ta funkcja przenosi cały zapis do jednej transakcji. Albo powstaje projekt
-- razem ze wszystkimi pozycjami, albo nie powstaje nic. Gwarancja przestaje
-- zależeć od tego, czy kod kompensujący zdążył się wykonać.
--
-- security invoker — tak samo jak set_project_status. Funkcja nie podnosi
-- uprawnień: RLS nadal jest granicą, a wstawienie wiersza z cudzym user_id
-- odrzuci polityka projects_owner_all.
-- ============================================================================

create or replace function public.create_project_with_lines(
  p_name        text,
  p_description text,
  p_lines       jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user_id    uuid := auth.uid();
  v_project_id uuid;
  v_count      integer;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  -- Pusty projekt nie ma sensu ani przy tworzeniu, ani przy druku.
  -- Prefiks NO_LINES jest ten sam, którym posługuje się set_project_status,
  -- więc humanise() po stronie aplikacji zna go już dzisiaj.
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'NO_LINES' using errcode = '23514';
  end if;

  insert into public.projects (user_id, name, description, status)
  values (v_user_id, p_name, nullif(p_description, ''), 'draft')
  returning id into v_project_id;

  insert into public.project_filaments (
    project_id,
    filament_id,
    filament_name_snapshot,
    estimated_usage_g
  )
  select
    v_project_id,
    line.filament_id,
    line.filament_name_snapshot,
    line.estimated_usage_g
  from jsonb_to_recordset(p_lines) as line(
    filament_id            uuid,
    filament_name_snapshot text,
    estimated_usage_g      numeric(10, 3)
  );

  get diagnostics v_count = row_count;

  -- jsonb_to_recordset po cichu daje NULL dla brakującego klucza, więc wiersz
  -- o złym kształcie wpadłby w check-i tabeli. Ta kontrola łapie przypadek,
  -- w którym tablica była niepusta, ale nie przełożyła się na żadną pozycję.
  if v_count = 0 then
    raise exception 'NO_LINES' using errcode = '23514';
  end if;

  return v_project_id;
end;
$$;

grant execute on function public.create_project_with_lines(text, text, jsonb) to authenticated;
