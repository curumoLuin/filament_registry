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
    f.id,
    line.filament_name_snapshot,
    line.estimated_usage_g
  from jsonb_to_recordset(p_lines) as line(
    filament_id            uuid,
    filament_name_snapshot text,
    estimated_usage_g      numeric(10, 3)
  )
  -- Join, a nie zapis wprost z line.filament_id. Klucz obcy do filaments
  -- egzekwuje systemowy trigger referencyjny, który jest zwolniony z RLS —
  -- czyli sam klucz obcy przepuściłby szpulę należącą do kogoś innego.
  -- Join czyta filaments jako zalogowany użytkownik, więc cudzy wiersz po
  -- prostu nie istnieje i pozycja wypada z wyniku.
  join public.filaments f on f.id = line.filament_id;

  get diagnostics v_count = row_count;

  -- Wypadnięta pozycja to albo cudza szpula, albo literówka w nazwie klucza
  -- (jsonb_to_recordset daje wtedy NULL, a filament_id jest nullowalny z
  -- rozmysłem — FR-008 — więc nic by nie krzyknęło). Obie drogi prowadzą do
  -- projektu, którego nigdy nie da się wydrukować. Lepiej odmówić teraz.
  if v_count <> jsonb_array_length(p_lines) then
    -- Osobny prefiks, a nie FILAMENT_MISSING: tamten niesie nazwę szpuli i
    -- humanise() dokleja do niego zdanie zbudowane pod nazwę. Ten niesie
    -- liczbę, więc potrzebuje własnej gałęzi po stronie aplikacji.
    raise exception 'LINES_NOT_IN_INVENTORY: % of %',
      jsonb_array_length(p_lines) - v_count, jsonb_array_length(p_lines)
      using errcode = '23503';
  end if;

  return v_project_id;
end;
$$;

-- create function nadaje EXECUTE roli PUBLIC automatycznie, a Supabase dokłada
-- do tego domyślne uprawnienia dla anon, authenticated i service_role. Sam
-- grant niczego więc nie zawęża — bez tych dwóch revoke funkcję mógłby wywołać
-- ktoś niezalogowany. Strażnik na auth.uid() zostaje jako druga linia obrony,
-- ale odmowa ma padać na poziomie uprawnień, zanim ciało funkcji ruszy.
revoke execute on function public.create_project_with_lines(text, text, jsonb) from public;
revoke execute on function public.create_project_with_lines(text, text, jsonb) from anon;
grant execute on function public.create_project_with_lines(text, text, jsonb) to authenticated;
