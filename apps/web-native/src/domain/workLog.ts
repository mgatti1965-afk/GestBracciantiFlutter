import { computeCompensation } from './calc';

export interface WorkLog {
  id: number;
  workerId: number;
  harvestYearId: number;
  date: number;
  morningStart: string | null;
  morningEnd: string | null;
  afternoonStart: string | null;
  afternoonEnd: string | null;
  totalHours: number;
  ordinaryHours: number;
  extraHours: number;
  holidayHours: number;
  hourlyRate: number;
  extraHourlyRate: number;
  holidayHourlyRate: number;
  totalAmount: number;
  ordinaryAmount: number;
  extraAmount: number;
  holidayAmount: number;
  isManualHoliday: boolean;
}

export interface CreateWorkLogInput {
  workerId: number;
  harvestYearId: number;
  dateIso: string;
  totalHours: number;
  isManualHoliday: boolean;
  extraThreshold: number;
  hourlyRate: number;
  extraHourlyRate: number;
  holidayHourlyRate: number;
}

function toMidnightMillisFromIso(dateIso: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    throw new Error('Data non valida.');
  }

  const [yearStr, monthStr, dayStr] = dateIso.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  return new Date(year, month - 1, day).getTime();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function createWorkLogDraft(input: CreateWorkLogInput): Omit<WorkLog, 'id'> {
  if (!Number.isFinite(input.totalHours) || input.totalHours < 0) {
    throw new Error('Ore totali non valide.');
  }

  const date = toMidnightMillisFromIso(input.dateIso);

  const calc = computeCompensation({
    totalHours: input.totalHours,
    extraThreshold: input.extraThreshold,
    isHoliday: input.isManualHoliday,
    hourlyRate: input.hourlyRate,
    extraHourlyRate: input.extraHourlyRate,
    holidayHourlyRate: input.holidayHourlyRate,
  });

  return {
    workerId: Math.trunc(input.workerId),
    harvestYearId: Math.trunc(input.harvestYearId),
    date,
    morningStart: null,
    morningEnd: null,
    afternoonStart: null,
    afternoonEnd: null,
    totalHours: round2(input.totalHours),
    ordinaryHours: calc.ordinaryHours,
    extraHours: calc.extraHours,
    holidayHours: calc.holidayHours,
    hourlyRate: round2(input.hourlyRate),
    extraHourlyRate: round2(input.extraHourlyRate),
    holidayHourlyRate: round2(input.holidayHourlyRate),
    totalAmount: calc.totalAmount,
    ordinaryAmount: calc.ordinaryAmount,
    extraAmount: calc.extraAmount,
    holidayAmount: calc.holidayAmount,
    isManualHoliday: input.isManualHoliday,
  };
}

export function sortLogsByDateDesc(logs: WorkLog[]): WorkLog[] {
  return [...logs].sort((a, b) => b.date - a.date || b.id - a.id);
}
