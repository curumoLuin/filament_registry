-- Optional demo data.
--
-- Run AFTER 0001_init.sql and AFTER creating the owner account in
-- Supabase Studio (Authentication -> Users -> Add user, "Auto Confirm User" on).
-- Replace the email below with the account you created.

do $$
declare
  v_user uuid;
  v_prusa uuid;
  v_petg uuid;
  v_project uuid;
begin
  select id into v_user from auth.users where email = 'owner@example.com';
  if v_user is null then
    raise exception 'Create the owner account in Supabase Studio first, then update the email in this script.';
  end if;

  insert into public.filaments
    (user_id, name, manufacturer, color, material, initial_quantity_g,
     nozzle_temp_c, bed_temp_c, print_speed_mms, flow_rate_pct, cooling_pct, notes)
  values
    (v_user, 'Prusament PLA Galaxy Black', 'Prusament', 'Galaxy Black', 'PLA',
     1000, 215, 60, 60, 95, 100, 'Datasheet values, confirmed on the test bed.')
  returning id into v_prusa;

  insert into public.filaments
    (user_id, name, manufacturer, color, material, initial_quantity_g,
     nozzle_temp_c, bed_temp_c, print_speed_mms, flow_rate_pct, cooling_pct, notes)
  values
    (v_user, 'Fiberlogy Easy PETG Orange', 'Fiberlogy', 'Orange', 'PETG',
     750, 240, 85, 45, 98, 50, 'Ironing pass needs flow 98%, not the stock 100%.')
  returning id into v_petg;

  insert into public.projects (user_id, name, description, status)
  values (v_user, 'Benchy calibration set', 'Three Benchies at different speeds.', 'draft')
  returning id into v_project;

  insert into public.project_filaments
    (project_id, filament_id, filament_name_snapshot, estimated_usage_g)
  values
    (v_project, v_prusa, 'Prusament PLA Galaxy Black', 120),
    (v_project, v_petg, 'Fiberlogy Easy PETG Orange', 45);
end $$;
