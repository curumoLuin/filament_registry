import { describe, expect, it } from 'vitest';
import {
  applyStatusChange,
  availableQuantityG,
  markPrinted,
  revertToDraft,
  roundGrams,
  validateUsage,
  type FilamentStock,
  type ProjectLine,
} from '../../src/lib/domain/inventory';

/**
 * Risks addressed — see context/foundation/test-plan.md
 *   R-01 inventory deduction inexact or drifting
 *   R-02 project printed while over-committed
 *   R-03 partial application of a multi-filament transition
 *   R-04 draft projects silently reserving quantity
 */

const spool = (
  id: string,
  name: string,
  initial: number,
  deducted = 0,
): FilamentStock => ({
  id,
  name,
  initialQuantityG: initial,
  deductedQuantityG: deducted,
});

const line = (
  filamentId: string | null,
  name: string,
  grams: number,
): ProjectLine => ({
  filamentId,
  filamentNameSnapshot: name,
  estimatedUsageG: grams,
});

describe('R-01 · deduction is exact', () => {
  it('deducts exactly the declared usage', () => {
    const stocks = [spool('f1', 'Prusament PLA', 1000)];
    const result = markPrinted([line('f1', 'Prusament PLA', 200)], stocks);

    expect(result.ok).toBe(true);
    expect(availableQuantityG(result.stocks[0]!)).toBe(800);
  });

  it('survives repeated printed/draft toggles without drift', () => {
    let stocks = [spool('f1', 'Prusament PLA', 1000)];
    const lines = [line('f1', 'Prusament PLA', 123.456)];

    for (let i = 0; i < 50; i++) {
      stocks = markPrinted(lines, stocks).stocks;
      stocks = revertToDraft(lines, stocks).stocks;
    }

    expect(stocks[0]!.deductedQuantityG).toBe(0);
    expect(availableQuantityG(stocks[0]!)).toBe(1000);
  });

  it('handles fractional grams without floating-point drift', () => {
    let stocks = [spool('f1', 'Fiberlogy PETG', 750)];
    for (const grams of [0.1, 0.2, 0.3]) {
      stocks = markPrinted([line('f1', 'Fiberlogy PETG', grams)], stocks).stocks;
    }
    // 0.1 + 0.2 + 0.3 is 0.6000000000000001 in raw IEEE-754.
    expect(stocks[0]!.deductedQuantityG).toBe(0.6);
    expect(availableQuantityG(stocks[0]!)).toBe(749.4);
  });

  it('rounds to milligram precision', () => {
    expect(roundGrams(0.1 + 0.2)).toBe(0.3);
    expect(roundGrams(1000 / 3)).toBe(333.333);
  });

  it('reverting never pushes a spool above its declared total', () => {
    const stocks = [spool('f1', 'Devil Design PLA', 500, 50)];
    const result = revertToDraft([line('f1', 'Devil Design PLA', 400)], stocks);

    expect(result.stocks[0]!.deductedQuantityG).toBe(0);
    expect(availableQuantityG(result.stocks[0]!)).toBe(500);
  });
});

describe('R-02 · the availability gate', () => {
  it('rejects marking printed when usage exceeds availability', () => {
    const stocks = [spool('f1', 'Prusament PLA', 1000, 900)];
    const result = markPrinted([line('f1', 'Prusament PLA', 200)], stocks);

    expect(result.ok).toBe(false);
    expect(result.violations[0]!.code).toBe('INSUFFICIENT_QUANTITY');
    expect(result.violations[0]!.availableG).toBe(100);
    expect(result.violations[0]!.requestedG).toBe(200);
  });

  it('allows usage exactly equal to the available quantity', () => {
    const stocks = [spool('f1', 'Prusament PLA', 1000, 800)];
    const result = markPrinted([line('f1', 'Prusament PLA', 200)], stocks);

    expect(result.ok).toBe(true);
    expect(availableQuantityG(result.stocks[0]!)).toBe(0);
  });

  it('re-validates at print time after another project consumed the spool', () => {
    // Passed validation when the project was created...
    const atCreation = [spool('f1', 'Prusament PLA', 1000)];
    expect(validateUsage([line('f1', 'Prusament PLA', 600)], atCreation).ok).toBe(true);

    // ...but a different project was printed in between (first-to-print wins).
    const atPrintTime = [spool('f1', 'Prusament PLA', 1000, 500)];
    const result = markPrinted([line('f1', 'Prusament PLA', 600)], atPrintTime);

    expect(result.ok).toBe(false);
    expect(result.violations[0]!.code).toBe('INSUFFICIENT_QUANTITY');
  });

  it('rejects a line whose filament was deleted from inventory', () => {
    const result = markPrinted([line(null, 'Deleted spool', 100)], []);

    expect(result.ok).toBe(false);
    expect(result.violations[0]!.code).toBe('FILAMENT_MISSING');
  });

  it('rejects zero and negative usage', () => {
    const stocks = [spool('f1', 'Prusament PLA', 1000)];
    expect(validateUsage([line('f1', 'Prusament PLA', 0)], stocks).violations[0]!.code)
      .toBe('NON_POSITIVE_USAGE');
    expect(validateUsage([line('f1', 'Prusament PLA', -5)], stocks).violations[0]!.code)
      .toBe('NON_POSITIVE_USAGE');
  });

  it('rejects a project with no filament lines', () => {
    expect(validateUsage([], []).violations[0]!.code).toBe('NO_LINES');
  });

  it('rejects the same filament listed twice instead of silently summing it', () => {
    const stocks = [spool('f1', 'Prusament PLA', 1000)];
    const result = validateUsage(
      [line('f1', 'Prusament PLA', 600), line('f1', 'Prusament PLA', 600)],
      stocks,
    );

    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === 'DUPLICATE_FILAMENT')).toBe(true);
  });

  it('does not count a printed project against itself when re-validated', () => {
    const stocks = [spool('f1', 'Prusament PLA', 1000, 600)];
    const own = [line('f1', 'Prusament PLA', 600)];

    expect(validateUsage(own, stocks).ok).toBe(false);
    expect(validateUsage(own, stocks, { excludeSelf: own }).ok).toBe(true);
  });
});

