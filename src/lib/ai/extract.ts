import {
  extractParametersFromText,
  isPlausible,
  type ExtractionResult,
  type ParameterKey,
  type PrintParameters,
  EMPTY_PARAMETERS,
} from '../domain/parameters';
import { serverEnv } from '../server/env';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const TIMEOUT_MS = 20000;

const SYSTEM_PROMPT = `You extract 3D-printing filament parameters from datasheet text.
Return ONLY a JSON object, no prose, no markdown fences, with exactly these keys:
{"nozzleTempC": number|null, "bedTempC": number|null, "printSpeedMms": number|null,
 "flowRatePct": number|null, "coolingPct": number|null,
 "manufacturer": string|null, "material": string|null, "name": string|null}
Rules:
- Temperatures in Celsius, speed in mm/s, flow and cooling in percent.
- If the text gives a range, return the midpoint rounded to one decimal.
- If a value is not stated, return null. Never guess a value.
- material is the polymer family (PLA, PETG, ABS, ASA, TPU, ...).`;

/**
 * LLM-assisted extraction with a deterministic floor.
 *
 * The model is an accelerator, never a dependency: without an API key, on a
 * network error, on a timeout, or on a response that fails the plausibility
 * check, this falls straight back to the rules parser. The caller always gets
 * a usable result, and the user reviews it before anything is saved (FR-005).
 */
export async function extractParameters(text: string): Promise<ExtractionResult> {
  const fallback = extractParametersFromText(text);
  const apiKey = serverEnv('OPENROUTER_API_KEY');
  if (!apiKey) return fallback;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'x-title': 'Filament Registry',
      },
      body: JSON.stringify({
        model: serverEnv('OPENROUTER_MODEL') || DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text.slice(0, 12000) },
        ],
      }),
    }).finally(() => clearTimeout(timer));

    if (!response.ok) return fallback;

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return fallback;

    const parsed = JSON.parse(stripFences(content)) as Record<string, unknown>;
    return normalise(parsed, fallback);
  } catch {
    // Network, abort, malformed JSON — all land here and use the rules parser.
    return fallback;
  }
}

function stripFences(content: string): string {
  return content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
}

/** Applies the same plausibility gate to model output as to the rules parser,
 *  then fills any remaining gap from the deterministic result. */
function normalise(
  raw: Record<string, unknown>,
  fallback: ExtractionResult,
): ExtractionResult {
  const parameters: PrintParameters = { ...EMPTY_PARAMETERS };
  const keys = Object.keys(EMPTY_PARAMETERS) as ParameterKey[];

  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'number' && isPlausible(key, value)) {
      parameters[key] = Math.round(value * 10) / 10;
    } else {
      parameters[key] = fallback.parameters[key];
    }
  }

  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 120) : null;

  const found = keys.filter((k) => parameters[k] !== null);

  return {
    parameters,
    found,
    missing: keys.filter((k) => parameters[k] === null),
    source: found.length > 0 ? 'llm' : 'rules',
    suggestedName: str(raw.name) ?? fallback.suggestedName,
    suggestedManufacturer: str(raw.manufacturer) ?? fallback.suggestedManufacturer,
    suggestedMaterial: str(raw.material) ?? fallback.suggestedMaterial,
  };
}
