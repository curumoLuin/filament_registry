-- Filament Registry — initial schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
-- Design note: available quantity is DERIVED, never stored. It is
-- `initial_quantity_g` minus the sum of estimated usage over projects whose
-- status is 'printed'. That makes deduction and its reversal (FR-011 / FR-012)
-- a single status flip rather than two mutations that could disagree, and it
-- makes drift (test-plan R-01) structurally impossible.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- filaments
create table if not exists public.filaments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  name               text not null check (length(trim(name)) between 1 and 120),
  manufacturer       text not null check (length(trim(manufacturer)) between 1 and 80),
  color              text,
  material           text not null check (length(trim(material)) between 1 and 40),
  initial_quantity_g numeric(10, 3) not null check (initial_quantity_g >= 0),
  nozzle_temp_c      integer check (nozzle_temp_c between 150 and 500),
  bed_temp_c         integer check (bed_temp_c between 0 and 200),
  print_speed_mms    integer check (print_speed_mms between 1 and 1000),
  flow_rate_pct      numeric(6, 2) check (flow_rate_pct between 50 and 150),
  cooling_pct        integer check (cooling_pct between 0 and 100),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists filaments_user_id_idx on public.filaments (user_id, created_at desc);

-- ----------------------------------------------------------------- projects
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 120),
  description text,
  status      text not null default 'draft' check (status in ('draft', 'printed')),
  printed_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects (user_id, created_at desc);

-- -------------------------------------------------------- project_filaments
-- filament_id is ON DELETE SET NULL, not CASCADE: deleting a spool must leave
-- the historical project line intact and show "filament deleted" (FR-008).
create table if not exists public.project_filaments (
  id                     uuid primary key default gen_random_uuid(),
  project_id             uuid not null references public.projects (id) on delete cascade,
  filament_id            uuid references public.filaments (id) on delete set null,
  filament_name_snapshot text not null,
  estimated_usage_g      numeric(10, 3) not null check (estimated_usage_g > 0),
  created_at             timestamptz not null default now(),
  unique (project_id, filament_id)
);

create index if not exists project_filaments_project_idx on public.project_filaments (project_id);
create index if not exists project_filaments_filament_idx on public.project_filaments (filament_id);

-- ------------------------------------------------------------ updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists filaments_touch_updated_at on public.filaments;
create trigger filaments_touch_updated_at
  before update on public.filaments
  for each row execute function public.touch_updated_at();

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------- derived inventory view
create or replace view public.filament_inventory
with (security_invoker = on) as
select
  f.*,
  coalesce(d.deducted_quantity_g, 0)::numeric(10, 3)                       as deducted_quantity_g,
  (f.initial_quantity_g - coalesce(d.deducted_quantity_g, 0))::numeric(10, 3) as available_quantity_g
from public.filaments f
left join (
  select pf.filament_id, sum(pf.estimated_usage_g) as deducted_quantity_g
  from public.project_filaments pf
  join public.projects p on p.id = pf.project_id
  where p.status = 'printed'
  group by pf.filament_id
) d on d.filament_id = f.id;

-- ------------------------------------------- atomic status change (FR-014)
-- Validates and flips in ONE transaction while holding a lock on every
-- referenced spool, so a concurrent print cannot slip between the check and
-- the flip. Raises on the first violation, which rolls the whole call back —
-- there is no code path that applies a partial deduction.
create or replace function public.set_project_status(
  p_project_id uuid,
  p_status     text
)
returns public.projects
language plpgsql
security invoker
as $$
declare
  v_project public.projects;
  v_line    record;
  v_available numeric(10, 3);
  v_result  public.projects;
begin
  if p_status not in ('draft', 'printed') then
    raise exception 'INVALID_STATUS: %', p_status using errcode = '22023';
  end if;

  select * into v_project
  from public.projects
  where id = p_project_id
  for update;

  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_project.status = p_status then
    return v_project;
  end if;

  if p_status = 'printed' then
    -- Lock every referenced spool before validating.
    perform 1
    from public.filaments f
    join public.project_filaments pf on pf.filament_id = f.id
    where pf.project_id = p_project_id
    for update of f;

    if not exists (select 1 from public.project_filaments where project_id = p_project_id) then
      raise exception 'NO_LINES' using errcode = '23514';
    end if;

    for v_line in
      select pf.filament_id, pf.filament_name_snapshot, pf.estimated_usage_g
      from public.project_filaments pf
      where pf.project_id = p_project_id
    loop
      if v_line.filament_id is null then
        raise exception 'FILAMENT_MISSING: %', v_line.filament_name_snapshot
          using errcode = '23503';
      end if;

      select fi.available_quantity_g into v_available
      from public.filament_inventory fi
      where fi.id = v_line.filament_id;

      if v_available is null then
        raise exception 'FILAMENT_MISSING: %', v_line.filament_name_snapshot
          using errcode = '23503';
      end if;

      if v_line.estimated_usage_g > v_available then
        raise exception 'INSUFFICIENT_QUANTITY: % needs % g but only % g is available',
          v_line.filament_name_snapshot, v_line.estimated_usage_g, v_available
          using errcode = '23514';
      end if;
    end loop;
  end if;

  update public.projects
  set status = p_status,
      printed_at = case when p_status = 'printed' then now() else null end
  where id = p_project_id
  returning * into v_result;

  return v_result;
end;
$$;

-- ------------------------------------------------------------------- RLS
alter table public.filaments         enable row level security;
alter table public.projects          enable row level security;
alter table public.project_filaments enable row level security;

drop policy if exists filaments_owner_all on public.filaments;
create policy filaments_owner_all on public.filaments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists projects_owner_all on public.projects;
create policy projects_owner_all on public.projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Lines inherit ownership from their project.
drop policy if exists project_filaments_owner_all on public.project_filaments;
create policy project_filaments_owner_all on public.project_filaments
  for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_filaments.project_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_filaments.project_id and p.user_id = auth.uid()
    )
  );

grant select on public.filament_inventory to authenticated;
grant execute on function public.set_project_status(uuid, text) to authenticated;
