import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const id = params.id!;
  const form = await request.formData();

  if (String(form.get('_action')) !== 'delete') {
    return redirect(`/projects/${id}?error=${encodeURIComponent('Unsupported action.')}`);
  }

  const { error } = await locals.supabase.from('projects').delete().eq('id', id);
  if (error) return redirect(`/projects/${id}?error=${encodeURIComponent(error.message)}`);

  return redirect(`/projects?ok=${encodeURIComponent('Project deleted.')}`);
};
