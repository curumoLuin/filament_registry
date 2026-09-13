import { describe, expect, it } from 'vitest';
import {
  aggregateParameters,
  extractParametersFromText,
  isPlausible,
  type FilamentParameterBlock,
  type PrintParameters,
} from '../../src/lib/domain/parameters';

/**
 * Risks addressed — see context/foundation/test-plan.md
 *   R-05 implausible parsed value reaching the saved filament
 *   R-06 conflicting parameters presented as if they agreed
 */

const PRUSAMENT_PLA = `
Prusament PLA Galaxy Black
Material: PLA
Nozzle temperature: 215 °C
Bed temperature: 60 °C
Print speed: 60 mm/s
Flow rate: 95 %
Cooling: 100 %
Spool weight: 1 kg
`;

const RANGE_DATASHEET = `
Fiberlogy PETG
Printing temperature: 220-250°C
Heated bed: 80 - 90 °C
Speed: 30-60 mm/s
`;

const POLISH_DATASHEET = `
Devil Design PLA
Temperatura dyszy: 200-220 °C
Temperatura stołu: 60 °C
Prędkość druku: 50 mm/s
Chłodzenie: 100%
`;

describe('R-05 · the parser never saves an implausible value', () => {
  it('extracts the five parameters from a well-formed datasheet', () => {
    const result = extractParametersFromText(PRUSAMENT_PLA);

    expect(result.parameters).toEqual<PrintParameters>({
      nozzleTempC: 215,
      bedTempC: 60,
      printSpeedMms: 60,
      flowRatePct: 95,
      coolingPct: 100,
    });
    expect(result.missing).toEqual([]);
    expect(result.source).toBe('rules');
  });

  it('rejects implausible values instead of saving them', () => {
    const nonsense = `
      Nozzle temperature: 2100 °C
      Bed temperature: -40 °C
      Print speed: 99999 mm/s
      Flow rate: 900 %
      Cooling: 400 %
    `;
    const result = extractParametersFromText(nonsense);

    expect(result.parameters).toEqual<PrintParameters>({
      nozzleTempC: null,
      bedTempC: null,
      printSpeedMms: null,
      flowRatePct: null,
      coolingPct: null,
    });
    expect(result.found).toEqual([]);
    expect(result.missing).toHaveLength(5);
  });

  it('guards each parameter with its own plausible range', () => {
    expect(isPlausible('nozzleTempC', 215)).toBe(true);
    expect(isPlausible('nozzleTempC', 21)).toBe(false);
    expect(isPlausible('bedTempC', 60)).toBe(true);
    expect(isPlausible('bedTempC', 400)).toBe(false);
    expect(isPlausible('coolingPct', 100)).toBe(true);
    expect(isPlausible('coolingPct', 101)).toBe(false);
  });

  it('takes the midpoint of a quoted range', () => {
    const result = extractParametersFromText(RANGE_DATASHEET);

    expect(result.parameters.nozzleTempC).toBe(235);
    expect(result.parameters.bedTempC).toBe(85);
    expect(result.parameters.printSpeedMms).toBe(45);
  });

  it('reads Polish-language datasheets', () => {
    const result = extractParametersFromText(POLISH_DATASHEET);

    expect(result.parameters.nozzleTempC).toBe(210);
    expect(result.parameters.bedTempC).toBe(60);
    expect(result.parameters.printSpeedMms).toBe(50);
    expect(result.parameters.coolingPct).toBe(100);
  });

  it('reports what it could not read rather than guessing', () => {
    const result = extractParametersFromText('Nozzle temperature: 240 °C');

    expect(result.found).toEqual(['nozzleTempC']);
    expect(result.missing).toContain('flowRatePct');
    expect(result.parameters.flowRatePct).toBeNull();
  });

  it('returns an empty result for text with no parameters at all', () => {
    const result = extractParametersFromText('Shipping is free above 200 PLN.');
    expect(result.found).toEqual([]);
  });

  it('suggests manufacturer and material when it recognises them', () => {
    const result = extractParametersFromText(PRUSAMENT_PLA);

    expect(result.suggestedManufacturer).toBe('Prusament');
    expect(result.suggestedMaterial).toBe('PLA');
    expect(result.suggestedName).toBe('Prusament PLA');
  });
});

describe('R-06 · conflicting parameters are surfaced, not merged', () => {
  const block = (
    name: string,
    parameters: Partial<PrintParameters>,
  ): FilamentParameterBlock => ({
    filamentId: name,
    filamentName: name,
    parameters: {
      nozzleTempC: null,
      bedTempC: null,
      printSpeedMms: null,
      flowRatePct: null,
      coolingPct: null,
      ...parameters,
    },
  });

  it('flags parameters that disagree across filaments', () => {
    const { conflicts } = aggregateParameters([
      block('Prusament PLA', { nozzleTempC: 215, bedTempC: 60 }),
      block('Fiberlogy PETG', { nozzleTempC: 240, bedTempC: 85 }),
    ]);

    expect(conflicts.map((c) => c.key).sort()).toEqual(['bedTempC', 'nozzleTempC']);
    const nozzle = conflicts.find((c) => c.key === 'nozzleTempC')!;
    expect(nozzle.spread).toBe(25);
    expect(nozzle.values).toHaveLength(2);
  });

  it('reports no conflict when every filament agrees', () => {
    const { conflicts } = aggregateParameters([
      block('Prusament PLA', { nozzleTempC: 215 }),
      block('Devil Design PLA', { nozzleTempC: 215 }),
    ]);

    expect(conflicts).toEqual([]);
  });

  it('reports no conflict for a single-filament project', () => {
    const { blocks, conflicts } = aggregateParameters([
      block('Prusament PLA', { nozzleTempC: 215 }),
    ]);

    expect(blocks).toHaveLength(1);
    expect(conflicts).toEqual([]);
  });

  it('ignores parameters only one filament defines', () => {
    const { conflicts } = aggregateParameters([
      block('Prusament PLA', { nozzleTempC: 215, coolingPct: 100 }),
      block('eSun ABS', { nozzleTempC: 215 }),
    ]);

    expect(conflicts).toEqual([]);
  });

  it('keeps per-filament identity in the blocks it returns', () => {
    const { blocks } = aggregateParameters([
      block('Prusament PLA', { nozzleTempC: 215 }),
      block('Fiberlogy PETG', { nozzleTempC: 240 }),
    ]);

    expect(blocks.map((b) => b.filamentName)).toEqual(['Prusament PLA', 'Fiberlogy PETG']);
  });
});
