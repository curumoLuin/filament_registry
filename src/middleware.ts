import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient } from './lib/server/supabase';

/** Everything else requires a session (test-plan R-08). */
const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/logout']);

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createSupabaseServerClient({
    headers: context.request.headers,
    cookies: context.cookies,
  });
  context.locals.supabase = supabase;

  // A failure here (Supabase unreachable, expired refresh token) must degrade to
  // "signed out" rather than a 500 on every route.
  try {
    const { data } = await supabase.auth.getUser();
    context.locals.user = data.user
      ? { id: data.user.id, email: data.user.email ?? null }
      : null;
  } catch {
    context.locals.user = null;
  }

  const path = context.url.pathname;
  const isPublic = PUBLIC_PATHS.has(path) || path.startsWith('/_');

  if (!context.locals.user && !isPublic) {
    if (path.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    const redirectTo = encodeURIComponent(path + context.url.search);
    return context.redirect(`/login?redirectTo=${redirectTo}`);
  }

  if (context.locals.user && path === '/login') {
    return context.redirect('/filaments');
  }

  return next();
});
