import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { exportCsvDataset, importCsvDataset } from './csvCompat';
import type { CsvDataset } from './csvCompat';

function readFixture(name: string): string {
  return readFileSync(join(__dirname, '..', '..', '..', '..', 'shared', 'test-fixtures', 'csv', name), 'utf-8');
}

function listRealAnonymizedFixtures(): string[] {
  const folder = join(__dirname, '..', '..', '..', '..', 'shared', 'test-fixtures', 'csv', 'real-anonymized');
  try {
    return readdirSync(folder)
      .filter((file) => file.toLowerCase().endsWith('.csv'))
      .sort((a, b) => a.localeCompare(b, 'it'));
  } catch {
    return [];
  }
}

function toRegressionShape(dataset: CsvDataset) {
  return {
    years: dataset.years
      .map((y) => ({ id: y.id, isCurrent: y.isCurrent, notes: y.notes }))
      .sort((a, b) => a.id - b.id),
    workers: dataset.workers
      .map((w) => ({
        id: w.id,
        harvestYearId: w.harvestYearId,
        name: w.name,
        surname: w.surname,
        phoneNumber: w.phoneNumber,
        isArchived: w.isArchived,
      }))
      .sort((a, b) => a.id - b.id),
    logs: dataset.logs
      .map((l) => ({
        id: l.id,
        workerId: l.workerId,
        harvestYearId: l.harvestYearId,
        date: l.date,
        totalHours: l.totalHours,
        ordinaryHours: l.ordinaryHours,
        extraHours: l.extraHours,
        holidayHours: l.holidayHours,
        hourlyRate: l.hourlyRate,
        extraHourlyRate: l.extraHourlyRate,
        holidayHourlyRate: l.holidayHourlyRate,
        totalAmount: l.totalAmount,
        isManualHoliday: l.isManualHoliday,
      }))
      .sort((a, b) => a.id - b.id),
  };
}

