import type { APIRoute } from 'astro';
import { filamentInputSchema, flattenIssues, formToObject } from '../../../lib/schemas';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user!;
  const form = await request.formData();
  const parsed = filamentInputSchema.safeParse(formToObject(form));

  if (!parsed.success) {
    return redirect(`/filaments?error=${encodeURIComponent(flattenIssues(parsed.error).join(' · '))}`);
  }

  const { error } = await locals.supabase
    .from('filaments')
    .insert({ ...parsed.data, user_id: user.id });

  if (error) {
    return redirect(`/filaments?error=${encodeURIComponent(error.message)}`);
  }

  return redirect(`/filaments?ok=${encodeURIComponent(`"${parsed.data.name}" added to inventory.`)}`);
};
