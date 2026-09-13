import type { APIRoute } from 'astro';
import { extractParameters } from '../../lib/ai/extract';
import { extractRequestSchema } from '../../lib/schemas';

export const prerender = false;

/**
 * Pasted datasheet text in, structured parameters out.
 *
 * NFR: the submitted text leaves no trace in app-controlled storage — it is
 * used for this one call and discarded. Nothing here writes to the database.
 */
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const parsed = extractRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' }, 400);
  }

  const result = await extractParameters(parsed.data.text);
  return json(result, 200);
};

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
