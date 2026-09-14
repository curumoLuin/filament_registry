import type { APIRoute } from 'astro';
import { projectInputSchema, flattenIssues } from '../../../lib/schemas';
import { validateUsage, type ProjectLine } from '../../../lib/domain/inventory';
import { listInventory, toStock } from '../../../lib/server/repository';
import { humanise } from '../../../lib/server/db-errors';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const supabase = locals.supabase;
  const form = await request.formData();

  const filamentIds = form.getAll('filament_id').map(String).filter(Boolean);
  const usages = form.getAll('estimated_usage_g').map(String);

  const parsed = projectInputSchema.safeParse({
    name: form.get('name'),
    description: form.get('description'),
    lines: filamentIds.map((filament_id, i) => ({
      filament_id,
      estimated_usage_g: usages[i] ?? '0',
    })),
  });

  if (!parsed.success) {
    return fail(redirect, flattenIssues(parsed.error).join(' · '));
  }

  // Availability gate #1 — at creation time (FR-009).
  const inventory = await listInventory(supabase);
  const stocks = inventory.map(toStock);
  const byId = new Map(inventory.map((row) => [row.id, row]));

  const lines: ProjectLine[] = parsed.data.lines.map((line) => ({
    filamentId: line.filament_id,
    filamentNameSnapshot: byId.get(line.filament_id)?.name ?? 'Unknown filament',
    estimatedUsageG: line.estimated_usage_g,
  }));

  const validation = validateUsage(lines, stocks);
  if (!validation.ok) {
    return fail(redirect, validation.violations.map((v) => v.message).join(' · '));
  }

  // Jedno wywołanie, jedna transakcja. Wcześniej były tu dwa niezależne
  // zapytania i kompensujący delete na wypadek, gdyby drugie zawiodło —
  // czyli gwarancja spójności zależała od tego, czy kod sprzątający zdążył
  // się wykonać. Teraz wynika ona z transakcji bazy danych (R-10).
  const { data: projectId, error } = await supabase.rpc('create_project_with_lines', {
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? '',
    p_lines: lines.map((line) => ({
      filament_id: line.filamentId,
      filament_name_snapshot: line.filamentNameSnapshot,
      estimated_usage_g: line.estimatedUsageG,
    })),
  });

  if (error || !projectId) {
    return fail(redirect, humanise(error?.message ?? 'Could not create the project.'));
  }

  return redirect(`/projects/${projectId}?ok=${encodeURIComponent('Project created as a draft.')}`);
};

function fail(redirect: (path: string) => Response, message: string): Response {
  return redirect(`/projects/new?error=${encodeURIComponent(message)}`);
}
