import type { APIRoute } from 'astro';
import { projectInputSchema, flattenIssues } from '../../../lib/schemas';
import { validateUsage, type ProjectLine } from '../../../lib/domain/inventory';
import { listInventory, toStock } from '../../../lib/server/repository';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user!;
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

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      status: 'draft',
    })
    .select('id')
    .single();

  if (projectError || !project) {
    return fail(redirect, projectError?.message ?? 'Could not create the project.');
  }

  const { error: linesError } = await supabase.from('project_filaments').insert(
    lines.map((line) => ({
      project_id: project.id,
      filament_id: line.filamentId,
      filament_name_snapshot: line.filamentNameSnapshot,
      estimated_usage_g: line.estimatedUsageG,
    })),
  );

  if (linesError) {
    // Don't leave a project with no lines behind.
    await supabase.from('projects').delete().eq('id', project.id);
    return fail(redirect, linesError.message);
  }

  return redirect(`/projects/${project.id}?ok=${encodeURIComponent('Project created as a draft.')}`);
};

function fail(redirect: (path: string) => Response, message: string): Response {
  return redirect(`/projects/new?error=${encodeURIComponent(message)}`);
}
