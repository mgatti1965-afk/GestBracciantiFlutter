import { describe, expect, it } from 'vitest';
import { normalizeWorkerInput, sortWorkers } from './worker';

describe('worker domain', () => {
  it('normalizza nome e cognome', () => {
    const worker = normalizeWorkerInput({
      harvestYearId: 2026,
      name: '   mario',
      surname: ' roSSI ',
      phoneNumber: ' 3331234567 ',
    });

    expect(worker.name).toBe('Mario');
    expect(worker.surname).toBe('Rossi');
    expect(worker.phoneNumber).toBe('3331234567');
  });

  it('valida nome e cognome', () => {
    expect(() =>
      normalizeWorkerInput({
        harvestYearId: 2026,
        name: '',
        surname: 'Rossi',
      }),
    ).toThrow();
  });

  it('ordina per cognome e nome', () => {
    const result = sortWorkers([
      { id: 1, harvestYearId: 2026, name: 'Luca', surname: 'Verdi', phoneNumber: '', isArchived: false },
      { id: 2, harvestYearId: 2026, name: 'Anna', surname: 'Rossi', phoneNumber: '', isArchived: false },
      { id: 3, harvestYearId: 2026, name: 'Mario', surname: 'Rossi', phoneNumber: '', isArchived: false },
    ]);

    expect(result.map((w) => `${w.surname} ${w.name}`)).toEqual(['Rossi Anna', 'Rossi Mario', 'Verdi Luca']);
  });
});
