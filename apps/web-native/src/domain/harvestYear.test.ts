import { describe, expect, it } from 'vitest';
import { ensureSingleCurrent, normalizeYearInput, sortYearsDesc } from './harvestYear';

describe('harvestYear domain', () => {
  it('normalizza input valido', () => {
    const year = normalizeYearInput({ id: 2026, notes: '  Vendemmia  ' });
    expect(year.id).toBe(2026);
    expect(year.isCurrent).toBe(false);
    expect(year.notes).toBe('Vendemmia');
  });

  it('rifiuta anno fuori range', () => {
    expect(() => normalizeYearInput({ id: 1800 })).toThrow();
  });

  it('ordina le annate in ordine decrescente', () => {
    const years = sortYearsDesc([
      { id: 2024, isCurrent: false, notes: '' },
      { id: 2026, isCurrent: false, notes: '' },
      { id: 2025, isCurrent: true, notes: '' },
    ]);

    expect(years.map((y) => y.id)).toEqual([2026, 2025, 2024]);
  });

  it('garantisce una sola annata corrente', () => {
    const years = ensureSingleCurrent(
      [
        { id: 2025, isCurrent: false, notes: '' },
        { id: 2026, isCurrent: false, notes: '' },
      ],
      2026,
    );

    expect(years.find((y) => y.id === 2025)?.isCurrent).toBe(false);
    expect(years.find((y) => y.id === 2026)?.isCurrent).toBe(true);
  });
});