describe('R-03 · all-or-nothing transitions', () => {
  it('applies no deduction at all when one line of a multi-filament project fails', () => {
    const stocks = [
      spool('f1', 'Prusament PLA', 1000),
      spool('f2', 'Bambu PETG', 100),
      spool('f3', 'eSun ABS', 1000),
    ];
    const lines = [
      line('f1', 'Prusament PLA', 200), // fine
      line('f2', 'Bambu PETG', 500), // over budget
      line('f3', 'eSun ABS', 300), // fine
    ];

    const result = markPrinted(lines, stocks);

    expect(result.ok).toBe(false);
    expect(result.stocks).toEqual([]);
    // The originals are untouched — no partial state leaked out.
    expect(stocks.map((s) => s.deductedQuantityG)).toEqual([0, 0, 0]);
  });

  it('deducts every line when all of them pass', () => {
    const stocks = [
      spool('f1', 'Prusament PLA', 1000),
      spool('f2', 'Bambu PETG', 1000),
    ];
    const result = markPrinted(
      [line('f1', 'Prusament PLA', 200), line('f2', 'Bambu PETG', 350)],
      stocks,
    );

    expect(result.ok).toBe(true);
    expect(result.stocks.map(availableQuantityG)).toEqual([800, 650]);
  });

  it('never mutates the stocks it was given', () => {
    const stocks = [spool('f1', 'Prusament PLA', 1000)];
    markPrinted([line('f1', 'Prusament PLA', 200)], stocks);
    expect(stocks[0]!.deductedQuantityG).toBe(0);
  });
});

describe('R-04 · drafts do not reserve quantity', () => {
  it('draft projects do not reserve quantity', () => {
    const stocks = [spool('f1', 'Prusament PLA', 1000)];

    // Two drafts each declaring 600 g on the same 1000 g spool is allowed.
    expect(validateUsage([line('f1', 'Prusament PLA', 600)], stocks).ok).toBe(true);
    expect(validateUsage([line('f1', 'Prusament PLA', 600)], stocks).ok).toBe(true);
    expect(availableQuantityG(stocks[0]!)).toBe(1000);

    // First to print wins; the second is then rejected at print time.
    const afterFirst = markPrinted([line('f1', 'Prusament PLA', 600)], stocks);
    expect(afterFirst.ok).toBe(true);
    expect(markPrinted([line('f1', 'Prusament PLA', 600)], afterFirst.stocks).ok).toBe(false);
  });
});

describe('applyStatusChange · shared entry point', () => {
  it('deducts on draft -> printed', () => {
    const stocks = [spool('f1', 'Prusament PLA', 1000)];
    const result = applyStatusChange('draft', 'printed', [line('f1', 'Prusament PLA', 200)], stocks);
    expect(availableQuantityG(result.stocks[0]!)).toBe(800);
  });

  it('restores on printed -> draft', () => {
    const stocks = [spool('f1', 'Prusament PLA', 1000, 200)];
    const result = applyStatusChange('printed', 'draft', [line('f1', 'Prusament PLA', 200)], stocks);
    expect(availableQuantityG(result.stocks[0]!)).toBe(1000);
  });

  it('is a no-op when the status does not change', () => {
    const stocks = [spool('f1', 'Prusament PLA', 1000, 200)];
    const result = applyStatusChange('printed', 'printed', [line('f1', 'Prusament PLA', 200)], stocks);
    expect(result.stocks[0]!.deductedQuantityG).toBe(200);
  });
});
