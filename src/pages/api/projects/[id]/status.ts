import type { APIRoute } from 'astro';
import { statusSchema } from '../../../../lib/schemas';
import { applyStatusChange } from '../../../../lib/domain/inventory';
import { getProject, listInventory, toLine, toStock } from '../../../../lib/server/repository';

export const prerender = false;

/**
 * The inventory lifecycle gate (FR-011 / FR-012 / FR-013 / FR-014).
 *
 * Two layers on purpose:
 *  1. The pure domain rules run first so the user gets a precise, readable
 *     explanation of exactly which spool is short and by how much.
 *  2. `set_project_status` in Postgres re-validates under a row lock and does
 *     the flip in one transaction, so a concurrent print cannot slip between
 *     the check and the write. It is the authority; layer 1 is the messaging.
 */
export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const id = params.id!;
  const supabase = locals.supabase;
  const form = await request.formData();

  const parsedStatus = statusSchema.safeParse(String(form.get('status') ?? ''));
  if (!parsedStatus.success) {
    return redirect(`/projects/${id}?error=${encodeURIComponent('Unknown status.')}`);
  }
  const nextStatus = parsedStatus.data;

  const project = await getProject(supabase, id);
  if (!project) {
    return redirect(`/projects?error=${encodeURIComponent('Project not found.')}`);
  }

  const inventory = await listInventory(supabase);
  const preflight = applyStatusChange(
    project.status,
    nextStatus,
    project.lines.map(toLine),
    inventory.map(toStock),
  );

  if (!preflight.ok) {
    const message = preflight.violations.map((v) => v.message).join(' · ');
    return redirect(`/projects/${id}?error=${encodeURIComponent(message)}`);
  }

  const { error } = await supabase.rpc('set_project_status', {
    p_project_id: id,
    p_status: nextStatus,
  });

  if (error) {
    return redirect(`/projects/${id}?error=${encodeURIComponent(humanise(error.message))}`);
  }

  const message =
    nextStatus === 'printed'
      ? 'Marked as printed — the declared usage has been deducted from inventory.'
      : 'Moved back to draft — the deduction has been reversed.';

  return redirect(`/projects/${id}?ok=${encodeURIComponent(message)}`);
};

function humanise(message: string): string {
  if (message.includes('INSUFFICIENT_QUANTITY')) {
    return message.replace(/^.*INSUFFICIENT_QUANTITY:\s*/, 'Not enough filament: ');
  }
  if (message.includes('FILAMENT_MISSING')) {
    return message.replace(/^.*FILAMENT_MISSING:\s*/, 'Filament no longer in inventory: ');
  }
  if (message.includes('NO_LINES')) {
    return 'This project has no filament lines.';
  }
  return message;
}
