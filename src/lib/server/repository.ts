import type { SupabaseClient } from '@supabase/supabase-js';
import type { FilamentStock, ProjectLine, ProjectStatus } from '../domain/inventory';
import type { PrintParameters } from '../domain/parameters';

export interface FilamentRow {
  id: string;
  user_id: string;
  name: string;
  manufacturer: string;
  color: string | null;
  material: string;
  initial_quantity_g: number;
  nozzle_temp_c: number | null;
  bed_temp_c: number | null;
  print_speed_mms: number | null;
  flow_rate_pct: number | null;
  cooling_pct: number | null;
  notes: string | null;
  created_at: string;
}

export interface InventoryRow extends FilamentRow {
  deducted_quantity_g: number;
  available_quantity_g: number;
}

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  printed_at: string | null;
  created_at: string;
}

export interface ProjectLineRow {
  id: string;
  project_id: string;
  filament_id: string | null;
  filament_name_snapshot: string;
  estimated_usage_g: number;
}

export interface ProjectWithLines extends ProjectRow {
  lines: (ProjectLineRow & { filament: FilamentRow | null })[];
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));

export function toStock(row: InventoryRow): FilamentStock {
  return {
    id: row.id,
    name: row.name,
    initialQuantityG: num(row.initial_quantity_g),
    deductedQuantityG: num(row.deducted_quantity_g),
  };
}

export function toLine(row: ProjectLineRow): ProjectLine {
  return {
    filamentId: row.filament_id,
    filamentNameSnapshot: row.filament_name_snapshot,
    estimatedUsageG: num(row.estimated_usage_g),
  };
}

export function toParameters(row: FilamentRow | null): PrintParameters {
  return {
    nozzleTempC: row?.nozzle_temp_c ?? null,
    bedTempC: row?.bed_temp_c ?? null,
    printSpeedMms: row?.print_speed_mms ?? null,
    flowRatePct: row?.flow_rate_pct ?? null,
    coolingPct: row?.cooling_pct ?? null,
  };
}

export async function listInventory(supabase: SupabaseClient): Promise<InventoryRow[]> {
  const { data, error } = await supabase
    .from('filament_inventory')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...(row as InventoryRow),
    initial_quantity_g: num((row as InventoryRow).initial_quantity_g),
    deducted_quantity_g: num((row as InventoryRow).deducted_quantity_g),
    available_quantity_g: num((row as InventoryRow).available_quantity_g),
  }));
}

export async function getInventoryItem(
  supabase: SupabaseClient,
  id: string,
): Promise<InventoryRow | null> {
  const { data, error } = await supabase
    .from('filament_inventory')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as InventoryRow | null;
}

export async function listProjects(supabase: SupabaseClient): Promise<ProjectWithLines[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*, lines:project_filaments(*, filament:filaments(*))')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ProjectWithLines[];
}

export async function getProject(
  supabase: SupabaseClient,
  id: string,
): Promise<ProjectWithLines | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*, lines:project_filaments(*, filament:filaments(*))')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as ProjectWithLines | null;
}
