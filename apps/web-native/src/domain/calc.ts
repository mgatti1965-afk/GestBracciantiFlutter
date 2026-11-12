import type { CompensationInput, CompensationOutput } from './types';

export type FestiveDaysType = 0 | 1 | 2 | 3;

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function round2(value: number): number {
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

/**
 * Determines whether a local-midnight date timestamp is festive according to Android TimeUtils.isFestive:
 * manual per-log or global per-date override inverts the natural weekly holiday configuration.
 */
export function isDateFestive(
  dateMillis: number,
  isManual: boolean,
  festiveType: FestiveDaysType,
  globalFestiveDates?: ReadonlySet<number>,
): boolean {
  const dayOfWeek = new Date(dateMillis).getDay(); // 0 = Sunday, 6 = Saturday
  const naturalFestive =
    festiveType === 1
      ? dayOfWeek === 6
      : festiveType === 2
        ? dayOfWeek === 0
        : festiveType === 3
          ? dayOfWeek === 6 || dayOfWeek === 0
          : false;

  const isOverridden = isManual || (globalFestiveDates?.has(dateMillis) ?? false);
  return isOverridden ? !naturalFestive : naturalFestive;
}

export function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) {
    return null;
  }
  const trimmed = timeStr.trim();
  const match = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function calculateIntervalHours(start: string | null | undefined, end: string | null | undefined): number {
  const startMin = parseTimeToMinutes(start);
  const endMin = parseTimeToMinutes(end);
  if (startMin === null || endMin === null || endMin <= startMin) {
    return 0;
  }
  return round2((endMin - startMin) / 60);
}

export function calculateShiftHours(
  morningStart: string | null | undefined,
  morningEnd: string | null | undefined,
  afternoonStart: string | null | undefined,
  afternoonEnd: string | null | undefined,
): number {
  return round2(
    calculateIntervalHours(morningStart, morningEnd) + calculateIntervalHours(afternoonStart, afternoonEnd),
  );
}

export function formatHoursLabel(hours: number): string {
  const safe = clampNonNegative(hours);
  const totalMinutes = Math.round(safe * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}'`;
}

export function formatCurrencyIt(amount: number): string {
  return amount.toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function capitalizeWords(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed
    .toLocaleLowerCase('it')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase('it') + word.slice(1))
    .join(' ');
}
