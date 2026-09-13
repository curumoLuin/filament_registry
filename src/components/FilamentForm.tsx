import { useEffect, useState } from 'react';
import type {
  ExtractionResult,
  ParameterKey,
} from '../lib/domain/parameters';

export interface FilamentFormValues {
  name: string;
  manufacturer: string;
  material: string;
  color: string;
  initial_quantity_g: string;
  nozzle_temp_c: string;
  bed_temp_c: string;
  print_speed_mms: string;
  flow_rate_pct: string;
  cooling_pct: string;
  notes: string;
}

const EMPTY: FilamentFormValues = {
  name: '',
  manufacturer: '',
  material: '',
  color: '',
  initial_quantity_g: '1000',
  nozzle_temp_c: '',
  bed_temp_c: '',
  print_speed_mms: '',
  flow_rate_pct: '',
  cooling_pct: '',
  notes: '',
};

const PARAM_FIELDS: {
  name: keyof FilamentFormValues;
  key: ParameterKey;
  label: string;
  unit: string;
}[] = [
  { name: 'nozzle_temp_c', key: 'nozzleTempC', label: 'Nozzle temp', unit: '°C' },
  { name: 'bed_temp_c', key: 'bedTempC', label: 'Bed temp', unit: '°C' },
  { name: 'print_speed_mms', key: 'printSpeedMms', label: 'Print speed', unit: 'mm/s' },
  { name: 'flow_rate_pct', key: 'flowRatePct', label: 'Flow rate', unit: '%' },
  { name: 'cooling_pct', key: 'coolingPct', label: 'Cooling', unit: '%' },
];

interface Props {
  action: string;
  initial?: Partial<FilamentFormValues>;
  submitLabel?: string;
  showExtractor?: boolean;
}

export default function FilamentForm({
  action,
  initial,
  submitLabel = 'Add to inventory',
  showExtractor = true,
}: Props) {
  const [values, setValues] = useState<FilamentFormValues>({ ...EMPTY, ...initial });
  // Islands are server-rendered first and hydrated after. Until hydration runs,
  // typing into these fields updates the DOM but not React state, and the next
  // render throws it away. Exposing the moment hydration completes lets tests
  // (and anything else driving the form) wait for it instead of racing it.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [datasheet, setDatasheet] = useState('');
  const [busy, setBusy] = useState(false);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  const set = (field: keyof FilamentFormValues, value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  async function handleExtract() {
    setBusy(true);
    setExtractError(null);
    setExtraction(null);
    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: datasheet }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setExtractError(payload.error ?? 'Extraction failed.');
        return;
      }

      const result = payload as ExtractionResult;
      setExtraction(result);
      setValues((prev) => {
        const next = { ...prev };
        for (const field of PARAM_FIELDS) {
          const value = result.parameters[field.key];
          if (value !== null) next[field.name] = String(value);
        }
        if (result.suggestedName && !prev.name) next.name = result.suggestedName;
        if (result.suggestedManufacturer && !prev.manufacturer)
          next.manufacturer = result.suggestedManufacturer;
        if (result.suggestedMaterial && !prev.material)
          next.material = result.suggestedMaterial;
        return next;
      });
    } catch {
      setExtractError('Could not reach the extraction service. Enter the values manually.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      method="POST"
      action={action}
      className="space-y-6"
      data-testid="filament-form"
      data-hydrated={hydrated ? 'true' : 'false'}
    >
      {showExtractor && (
        <section className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4">
          <h3 className="text-sm font-semibold">Start from a datasheet</h3>
          <p className="mt-1 text-xs text-stone-500">
            Paste the manufacturer's spec text. The parameters are extracted for you and
            filled in below — nothing is saved until you review them and submit.
          </p>
          <textarea
            data-testid="datasheet-input"
            className="input mt-3 h-32 font-mono text-xs"
            placeholder={'Prusament PLA\nNozzle temperature: 215 °C\nBed temperature: 60 °C\nPrint speed: 60 mm/s'}
            value={datasheet}
            onChange={(event) => setDatasheet(event.target.value)}
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              data-testid="extract-button"
              className="btn-secondary"
              disabled={busy || datasheet.trim().length < 10}
              onClick={handleExtract}
            >
              {busy ? 'Extracting…' : 'Extract parameters'}
            </button>
            {busy && (
              <span className="text-xs text-stone-500" role="status" aria-live="polite">
                Reading the datasheet…
              </span>
            )}
          </div>

          {extractError && (
            <p data-testid="extract-error" className="mt-3 text-xs text-red-700">
              {extractError}
            </p>
          )}

          {extraction && (
            <div
              data-testid="extract-summary"
              className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
            >
              <strong>Review before saving.</strong>{' '}
              {extraction.found.length} of 5 parameters read
              {extraction.source === 'llm' ? ' by the model' : ' by the built-in parser'}
              {extraction.missing.length > 0 && (
                <> — {extraction.missing.length} could not be read and are left blank.</>
              )}
            </div>
          )}
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <input
            className="input"
            name="name"
            data-testid="filament-name"
            required
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label="Manufacturer" required>
          <input
            className="input"
            name="manufacturer"
            data-testid="filament-manufacturer"
            required
            value={values.manufacturer}
            onChange={(e) => set('manufacturer', e.target.value)}
          />
        </Field>
        <Field label="Material" required>
          <input
            className="input"
            name="material"
            data-testid="filament-material"
            required
            placeholder="PLA, PETG, ABS…"
            value={values.material}
            onChange={(e) => set('material', e.target.value)}
          />
        </Field>
        <Field label="Color">
          <input
            className="input"
            name="color"
            value={values.color}
            onChange={(e) => set('color', e.target.value)}
          />
        </Field>
        <Field label="Quantity (g)" required>
          <input
            className="input"
            name="initial_quantity_g"
            data-testid="filament-quantity"
            type="number"
            step="0.001"
            min="0"
            required
            value={values.initial_quantity_g}
            onChange={(e) => set('initial_quantity_g', e.target.value)}
          />
        </Field>
      </section>

      <section>
        <h3 className="text-sm font-semibold">Print parameters</h3>
        <p className="mt-1 text-xs text-stone-500">
          Leave a field blank if you don't know it yet. Values from test-bed calibration
          belong here too — they override whatever the datasheet said.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {PARAM_FIELDS.map((field) => (
            <Field key={field.name} label={`${field.label} (${field.unit})`}>
              <input
                className="input"
                name={field.name}
                data-testid={field.name}
                type="number"
                step="0.1"
                value={values[field.name]}
                onChange={(e) => set(field.name, e.target.value)}
              />
            </Field>
          ))}
        </div>
      </section>

      <Field label="Notes">
        <textarea
          className="input h-20"
          name="notes"
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </Field>

      <div className="flex gap-3">
        <button type="submit" data-testid="save-filament" className="btn-primary">
          {submitLabel}
        </button>
        <a href="/filaments" className="btn-secondary">Cancel</a>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span className="text-[var(--color-accent)]"> *</span>}
      </span>
      {children}
    </label>
  );
}
