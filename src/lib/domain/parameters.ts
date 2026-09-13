/**
 * Print-parameter domain rules: the deterministic datasheet parser and the
 * per-filament aggregation with conflict detection.
 *
 * Pure — no network. The LLM extractor in `src/lib/ai/extract.ts` wraps this
 * module and falls back to it whenever no API key is configured or the model
 * call fails, so the feature never hard-depends on an external service.
 *
 * Covers PRD FR-003, FR-005, FR-015.
 */

export interface PrintParameters {
  nozzleTempC: number | null;
  bedTempC: number | null;
  printSpeedMms: number | null;
  flowRatePct: number | null;
  coolingPct: number | null;
}

export const EMPTY_PARAMETERS: PrintParameters = {
  nozzleTempC: null,
  bedTempC: null,
  printSpeedMms: null,
  flowRatePct: null,
  coolingPct: null,
};

export type ParameterKey = keyof PrintParameters;

export const PARAMETER_LABELS: Record<ParameterKey, string> = {
  nozzleTempC: 'Nozzle temperature',
  bedTempC: 'Bed temperature',
  printSpeedMms: 'Print speed',
  flowRatePct: 'Flow rate',
  coolingPct: 'Cooling',
};

export const PARAMETER_UNITS: Record<ParameterKey, string> = {
  nozzleTempC: '°C',
  bedTempC: '°C',
  printSpeedMms: 'mm/s',
  flowRatePct: '%',
  coolingPct: '%',
};

/** Plausibility windows. Anything outside is treated as a mis-parse and dropped
 *  rather than silently saved — the user is told a field could not be read. */
const RANGES: Record<ParameterKey, [number, number]> = {
  nozzleTempC: [150, 500],
  bedTempC: [0, 200],
  printSpeedMms: [1, 1000],
  flowRatePct: [50, 150],
  coolingPct: [0, 100],
};

export function isPlausible(key: ParameterKey, value: number): boolean {
  const [min, max] = RANGES[key];
  return Number.isFinite(value) && value >= min && value <= max;
}

/** Datasheets quote ranges ("210-230 °C", "80 – 90", "200 to 220"). We take the
 *  midpoint, rounded. A hyphen between two digits is a range separator, never a
 *  minus sign — reading it as one used to turn "220-250" into -15. */
function pickNumber(raw: string): number | null {
  const numbers = raw
    // decimal comma -> decimal point
    .replace(/,(\d)/g, '.$1')
    // range separators between digits -> plain whitespace
    .replace(/(\d)\s*(?:[-\u2010-\u2015~\u2013\u2014]|\bto\b|\bdo\b)\s*(?=\d)/gi, '$1 ')
    // a leading '-' that survived normalisation really is a negative value
    .match(/(?<![\d.])-?\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length === 0) return null;
  const values = numbers.map(Number).filter((n) => Number.isFinite(n));
  if (values.length === 0) return null;
  if (values.length === 1) return values[0]!;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return Math.round(((min + max) / 2) * 10) / 10;
}

interface Matcher {
  key: ParameterKey;
  patterns: RegExp[];
}

/** Label synonyms seen across Prusament / Bambu / Devil Design / eSun / Fiberlogy
 *  datasheets, in English and Polish. Each pattern captures the value segment. */
const MATCHERS: Matcher[] = [
  {
    key: 'nozzleTempC',
    patterns: [
      /(?:nozzle|hotend|extrusion|extruder|printing|print)\s*(?:temp(?:erature)?)\s*[:=\-–]?\s*([^\n;|]*)/i,
      /(?:temperatura)\s*(?:dyszy|druku|głowicy|glowicy)\s*[:=\-–]?\s*([^\n;|]*)/i,
    ],
  },
  {
    key: 'bedTempC',
    patterns: [
      /(?:bed|heatbed|heated\s*bed|build\s*plate|platform)\s*(?:temp(?:erature)?)?\s*[:=\-–]?\s*([^\n;|]*)/i,
      /(?:temperatura)\s*(?:stołu|stolu|podgrzewanego\s*stołu)\s*[:=\-–]?\s*([^\n;|]*)/i,
    ],
  },
  {
    key: 'printSpeedMms',
    patterns: [
      /(?:print(?:ing)?\s*speed|speed|max(?:imum)?\s*speed)\s*[:=\-–]?\s*([^\n;|]*)/i,
      /(?:prędkość|predkosc)\s*(?:druku)?\s*[:=\-–]?\s*([^\n;|]*)/i,
    ],
  },
  {
    key: 'flowRatePct',
    patterns: [
      /(?:flow(?:\s*rate)?|extrusion\s*multiplier|flow\s*ratio)\s*[:=\-–]?\s*([^\n;|]*)/i,
      /(?:przepływ|przeplyw)\s*[:=\-–]?\s*([^\n;|]*)/i,
    ],
  },
  {
    key: 'coolingPct',
    patterns: [
      /(?:cooling|fan(?:\s*speed)?|part\s*cooling)\s*[:=\-–]?\s*([^\n;|]*)/i,
      /(?:chłodzenie|chlodzenie|wentylator)\s*[:=\-–]?\s*([^\n;|]*)/i,
    ],
  },
];

