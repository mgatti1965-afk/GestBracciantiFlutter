import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  exportAndroidBackupCsv,
  extractBackupHeaderDate,
  formatBackupHeaderDate,
  importFullBackupCsv,
  parseBackupHeaderDate,
  type FullBackupDataset,
} from './backupCsv';

describe('backupCsv Android compatibility', () => {
  it('scrive la prima riga con data+ora e la reimporta correttamente', () => {
    const fixedDate = new Date(2026, 10, 13, 8, 30, 0); // 2026-11-13 08:30:00
    const dataset: FullBackupDataset = {
      settings: {
        ownerName: 'Mario',
        ownerSurname: 'Rossi',
        extraHoursThreshold: 8,
        festiveDaysType: 3,
        globalFestiveDates: [],
        saveCountSinceBackup: 0,
        lastImportDate: null,
        lastMutationDate: 0,
        lastExportDate: null,
        googleDriveClientId: '',
      },
      years: [{ id: 2026, isCurrent: true, notes: '' }],
      workers: [{ id: 1, surname: 'Rossi', name: 'Mario', phoneNumber: '', isArchived: false }],
      configs: [{ workerId: 1, harvestYearId: 2026, hourlyRate: 10, extraHourlyRate: 12, holidayHourlyRate: 15 }],
      groups: [],
      groupMembers: [],
      plantations: [],
      logs: [],
    };

    const csv = exportAndroidBackupCsv(dataset, fixedDate);
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toBe('# GESTBRACCIANTI_BKP;2026-11-13 08:30:00');

    expect(extractBackupHeaderDate(csv)).toBe('2026-11-13 08:30:00');
    expect(parseBackupHeaderDate('2026-11-13 08:30:00')).toBe(fixedDate.getTime());

    const imported = importFullBackupCsv(csv);
    expect(imported.backupHeaderDate).toBe('2026-11-13 08:30:00');
    expect(imported.workers).toHaveLength(1);
    expect(imported.years).toHaveLength(1);
  });

  it('esporta e reimporta il formato completo S/W/Y/C/L/G/X', () => {
    const dataset: FullBackupDataset = {
      settings: {
        ownerName: 'Marco',
        ownerSurname: 'Gatti',
        extraHoursThreshold: 8,
        festiveDaysType: 3,
        globalFestiveDates: [],
        saveCountSinceBackup: 0,
        lastImportDate: null,
        lastMutationDate: 0,
        lastExportDate: null,
        googleDriveClientId: '',
      },
      years: [{ id: 2026, isCurrent: true, notes: 'Vendemmia\nLotto 1' }],
      workers: [
        { id: 1, surname: 'Rossi', name: 'Mario', phoneNumber: '333111222', isArchived: false },
        { id: 2, surname: 'Bianchi', name: 'Luca', phoneNumber: '', isArchived: false },
      ],
      configs: [
        { workerId: 1, harvestYearId: 2026, hourlyRate: 10, extraHourlyRate: 13, holidayHourlyRate: 16 },
        { workerId: 2, harvestYearId: 2026, hourlyRate: 9.5, extraHourlyRate: 12, holidayHourlyRate: 15 },
      ],
      groups: [{ id: 10, name: 'Squadra Raccolta', yearId: 2026 }],
      groupMembers: [
        { groupId: 10, workerId: 1 },
        { groupId: 10, workerId: 2 },
      ],
      plantations: [],
      logs: [
        {
          id: 1,
          workerId: 1,
          harvestYearId: 2026,
          date: new Date(2026, 8, 10).getTime(),
          morningStart: '08:00',
          morningEnd: '12:00',
          afternoonStart: '13:00',
          afternoonEnd: '18:00',
          totalHours: 9,
          ordinaryHours: 8,
          extraHours: 1,
          holidayHours: 0,
          hourlyRate: 10,
          extraHourlyRate: 13,
          holidayHourlyRate: 16,
          totalAmount: 93,
          ordinaryAmount: 80,
          extraAmount: 13,
          holidayAmount: 0,
          isManualHoliday: false,
        },
      ],
    };

    const csv = exportAndroidBackupCsv(dataset);
    const parsed = importFullBackupCsv(csv);

    expect(parsed.settings.ownerName).toBe('Marco');
    expect(parsed.settings.ownerSurname).toBe('Gatti');
    expect(parsed.years[0].notes).toBe('Vendemmia\nLotto 1');
    expect(parsed.workers).toHaveLength(2);
    expect(parsed.configs).toHaveLength(2);
    expect(parsed.groups).toEqual([{ id: 10, name: 'Squadra Raccolta', yearId: 2026 }]);
    expect(parsed.groupMembers).toHaveLength(2);
    expect(parsed.logs[0].morningStart).toBe('08:00');
    expect(parsed.logs[0].extraHours).toBe(1);
    expect(parsed.logs[0].totalAmount).toBe(93);
  });

  it('importa il backup reale anonimizzato completo di gruppi e appartenenze G/X', () => {
    const csv = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'shared',
        'test-fixtures',
        'csv',
        'real-anonymized',
        'GestBraccianti_Bkp_20260823_1310.csv',
      ),
      'utf-8',
    );

    const parsed = importFullBackupCsv(csv);
    expect(parsed.years).toHaveLength(1);
    expect(parsed.years[0].id).toBe(2026);
    expect(parsed.workers).toHaveLength(15);
    expect(parsed.configs).toHaveLength(15);
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups.map((g) => g.name)).toEqual(['ditta strusia', 'vendemmia 2026']);
    expect(parsed.groupMembers).toHaveLength(12);
    expect(parsed.logs.length).toBeGreaterThan(50);
  });

  it('supporta anche l importazione di CSV canonici #GestBracciantiCSV;1', () => {
    const canonical = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'shared', 'test-fixtures', 'csv', 'canonical-valid.csv'),
      'utf-8',
    );
    const parsed = importFullBackupCsv(canonical);
    expect(parsed.years).toHaveLength(2);
    expect(parsed.workers).toHaveLength(3);
    expect(parsed.configs).toHaveLength(3);
    expect(parsed.logs).toHaveLength(3);
  });
});
