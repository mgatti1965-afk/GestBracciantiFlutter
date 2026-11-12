import { describe, expect, it } from 'vitest';
import {
  computeWorkLogFromShifts,
  DEFAULT_OWNER_SETTINGS,
  findDuplicateWorkerGroups,
  recalculateWorkLog,
} from './models';

describe('domain models', () => {
  it('calcola un log completo da turni mattina e pomeriggio con festivo automatico', () => {
    const sunday = new Date(2026, 8, 13).getTime(); // 13 Sep 2026 = Sunday
    const log = computeWorkLogFromShifts({
      workerId: 1,
      harvestYearId: 2026,
      date: sunday,
      morningStart: '08:00',
      morningEnd: '12:00',
      afternoonStart: '13:00',
      afternoonEnd: '17:30',
      hourlyRate: 10,
      extraHourlyRate: 13,
      holidayHourlyRate: 16,
      isManualHoliday: false,
      settings: DEFAULT_OWNER_SETTINGS,
    });

    expect(log.totalHours).toBe(8.5);
    expect(log.holidayHours).toBe(8.5);
    expect(log.ordinaryHours).toBe(0);
    expect(log.totalAmount).toBe(136);

    const toggled = recalculateWorkLog(
      { ...log, id: 1, isManualHoliday: true },
      DEFAULT_OWNER_SETTINGS,
    );
    expect(toggled.holidayHours).toBe(0);
    expect(toggled.ordinaryHours).toBe(8);
    expect(toggled.extraHours).toBe(0.5);
    expect(toggled.totalAmount).toBe(86.5);
  });

  it('rileva gruppi di braccianti duplicati per cognome+nome', () => {
    const groups = findDuplicateWorkerGroups([
      { id: 7, name: 'Matteo', surname: 'Gallina', phoneNumber: '123', isArchived: false },
      { id: 15, name: 'matteo', surname: 'gallina', phoneNumber: '123', isArchived: false },
      { id: 2, name: 'Mario', surname: 'Rossi', phoneNumber: '', isArchived: false },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].map((w) => w.id)).toEqual([7, 15]);
  });
});
