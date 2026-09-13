import { createServerClient, parseCookieHeader, type CookieOptions } from '@supabase/ssr';
import type { AstroCookies } from 'astro';
import { serverEnv } from './env';

export function assertSupabaseConfigured(): void {
  if (!serverEnv('PUBLIC_SUPABASE_URL') || !serverEnv('PUBLIC_SUPABASE_ANON_KEY')) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env and fill in ' +
        'PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY from your project settings.',
    );
  }
}

/**
 * Request-scoped Supabase client. Every query made through it runs as the
 * signed-in user, so row-level security is what actually separates accounts
 * (test-plan R-07) — the app never holds a service-role key at request time.
 */
export function createSupabaseServerClient(context: {
  headers: Headers;
  cookies: AstroCookies;
}) {
  assertSupabaseConfigured();

  return createServerClient(serverEnv('PUBLIC_SUPABASE_URL')!, serverEnv('PUBLIC_SUPABASE_ANON_KEY')!, {
    cookies: {
      getAll() {
        return parseCookieHeader(context.headers.get('Cookie') ?? '').map((cookie) => ({
          name: cookie.name,
          value: cookie.value ?? '',
        }));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          context.cookies.set(name, value, {
            ...(options as CookieOptions),
            path: options?.path ?? '/',
            sameSite: 'lax',
            httpOnly: true,
            secure: import.meta.env.PROD === true,
          });
        }
      },
    },
  });
}
