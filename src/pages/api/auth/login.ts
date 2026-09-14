import type { APIRoute } from 'astro';
import { safeRedirectPath } from '../../../lib/safe-redirect';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const redirectTo = String(form.get('redirectTo') ?? '/filaments');

  if (!email || !password) {
    return redirect(`/login?error=${encodeURIComponent('Email and password are required.')}`);
  }

  const { error } = await locals.supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return redirect(`/login?error=${encodeURIComponent('Invalid email or password.')}`);
  }

  return redirect(safeRedirectPath(redirectTo));
};
