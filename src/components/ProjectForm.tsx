import { useEffect, useMemo, useState } from 'react';
import {
  validateUsage,
  type FilamentStock,
  type ProjectLine,
} from '../lib/domain/inventory';

export interface InventoryOption {
  id: string;
  name: string;
  manufacturer: string;
  material: string;
  initialQuantityG: number;
  deductedQuantityG: number;
  availableQuantityG: number;
}

interface LineDraft {
  key: number;
  filamentId: string;
  grams: string;
}

let nextKey = 1;

/**
 * The project builder runs the same validation rules the server enforces, so
 * the user sees "only 120 g available" while typing instead of after submitting
 * (PRD success criterion 5: the check is visible before project creation).
 * The server re-runs it regardless — this is convenience, not the gate.
 */
export default function ProjectForm({ inventory }: { inventory: InventoryOption[] }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([
    { key: 0, filamentId: inventory[0]?.id ?? '', grams: '' },
  ]);
  // See the note in FilamentForm: hydration is observable so callers can wait
  // for it rather than racing the island.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const stocks: FilamentStock[] = useMemo(
    () =>
      inventory.map((item) => ({
        id: item.id,
        name: item.name,
        initialQuantityG: item.initialQuantityG,
        deductedQuantityG: item.deductedQuantityG,
      })),
    [inventory],
  );

  const byId = useMemo(() => new Map(inventory.map((item) => [item.id, item])), [inventory]);

  const domainLines: ProjectLine[] = lines
    .filter((line) => line.filamentId !== '')
    .map((line) => ({
      filamentId: line.filamentId,
      filamentNameSnapshot: byId.get(line.filamentId)?.name ?? 'Unknown',
      estimatedUsageG: Number(line.grams.replace(',', '.')),
    }));

  const touched = lines.some((line) => line.grams.trim() !== '');
  const validation = validateUsage(domainLines, stocks);
  const showViolations = touched && !validation.ok;

  const addLine = () =>
    setLines((prev) => [...prev, { key: nextKey++, filamentId: '', grams: '' }]);

  const removeLine = (key: number) =>
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));

  const update = (key: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  if (inventory.length === 0) {
    return (
      <div className="card p-6 text-sm text-stone-600">
        <p className="font-medium">No filament in inventory yet.</p>
        <p className="mt-1">
          A project declares how many grams of each spool it will consume, so add a
          filament first.
        </p>
        <a href="/filaments/new" className="btn-primary mt-4">Add a filament</a>
      </div>
    );
  }

  return (
    <form
      method="POST"
      action="/api/projects"
      className="space-y-6"
      data-testid="project-form"
      data-hydrated={hydrated ? 'true' : 'false'}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Project name <span className="text-[var(--color-accent)]">*</span></span>
          <input
            className="input"
            name="name"
            data-testid="project-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Description</span>
          <input
            className="input"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>

      <section>
        <h3 className="text-sm font-semibold">Filament usage</h3>
        <p className="mt-1 text-xs text-stone-500">
          Declare the estimated grams per spool. Nothing is deducted until you mark the
          project as printed.
        </p>

        <div className="mt-3 space-y-3">
          {lines.map((line) => {
            const item = byId.get(line.filamentId);
            const grams = Number(line.grams.replace(',', '.'));
            const over = item !== undefined && grams > item.availableQuantityG;

            return (
              <div key={line.key} className="flex flex-wrap items-end gap-3">
                <label className="min-w-56 flex-1">
                  <span className="label">Filament</span>
                  <select
                    className="input"
                    name="filament_id"
                    data-testid="line-filament"
                    value={line.filamentId}
                    onChange={(e) => update(line.key, { filamentId: e.target.value })}
                    required
                  >
                    <option value="">Select a spool…</option>
                    {inventory.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name} — {option.availableQuantityG} g available
                      </option>
                    ))}
                  </select>
                </label>

                <label className="w-40">
                  <span className="label">Estimated usage (g)</span>
                  <input
                    className={`input ${over ? 'border-red-400 bg-red-50' : ''}`}
                    name="estimated_usage_g"
                    data-testid="line-usage"
                    type="number"
                    step="0.001"
                    min="0.001"
                    required
                    value={line.grams}
                    onChange={(e) => update(line.key, { grams: e.target.value })}
                  />
                </label>

                <div className="pb-1 text-xs text-stone-500">
                  {item ? (
                    <span data-testid="line-available">
                      {item.availableQuantityG} g available
                      {Number.isFinite(grams) && grams > 0 && !over && (
                        <> · {Math.round((item.availableQuantityG - grams) * 1000) / 1000} g left after</>
                      )}
                    </span>
                  ) : (
                    <span>&nbsp;</span>
                  )}
                </div>

                <button
                  type="button"
                  className="btn-secondary mb-0.5"
                  onClick={() => removeLine(line.key)}
                  disabled={lines.length === 1}
                  aria-label="Remove line"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>

        <button type="button" className="btn-secondary mt-3" onClick={addLine}>
          + Add another filament
        </button>
      </section>

      {showViolations && (
        <ul
          data-testid="validation-errors"
          className="space-y-1 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {validation.violations.map((violation, index) => (
            <li key={index}>{violation.message}</li>
          ))}
        </ul>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          data-testid="save-project"
          className="btn-primary"
          disabled={!validation.ok || name.trim() === ''}
        >
          Create project
        </button>
        <a href="/projects" className="btn-secondary">Cancel</a>
      </div>
    </form>
  );
}
