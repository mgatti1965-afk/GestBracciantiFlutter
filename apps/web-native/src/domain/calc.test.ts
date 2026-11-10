import { describe, expect, it } from 'vitest';
import { computeCompensation } from './calc';

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
});
