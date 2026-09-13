import type { APIRoute } from 'astro';
import { filamentInputSchema, flattenIssues, formToObject } from '../../../lib/schemas';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const id = params.id!;
  const form = await request.formData();
  const action = String(form.get('_action') ?? 'update');

  if (action === 'delete') {
    const { error } = await locals.supabase.from('filaments').delete().eq('id', id);
    if (error) return redirect(`/filaments?error=${encodeURIComponent(error.message)}`);
    return redirect(`/filaments?ok=${encodeURIComponent('Filament deleted. Projects that used it now show "filament deleted".')}`);
  }

  const parsed = filamentInputSchema.safeParse(formToObject(form));
  if (!parsed.success) {
    return redirect(`/filaments/${id}?error=${encodeURIComponent(flattenIssues(parsed.error).join(' · '))}`);
  }

  const { error } = await locals.supabase
    .from('filaments')
    .update(parsed.data)
    .eq('id', id);

  if (error) return redirect(`/filaments/${id}?error=${encodeURIComponent(error.message)}`);

  return redirect(`/filaments?ok=${encodeURIComponent(`"${parsed.data.name}" updated.`)}`);
};
