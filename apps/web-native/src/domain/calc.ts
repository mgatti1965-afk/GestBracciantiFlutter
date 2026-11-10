import type { CompensationInput, CompensationOutput } from './types';

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeCompensation(input: CompensationInput): CompensationOutput {
  const totalHours = clampNonNegative(input.totalHours);
  const extraThreshold = clampNonNegative(input.extraThreshold);
  const hourlyRate = clampNonNegative(input.hourlyRate);
  const extraHourlyRate = clampNonNegative(input.extraHourlyRate);
  const holidayHourlyRate = clampNonNegative(input.holidayHourlyRate);

  let ordinaryHours = 0;
  let extraHours = 0;
  let holidayHours = 0;

  if (input.isHoliday) {
    holidayHours = totalHours;
  } else {
    ordinaryHours = Math.min(totalHours, extraThreshold);
    extraHours = Math.max(totalHours - extraThreshold, 0);
  }

  const ordinaryAmount = round2(ordinaryHours * hourlyRate);
  const extraAmount = round2(extraHours * extraHourlyRate);
  const holidayAmount = round2(holidayHours * holidayHourlyRate);
  const totalAmount = round2(ordinaryAmount + extraAmount + holidayAmount);

  return {
    ordinaryHours: round2(ordinaryHours),
    extraHours: round2(extraHours),
    holidayHours: round2(holidayHours),
    ordinaryAmount,
    extraAmount,
    holidayAmount,
    totalAmount,
  };
}
