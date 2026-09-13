import { z } from 'zod';

const optionalNumber = (min: number, max: number) =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim().replace(',', '.');
      if (s === '') return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : NaN;
    })
    .refine((v) => v === null || (!Number.isNaN(v) && v >= min && v <= max), {
      message: `must be a number between ${min} and ${max}`,
    });

const requiredNumber = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => Number(String(v).trim().replace(',', '.')))
    .refine((v) => Number.isFinite(v) && v >= min && v <= max, {
      message: `must be a number between ${min} and ${max}`,
    });

export const filamentInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  manufacturer: z.string().trim().min(1, 'Manufacturer is required').max(80),
  material: z.string().trim().min(1, 'Material is required').max(40),
  color: z.string().trim().max(60).optional().transform((v) => v || null),
  initial_quantity_g: requiredNumber(0, 100000),
  nozzle_temp_c: optionalNumber(150, 500),
  bed_temp_c: optionalNumber(0, 200),
  print_speed_mms: optionalNumber(1, 1000),
  flow_rate_pct: optionalNumber(50, 150),
  cooling_pct: optionalNumber(0, 100),
  notes: z.string().trim().max(2000).optional().transform((v) => v || null),
});

export type FilamentInput = z.infer<typeof filamentInputSchema>;

export const projectLineSchema = z.object({
  filament_id: z.string().uuid(),
  estimated_usage_g: requiredNumber(0.001, 100000),
});

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(2000).optional().transform((v) => v || null),
  lines: z.array(projectLineSchema).min(1, 'Pick at least one filament'),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

export const extractRequestSchema = z.object({
  text: z.string().trim().min(10, 'Paste at least a few lines of the datasheet').max(20000),
});

export const statusSchema = z.enum(['draft', 'printed']);

/** Turns a FormData body into the shape the schemas expect. */
export function formToObject(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/** Collapses a ZodError into "field: message" lines for the UI. */
export function flattenIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
