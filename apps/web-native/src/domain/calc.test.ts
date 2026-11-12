import { describe, expect, it } from 'vitest';
import {
  calculateShiftHours,
  computeCompensation,
  formatHoursLabel,
  isDateFestive,
} from './calc';

describe('computeCompensation', () => {
  it('applica R1 e R3 su giorno feriale', () => {
    const result = computeCompensation({
      totalHours: 10,
      extraThreshold: 8,
      isHoliday: false,
      hourlyRate: 9,
      extraHourlyRate: 12,
      holidayHourlyRate: 20,
    });

    expect(result.ordinaryHours).toBe(8);
    expect(result.extraHours).toBe(2);
    expect(result.holidayHours).toBe(0);
    expect(result.ordinaryAmount).toBe(72);
    expect(result.extraAmount).toBe(24);
    expect(result.holidayAmount).toBe(0);
    expect(result.totalAmount).toBe(96);
  });

  it('applica R2 su giorno festivo', () => {
    const result = computeCompensation({
      totalHours: 7.5,
      extraThreshold: 8,
      isHoliday: true,
      hourlyRate: 9,
      extraHourlyRate: 12,
      holidayHourlyRate: 15,
    });

    expect(result.ordinaryHours).toBe(0);
    expect(result.extraHours).toBe(0);
    expect(result.holidayHours).toBe(7.5);
    expect(result.ordinaryAmount).toBe(0);
    expect(result.extraAmount).toBe(0);
    expect(result.holidayAmount).toBe(112.5);
    expect(result.totalAmount).toBe(112.5);
  });

  it('applica R4 calendario festivi settimanali e override manuale', () => {
    const saturday = new Date(2024, 4, 18).getTime();
    const sunday = new Date(2024, 4, 19).getTime();
    const monday = new Date(2024, 4, 20).getTime();

    expect(isDateFestive(saturday, false, 0)).toBe(false);
    expect(isDateFestive(sunday, false, 0)).toBe(false);
    expect(isDateFestive(saturday, false, 1)).toBe(true);
    expect(isDateFestive(sunday, false, 1)).toBe(false);
    expect(isDateFestive(saturday, false, 2)).toBe(false);
    expect(isDateFestive(sunday, false, 2)).toBe(true);
    expect(isDateFestive(saturday, false, 3)).toBe(true);
    expect(isDateFestive(sunday, false, 3)).toBe(true);
    expect(isDateFestive(monday, false, 3)).toBe(false);

    // Override manuale inverte lo stato naturale
    expect(isDateFestive(monday, true, 3)).toBe(true);
    expect(isDateFestive(sunday, true, 3)).toBe(false);
    expect(isDateFestive(monday, false, 3, new Set([monday]))).toBe(true);
  });

  it('calcola ore da fasce mattina/pomeriggio e formatta etichette', () => {
    expect(calculateShiftHours('08:00', '12:00', '13:00', '17:30')).toBe(8.5);
    expect(calculateShiftHours('08:00', '07:00', '13:00', '17:00')).toBe(4);
    expect(formatHoursLabel(8.5)).toBe("8h 30'");
    expect(formatHoursLabel(8.75)).toBe("8h 45'");
  });
});
