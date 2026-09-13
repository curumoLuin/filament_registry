/**
 * Server-side environment access.
 *
 * `import.meta.env.PUBLIC_*` is inlined by Vite at BUILD time. A production
 * container that receives its configuration as runtime environment variables
 * would therefore see an empty value. Reading `process.env` as a fallback makes
 * the same build work in `astro dev` (via .env), in `node ./dist/server/entry.mjs`,
 * and on a platform that injects env vars at start-up.
 */
export function serverEnv(key: string): string | undefined {
  const fromBuild = (import.meta.env as Record<string, unknown>)[key];
  if (typeof fromBuild === 'string' && fromBuild !== '') return fromBuild;

  const fromRuntime = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  if (typeof fromRuntime === 'string' && fromRuntime !== '') return fromRuntime;

  return undefined;
}