describe('csvCompat', () => {
  it('esporta e reimporta il formato canonico', () => {
    const dataset: CsvDataset = {
      years: [
        { id: 2025, isCurrent: true, notes: 'Vendemmia test' },
      ],
      workers: [
        {
          id: 11,
          harvestYearId: 2025,
          name: 'Mario',
          surname: 'Rossi',
          phoneNumber: '333000111',
          isArchived: false,
        },
      ],
      logs: [
        {
          id: 77,
          workerId: 11,
          harvestYearId: 2025,
          date: new Date(2025, 8, 14).getTime(),
          morningStart: null,
          morningEnd: null,
          afternoonStart: null,
          afternoonEnd: null,
          totalHours: 10,
          ordinaryHours: 8,
          extraHours: 2,
          holidayHours: 0,
          hourlyRate: 9.5,
          extraHourlyRate: 12,
          holidayHourlyRate: 14,
          totalAmount: 100,
          ordinaryAmount: 76,
          extraAmount: 24,
          holidayAmount: 0,
          isManualHoliday: false,
        },
      ],
    };

    const csv = exportCsvDataset(dataset);
    const parsed = importCsvDataset(csv);

    expect(parsed.years).toHaveLength(1);
    expect(parsed.workers).toHaveLength(1);
    expect(parsed.logs).toHaveLength(1);

    expect(parsed.years[0]).toEqual(dataset.years[0]);
    expect(parsed.workers[0]).toEqual(dataset.workers[0]);
    expect(parsed.logs[0].id).toBe(77);
    expect(parsed.logs[0].totalAmount).toBe(100);
  });

  it('export canonico include colonna descrizione tipologia in chiaro', () => {
    const dataset: CsvDataset = {
      years: [{ id: 2025, isCurrent: true, notes: '' }],
      workers: [{ id: 11, harvestYearId: 2025, name: 'Mario', surname: 'Rossi', phoneNumber: '', isArchived: false }],
      logs: [
        {
          id: 77,
          workerId: 11,
          harvestYearId: 2025,
          date: new Date(2025, 8, 14).getTime(),
          morningStart: null,
          morningEnd: null,
          afternoonStart: null,
          afternoonEnd: null,
          totalHours: 8,
          ordinaryHours: 8,
          extraHours: 0,
          holidayHours: 0,
          hourlyRate: 10,
          extraHourlyRate: 12,
          holidayHourlyRate: 14,
          totalAmount: 80,
          ordinaryAmount: 80,
          extraAmount: 0,
          holidayAmount: 0,
          isManualHoliday: false,
        },
      ],
    };

    const csv = exportCsvDataset(dataset).trim().split('\n');
    expect(csv[1]).toContain('entityDescription');
    expect(csv[2]).toMatch(/;Annata$/);
    expect(csv[3]).toMatch(/;Bracciante$/);
    expect(csv[4]).toMatch(/;Log giornaliero$/);
  });

  it('importa il formato legacy per log giornalieri', () => {
    const legacy = [
      'annata;data;cognome;nome;oreTotali;festivo;sogliaExtra;tariffaOrd;tariffaStraord;tariffaFestiva;telefono;archiviato',
      '2026;2026-09-20;Verdi;Anna;9;0;8;10;13;16;333111222;0',
      '2026;2026-09-21;Verdi;Anna;8;1;8;10;13;16;333111222;0',
    ].join('\n');

    const parsed = importCsvDataset(legacy);

    expect(parsed.years).toHaveLength(1);
    expect(parsed.years[0].id).toBe(2026);
    expect(parsed.workers).toHaveLength(1);
    expect(parsed.workers[0].surname).toBe('Verdi');
    expect(parsed.logs).toHaveLength(2);

    const first = parsed.logs[0];
    const second = parsed.logs[1];

    expect(first.totalHours).toBe(9);
    expect(first.ordinaryHours).toBe(8);
    expect(first.extraHours).toBe(1);
    expect(second.holidayHours).toBe(8);
    expect(second.ordinaryHours).toBe(0);
  });

  it('accetta il delimitatore virgola nel formato canonico', () => {
    const csv = [
      '#GestBracciantiCSV;1',
      'entity,id,harvestYearId,isCurrent,notes,name,surname,phoneNumber,isArchived,workerId,date,morningStart,morningEnd,afternoonStart,afternoonEnd,totalHours,ordinaryHours,extraHours,holidayHours,hourlyRate,extraHourlyRate,holidayHourlyRate,totalAmount,ordinaryAmount,extraAmount,holidayAmount,isManualHoliday',
      'YEAR,2024,,1,Annata 2024,,,,,,,,,,,,,,,,,,,,,,',
    ].join('\n');

    const parsed = importCsvDataset(csv);
    expect(parsed.years).toHaveLength(1);
    expect(parsed.years[0].id).toBe(2024);
    expect(parsed.years[0].isCurrent).toBe(true);
  });

  it('valida fixture canonica ufficiale', () => {
    const csv = readFixture('canonical-valid.csv');
    const parsed = importCsvDataset(csv);

    expect(parsed.years).toHaveLength(2);
    expect(parsed.workers).toHaveLength(3);
    expect(parsed.logs).toHaveLength(3);

    const current = parsed.years.find((y) => y.isCurrent);
    expect(current?.id).toBe(2025);
    expect(parsed.logs.some((l) => l.id === 9002 && l.isManualHoliday)).toBe(true);
  });

  it('valida fixture legacy ufficiale', () => {
    const csv = readFixture('legacy-valid.csv');
    const parsed = importCsvDataset(csv);

    expect(parsed.years).toHaveLength(1);
    expect(parsed.workers).toHaveLength(2);
    expect(parsed.logs).toHaveLength(3);

    const holidayLog = parsed.logs.find((l) => l.isManualHoliday);
    expect(holidayLog?.holidayHours).toBe(8);
  });

  it('rifiuta fixture canonica non valida con riferimenti incoerenti', () => {
    const csv = readFixture('canonical-invalid-missing-worker.csv');
    expect(() => importCsvDataset(csv)).toThrow(/bracciante mancante/i);
  });

  it('normalizza fixture canonica con due annate correnti', () => {
    const csv = readFixture('canonical-multi-current.csv');
    const parsed = importCsvDataset(csv);

    expect(parsed.years).toHaveLength(2);
    expect(parsed.years.filter((y) => y.isCurrent)).toHaveLength(1);
    expect(parsed.years.find((y) => y.isCurrent)?.id).toBe(2030);
  });

  it('importa fixture legacy con campi quotati e separatori interni', () => {
    const csv = readFixture('legacy-quoted-fields.csv');
    const parsed = importCsvDataset(csv);

    expect(parsed.years).toHaveLength(1);
    expect(parsed.workers).toHaveLength(1);
    expect(parsed.logs).toHaveLength(1);

    expect(parsed.workers[0].surname).toBe('De; Luca');
    expect(parsed.workers[0].name).toBe('Maria, Pia');
    expect(parsed.logs[0].totalHours).toBe(8.5);
    expect(parsed.logs[0].hourlyRate).toBe(10.5);
    expect(parsed.logs[0].extraHourlyRate).toBe(13.25);
  });

  it('smoke round-trip su fixture canonica ufficiale', () => {
    const source = importCsvDataset(readFixture('canonical-valid.csv'));
    const exported = exportCsvDataset(source);
    const reparsed = importCsvDataset(exported);

    expect(reparsed.years).toEqual(source.years);
    expect(reparsed.workers).toEqual(source.workers);
    expect(reparsed.logs).toEqual(source.logs);
  });

  it('importa fixture canonica quasi-produzione con note speciali e log non ordinati', () => {
    const parsed = importCsvDataset(readFixture('canonical-production-sample.csv'));

    expect(parsed.years).toHaveLength(1);
    expect(parsed.workers).toHaveLength(2);
    expect(parsed.logs).toHaveLength(3);

    expect(parsed.years[0].notes).toBe('Vendemmia "A"; blocco Nord, Lotto 7');
    expect(parsed.workers.find((w) => w.id === 401)?.phoneNumber).toBe('');
    expect(parsed.logs.map((l) => l.id)).toEqual([9402, 9401, 9403]);
    expect(parsed.logs.find((l) => l.id === 9403)?.isManualHoliday).toBe(true);
  });

  it('importa fixture legacy con alias header e numeri misti', () => {
    const parsed = importCsvDataset(readFixture('legacy-aliases-and-mixed-numbers.csv'));

    expect(parsed.years).toHaveLength(1);
    expect(parsed.years[0].id).toBe(2032);
    expect(parsed.workers).toHaveLength(1);
    expect(parsed.logs).toHaveLength(2);

    expect(parsed.logs[0].totalHours).toBe(8.25);
    expect(parsed.logs[0].hourlyRate).toBe(10.5);
    expect(parsed.logs[1].holidayHours).toBe(8);
  });

  it('snapshot regressione parser su fixture canonica quasi-produzione', () => {
    const parsed = importCsvDataset(readFixture('canonical-production-sample.csv'));
    expect(toRegressionShape(parsed)).toMatchInlineSnapshot(`
      {
        "logs": [
          {
            "date": 1946764800000,
            "extraHourlyRate": 13,
            "extraHours": 0,
            "harvestYearId": 2031,
            "holidayHourlyRate": 16,
            "holidayHours": 0,
            "hourlyRate": 10,
            "id": 9401,
            "isManualHoliday": false,
            "ordinaryHours": 7.5,
            "totalAmount": 75,
            "totalHours": 7.5,
            "workerId": 401,
          },
          {
            "date": 1946937600000,
            "extraHourlyRate": 13,
            "extraHours": 1,
            "harvestYearId": 2031,
            "holidayHourlyRate": 16,
            "holidayHours": 0,
            "hourlyRate": 10,
            "id": 9402,
            "isManualHoliday": false,
            "ordinaryHours": 8,
            "totalAmount": 93,
            "totalHours": 9,
            "workerId": 402,
          },
          {
            "date": 1946851200000,
            "extraHourlyRate": 13,
            "extraHours": 0,
            "harvestYearId": 2031,
            "holidayHourlyRate": 16,
            "holidayHours": 8,
            "hourlyRate": 10,
            "id": 9403,
            "isManualHoliday": true,
            "ordinaryHours": 0,
            "totalAmount": 128,
            "totalHours": 8,
            "workerId": 402,
          },
        ],
        "workers": [
          {
            "harvestYearId": 2031,
            "id": 401,
            "isArchived": false,
            "name": "Paolo",
            "phoneNumber": "",
            "surname": "Riva",
          },
          {
            "harvestYearId": 2031,
            "id": 402,
            "isArchived": false,
            "name": "Giada",
            "phoneNumber": "333555777",
            "surname": "Marini",
          },
        ],
        "years": [
          {
            "id": 2031,
            "isCurrent": true,
            "notes": "Vendemmia "A"; blocco Nord, Lotto 7",
          },
        ],
      }
    `);
  });

  it('snapshot regressione parser su fixture legacy alias/mixed numbers', () => {
    const parsed = importCsvDataset(readFixture('legacy-aliases-and-mixed-numbers.csv'));
    expect(toRegressionShape(parsed)).toMatchInlineSnapshot(`
      {
        "logs": [
          {
            "date": 1976565600000,
            "extraHourlyRate": 13,
            "extraHours": 0.25,
            "harvestYearId": 2032,
            "holidayHourlyRate": 16,
            "holidayHours": 0,
            "hourlyRate": 10.5,
            "id": 1,
            "isManualHoliday": false,
            "ordinaryHours": 8,
            "totalAmount": 87.25,
            "totalHours": 8.25,
            "workerId": 1,
          },
          {
            "date": 1976652000000,
            "extraHourlyRate": 13,
            "extraHours": 0,
            "harvestYearId": 2032,
            "holidayHourlyRate": 16,
            "holidayHours": 8,
            "hourlyRate": 10.5,
            "id": 2,
            "isManualHoliday": true,
            "ordinaryHours": 0,
            "totalAmount": 128,
            "totalHours": 8,
            "workerId": 1,
          },
        ],
        "workers": [
          {
            "harvestYearId": 2032,
            "id": 1,
            "isArchived": false,
            "name": "Alberto",
            "phoneNumber": "333900100",
            "surname": "Neri",
          },
        ],
        "years": [
          {
            "id": 2032,
            "isCurrent": true,
            "notes": "",
          },
        ],
      }
    `);
  });

  const realAnonymizedFixtures = listRealAnonymizedFixtures();

  if (realAnonymizedFixtures.length === 0) {
    it.skip('snapshot regressione su campioni reali anonimizzati (nessun file presente)', () => {
      // Placeholder intenzionale: abilita il test appena sono presenti file in shared/test-fixtures/csv/real-anonymized.
    });
  }

  for (const fileName of realAnonymizedFixtures) {
    it(`snapshot regressione campione reale anonimizzato: ${fileName}`, () => {
      const csv = readFileSync(
        join(__dirname, '..', '..', '..', '..', 'shared', 'test-fixtures', 'csv', 'real-anonymized', fileName),
        'utf-8',
      );
      const parsed = importCsvDataset(csv);
      expect(toRegressionShape(parsed)).toMatchSnapshot();
    });
  }
});
