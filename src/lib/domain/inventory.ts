/**
 * Inventory domain rules — the business logic of Filament Registry.
 *
 * Deliberately pure: no database, no network, no framework. Every rule that
 * decides whether material is available, how much is deducted, and whether a
 * status transition may happen lives here and is unit-tested in
 * `tests/unit/inventory.test.ts`.
 *
 * Covers PRD FR-006, FR-009, FR-011, FR-012, FR-013, FR-014.
 */

/** Grams are stored as numbers; all arithmetic is rounded to milligram precision
 *  so repeated deduct/revert cycles can never drift (PRD guardrail:
 *  "Inventory deduction is exact ... no silent rounding or miscalculation"). */
export const GRAM_PRECISION = 3;

export function roundGrams(value: number): number {
  const factor = 10 ** GRAM_PRECISION;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export type ProjectStatus = 'draft' | 'printed';

/** A filament as far as the inventory rules are concerned. */
export interface FilamentStock {
  id: string;
  name: string;
  /** Total quantity the user declared when the spool entered inventory. */
  initialQuantityG: number;
  /** Sum of estimated usage across all *printed* projects referencing it. */
  deductedQuantityG: number;
}

/** One filament line of a project: "this project will use N grams of spool X". */
export interface ProjectLine {
  /** Null when the referenced filament was deleted (PRD FR-008 soft reference). */
  filamentId: string | null;
  /** Name captured at project-creation time, shown when the filament is gone. */
  filamentNameSnapshot: string;
  estimatedUsageG: number;
}

export type ViolationCode =
  | 'INSUFFICIENT_QUANTITY'
  | 'FILAMENT_MISSING'
  | 'NON_POSITIVE_USAGE'
  | 'DUPLICATE_FILAMENT'
  | 'NO_LINES';

export interface Violation {
  code: ViolationCode;
  filamentId: string | null;
  filamentName: string;
  /** Grams requested by the project line. */
  requestedG?: number;
  /** Grams actually available at validation time. */
  availableG?: number;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  violations: Violation[];
}

/** Available = declared total minus what printed projects already consumed.
 *  Draft projects deliberately do NOT reserve quantity (PRD FR-006). */
export function availableQuantityG(stock: FilamentStock): number {
  return roundGrams(stock.initialQuantityG - stock.deductedQuantityG);
}

function indexStocks(stocks: FilamentStock[]): Map<string, FilamentStock> {
  return new Map(stocks.map((s) => [s.id, s]));
}

/**
 * The availability gate. Applied twice — once when a project is created
 * (FR-009) and again at the moment of marking it printed (FR-013) — because
 * another project may have been printed in between.
 *
 * `excludeSelf` lets a printed project be re-validated without counting its own
 * existing deduction against itself.
 */
export function validateUsage(
  lines: ProjectLine[],
  stocks: FilamentStock[],
  options: { excludeSelf?: ProjectLine[] } = {},
): ValidationResult {
  const violations: Violation[] = [];

  if (lines.length === 0) {
    violations.push({
      code: 'NO_LINES',
      filamentId: null,
      filamentName: '',
      message: 'A project must use at least one filament.',
    });
    return { ok: false, violations };
  }

  const seen = new Set<string>();
  for (const line of lines) {
    if (line.filamentId !== null) {
      if (seen.has(line.filamentId)) {
        violations.push({
          code: 'DUPLICATE_FILAMENT',
          filamentId: line.filamentId,
          filamentName: line.filamentNameSnapshot,
          message: `"${line.filamentNameSnapshot}" is listed more than once. Combine the lines into one.`,
        });
      }
      seen.add(line.filamentId);
    }
    if (!(line.estimatedUsageG > 0)) {
      violations.push({
        code: 'NON_POSITIVE_USAGE',
        filamentId: line.filamentId,
        filamentName: line.filamentNameSnapshot,
        requestedG: line.estimatedUsageG,
        message: `Estimated usage for "${line.filamentNameSnapshot}" must be greater than 0 g.`,
      });
    }
  }

  const byId = indexStocks(stocks);
  const selfCredit = new Map<string, number>();
  for (const line of options.excludeSelf ?? []) {
    if (line.filamentId === null) continue;
    selfCredit.set(
      line.filamentId,
      roundGrams((selfCredit.get(line.filamentId) ?? 0) + line.estimatedUsageG),
    );
  }

  for (const line of lines) {
    if (line.filamentId === null) {
      violations.push({
        code: 'FILAMENT_MISSING',
        filamentId: null,
        filamentName: line.filamentNameSnapshot,
        message: `"${line.filamentNameSnapshot}" was deleted from inventory. Pick a different filament or remove the line.`,
      });
      continue;
    }

    const stock = byId.get(line.filamentId);
    if (!stock) {
      violations.push({
        code: 'FILAMENT_MISSING',
        filamentId: line.filamentId,
        filamentName: line.filamentNameSnapshot,
        message: `"${line.filamentNameSnapshot}" is no longer in inventory.`,
      });
      continue;
    }

    const available = roundGrams(
      availableQuantityG(stock) + (selfCredit.get(line.filamentId) ?? 0),
    );
    if (line.estimatedUsageG > available) {
      violations.push({
        code: 'INSUFFICIENT_QUANTITY',
        filamentId: stock.id,
        filamentName: stock.name,
        requestedG: roundGrams(line.estimatedUsageG),
        availableG: available,
        message: `"${stock.name}" needs ${roundGrams(line.estimatedUsageG)} g but only ${available} g is available.`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

export interface TransitionResult {
  ok: boolean;
  violations: Violation[];
  /** Resulting stock state. Empty when the transition was rejected — the
   *  all-or-nothing rule of FR-014: no partial deductions, ever. */
  stocks: FilamentStock[];
}

/**
 * Draft -> Printed. Validates, then deducts every declared usage in one shot.
 * If any single line fails, nothing is deducted (FR-014).
 */
export function markPrinted(
  lines: ProjectLine[],
  stocks: FilamentStock[],
): TransitionResult {
  const validation = validateUsage(lines, stocks);
  if (!validation.ok) {
    return { ok: false, violations: validation.violations, stocks: [] };
  }

  const next = stocks.map((s) => ({ ...s }));
  const byId = indexStocks(next);
  for (const line of lines) {
    const stock = byId.get(line.filamentId as string)!;
    stock.deductedQuantityG = roundGrams(
      stock.deductedQuantityG + line.estimatedUsageG,
    );
  }
  return { ok: true, violations: [], stocks: next };
}

/**
 * Printed -> Draft. Reverses the exact amounts that were deducted (FR-012).
 * Never lets a reversal push a spool above its declared total.
 */
export function revertToDraft(
  lines: ProjectLine[],
  stocks: FilamentStock[],
): TransitionResult {
  const next = stocks.map((s) => ({ ...s }));
  const byId = indexStocks(next);
  for (const line of lines) {
    if (line.filamentId === null) continue;
    const stock = byId.get(line.filamentId);
    if (!stock) continue;
    stock.deductedQuantityG = roundGrams(
      Math.max(0, stock.deductedQuantityG - line.estimatedUsageG),
    );
  }
  return { ok: true, violations: [], stocks: next };
}

/** Single entry point used by the API route, so both directions share one path. */
export function applyStatusChange(
  from: ProjectStatus,
  to: ProjectStatus,
  lines: ProjectLine[],
  stocks: FilamentStock[],
): TransitionResult {
  if (from === to) return { ok: true, violations: [], stocks };
  if (to === 'printed') return markPrinted(lines, stocks);
  return revertToDraft(lines, stocks);
}
