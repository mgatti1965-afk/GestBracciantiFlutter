import { describe, expect, it } from 'vitest';
import { createWorkLogDraft, sortLogsByDateDesc } from './workLog';

describe('workLog domain', () => {
  it('calcola importi su giorno feriale', () => {
    const log = createWorkLogDraft({
      workerId: 1,
      harvestYearId: 2026,
      dateIso: '2026-03-10',
      totalHours: 9,
      isManualHoliday: false,
      extraThreshold: 8,
      hourlyRate: 10,
      extraHourlyRate: 15,
      holidayHourlyRate: 20,
    });

    expect(log.ordinaryHours).toBe(8);
    expect(log.extraHours).toBe(1);
    expect(log.holidayHours).toBe(0);
    expect(log.totalAmount).toBe(95);
  });

  it('calcola importi su giorno festivo', () => {
    const log = createWorkLogDraft({
      workerId: 1,
      harvestYearId: 2026,
      dateIso: '2026-03-11',
      totalHours: 6,
      isManualHoliday: true,
      extraThreshold: 8,
      hourlyRate: 10,
      extraHourlyRate: 15,
      holidayHourlyRate: 20,
    });

    expect(log.ordinaryHours).toBe(0);
    expect(log.extraHours).toBe(0);
    expect(log.holidayHours).toBe(6);
    expect(log.totalAmount).toBe(120);
  });

  it('ordina i log per data desc', () => {
    const sorted = sortLogsByDateDesc([
      { id: 1, date: 100, workerId: 1, harvestYearId: 2026, morningStart: null, morningEnd: null, afternoonStart: null, afternoonEnd: null, totalHours: 1, ordinaryHours: 1, extraHours: 0, holidayHours: 0, hourlyRate: 1, extraHourlyRate: 1, holidayHourlyRate: 1, totalAmount: 1, ordinaryAmount: 1, extraAmount: 0, holidayAmount: 0, isManualHoliday: false },
      { id: 3, date: 200, workerId: 1, harvestYearId: 2026, morningStart: null, morningEnd: null, afternoonStart: null, afternoonEnd: null, totalHours: 1, ordinaryHours: 1, extraHours: 0, holidayHours: 0, hourlyRate: 1, extraHourlyRate: 1, holidayHourlyRate: 1, totalAmount: 1, ordinaryAmount: 1, extraAmount: 0, holidayAmount: 0, isManualHoliday: false },
      { id: 2, date: 200, workerId: 1, harvestYearId: 2026, morningStart: null, morningEnd: null, afternoonStart: null, afternoonEnd: null, totalHours: 1, ordinaryHours: 1, extraHours: 0, holidayHours: 0, hourlyRate: 1, extraHourlyRate: 1, holidayHourlyRate: 1, totalAmount: 1, ordinaryAmount: 1, extraAmount: 0, holidayAmount: 0, isManualHoliday: false },
    ]);

    expect(sorted.map((x) => x.id)).toEqual([3, 2, 1]);
  });

  it('rifiuta date di calendario inesistenti', () => {
    expect(() =>
      createWorkLogDraft({
        workerId: 1,
        harvestYearId: 2026,
        dateIso: '2026-02-31',
        totalHours: 8,
        isManualHoliday: false,
        extraThreshold: 8,
        hourlyRate: 10,
        extraHourlyRate: 15,
        holidayHourlyRate: 20,
      }),
    ).toThrow(/Data non valida/i);
  });

  it('mantiene coerenza tra ore arrotondate e calcolo compenso', () => {
    const log = createWorkLogDraft({
      workerId: 1,
      harvestYearId: 2026,
      dateIso: '2026-03-10',
      totalHours: 8 + 1 / 3,
      isManualHoliday: false,
      extraThreshold: 8,
      hourlyRate: 10,
      extraHourlyRate: 15,
      holidayHourlyRate: 20,
    });

    expect(log.totalHours).toBe(8.33);
    expect(log.ordinaryHours).toBe(8);
    expect(log.extraHours).toBe(0.33);
    expect(log.ordinaryAmount).toBe(80);
    expect(log.extraAmount).toBe(4.95);
    expect(log.totalAmount).toBe(84.95);
  });
});