export interface ExtractionResult {
  parameters: PrintParameters;
  /** Which fields were found — drives the review screen (FR-005). */
  found: ParameterKey[];
  missing: ParameterKey[];
  /** 'llm' when a model produced it, 'rules' for the built-in parser. */
  source: 'llm' | 'rules';
  /** Guessed identity fields, used to pre-fill the add-filament form. */
  suggestedName: string | null;
  suggestedManufacturer: string | null;
  suggestedMaterial: string | null;
}

const KNOWN_MANUFACTURERS = [
  'Prusament', 'Prusa', 'Bambu Lab', 'Bambu', 'Devil Design', 'Fiberlogy',
  'eSun', 'ESUN', 'Spectrum', 'Polymaker', 'Sunlu', 'Overture', 'Filamentum',
  'Fillamentum', 'Rosa3D', 'Noctuo', 'Print-Me', 'Azure Film', 'Elegoo',
];

const KNOWN_MATERIALS = [
  'PLA+', 'PLA', 'PETG', 'PET-G', 'ABS', 'ASA', 'TPU', 'PA6', 'PA12', 'PA',
  'PC', 'PVA', 'HIPS', 'PP', 'PEEK', 'PCTG', 'PVB',
];

function findFirst(text: string, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const re = new RegExp(`(?<![A-Za-z0-9])${candidate.replace(/[+\-]/g, '\\$&')}(?![A-Za-z0-9])`, 'i');
    const match = text.match(re);
    if (match) return candidate;
  }
  return null;
}

/**
 * Deterministic extraction from pasted datasheet text. Always returns a result;
 * fields it cannot read stay null and are reported in `missing`.
 */
export function extractParametersFromText(text: string): ExtractionResult {
  const parameters: PrintParameters = { ...EMPTY_PARAMETERS };

  for (const { key, patterns } of MATCHERS) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match?.[1]) continue;
      const value = pickNumber(match[1]);
      if (value === null) continue;
      if (!isPlausible(key, value)) continue;
      parameters[key] = value;
      break;
    }
  }

  const manufacturer = findFirst(text, KNOWN_MANUFACTURERS);
  const material = findFirst(text, KNOWN_MATERIALS);

  const found = (Object.keys(parameters) as ParameterKey[]).filter(
    (k) => parameters[k] !== null,
  );
  const missing = (Object.keys(parameters) as ParameterKey[]).filter(
    (k) => parameters[k] === null,
  );

  return {
    parameters,
    found,
    missing,
    source: 'rules',
    suggestedName:
      manufacturer && material ? `${manufacturer} ${material}` : null,
    suggestedManufacturer: manufacturer,
    suggestedMaterial: material,
  };
}

/* ------------------------------------------------------------------ */
/* Aggregation for the project parameters view (FR-015)                */
/* ------------------------------------------------------------------ */

export interface FilamentParameterBlock {
  filamentId: string | null;
  filamentName: string;
  parameters: PrintParameters;
}

export interface ParameterConflict {
  key: ParameterKey;
  label: string;
  unit: string;
  values: { filamentName: string; value: number }[];
  spread: number;
}

export interface AggregatedParameters {
  blocks: FilamentParameterBlock[];
  conflicts: ParameterConflict[];
}

/**
 * Keeps per-filament identity (a multi-material print genuinely needs different
 * settings per part) and flags every parameter where the blocks disagree.
 */
export function aggregateParameters(
  blocks: FilamentParameterBlock[],
): AggregatedParameters {
  const conflicts: ParameterConflict[] = [];
  const keys = Object.keys(EMPTY_PARAMETERS) as ParameterKey[];

  for (const key of keys) {
    const values = blocks
      .map((block) => ({ filamentName: block.filamentName, value: block.parameters[key] }))
      .filter((entry): entry is { filamentName: string; value: number } => entry.value !== null);

    if (values.length < 2) continue;
    const distinct = new Set(values.map((v) => v.value));
    if (distinct.size < 2) continue;

    const numbers = values.map((v) => v.value);
    conflicts.push({
      key,
      label: PARAMETER_LABELS[key],
      unit: PARAMETER_UNITS[key],
      values,
      spread: Math.round((Math.max(...numbers) - Math.min(...numbers)) * 10) / 10,
    });
  }

  return { blocks, conflicts };
}
