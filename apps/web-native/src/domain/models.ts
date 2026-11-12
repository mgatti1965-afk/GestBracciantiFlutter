import {
  calculateShiftHours,
  capitalizeWords,
  computeCompensation,
  isDateFestive,
  round2,
  type FestiveDaysType,
} from './calc';
import type { WorkLog } from './workLog';

export interface AppWorker {
  id: number;
  name: string;
  surname: string;
  phoneNumber: string;
  isArchived: boolean;
}

export interface WorkerYearConfig {
  workerId: number;
  harvestYearId: number;
  hourlyRate: number;
  extraHourlyRate: number;
  holidayHourlyRate: number;
}

export interface WorkerWithRate extends AppWorker {
  hourlyRate: number;
  extraHourlyRate: number;
  holidayHourlyRate: number;
}

export interface WorkerGroup {
  id: number;
  name: string;
  yearId: number;
}

export interface WorkerGroupMember {
  groupId: number;
  workerId: number;
}

export interface Plantation {
  id: number;
  name: string;
  isArchived: boolean;
}

export interface OwnerSettings {
  ownerName: string;
  ownerSurname: string;
  extraHoursThreshold: number;
  festiveDaysType: FestiveDaysType;
  globalFestiveDates: number[];
  saveCountSinceBackup: number;
}

export interface BackupHistoryItem {
  id: number;
  filename: string;
  createdAt: number;
  csvContent: string;
}

export const DEFAULT_OWNER_SETTINGS: OwnerSettings = {
  ownerName: '',
  ownerSurname: '',
  extraHoursThreshold: 8,
  festiveDaysType: 3,
  globalFestiveDates: [],
  saveCountSinceBackup: 0,
};

export function toLocalMidnightMillis(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function toIsoLocalDate(millis: number): string {
  const d = new Date(millis);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function normalizeWorkerFields(params: {
  surname: string;
  name?: string;
  phoneNumber?: string;
}): { surname: string; name: string; phoneNumber: string } {
  const surname = capitalizeWords(params.surname);
  if (!surname) {
    throw new Error('Il cognome è obbligatorio.');
  }
  const name = capitalizeWords(params.name ?? '');
  const phoneNumber = (params.phoneNumber ?? '').trim();
  return { surname, name, phoneNumber };
}

export function sortAppWorkers<T extends { surname: string; name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const sc = a.surname.localeCompare(b.surname, 'it', { sensitivity: 'base' });
    if (sc !== 0) {
      return sc;
    }
    return a.name.localeCompare(b.name, 'it', { sensitivity: 'base' });
  });
}

export function workerFullName(worker: { surname: string; name: string } | undefined, fallbackId?: number): string {
  if (!worker) {
    return fallbackId !== undefined ? `Bracciante #${fallbackId}` : 'Bracciante';
  }
  return `${worker.surname} ${worker.name}`.trim();
}

export function findDuplicateWorkerGroups(workers: AppWorker[]): AppWorker[][] {
  const buckets = new Map<string, AppWorker[]>();
  for (const worker of workers) {
    const key = `${worker.surname}${worker.name}`.toLocaleLowerCase('it').replace(/\s+/g, '');
    if (!key) {
      continue;
    }
    const list = buckets.get(key) ?? [];
    list.push(worker);
    buckets.set(key, list);
  }
  return [...buckets.values()]
    .filter((group) => group.length > 1)
    .map((group) => [...group].sort((a, b) => a.id - b.id));
}

export function computeWorkLogFromShifts(params: {
  workerId: number;
  harvestYearId: number;
  date: number;
  morningStart: string | null;
  morningEnd: string | null;
  afternoonStart: string | null;
  afternoonEnd: string | null;
  hourlyRate: number;
  extraHourlyRate: number;
  holidayHourlyRate: number;
  isManualHoliday: boolean;
  settings: Pick<OwnerSettings, 'extraHoursThreshold' | 'festiveDaysType' | 'globalFestiveDates'>;
}): Omit<WorkLog, 'id'> {
  const totalHours = calculateShiftHours(
    params.morningStart,
    params.morningEnd,
    params.afternoonStart,
    params.afternoonEnd,
  );
  const globalSet = new Set(params.settings.globalFestiveDates);
  const isHoliday = isDateFestive(
    params.date,
    params.isManualHoliday,
    params.settings.festiveDaysType,
    globalSet,
  );

  const calc = computeCompensation({
    totalHours,
    extraThreshold: params.settings.extraHoursThreshold,
    isHoliday,
    hourlyRate: params.hourlyRate,
    extraHourlyRate: params.extraHourlyRate,
    holidayHourlyRate: params.holidayHourlyRate,
  });

  return {
    workerId: params.workerId,
    harvestYearId: params.harvestYearId,
    date: params.date,
    morningStart: params.morningStart || null,
    morningEnd: params.morningEnd || null,
    afternoonStart: params.afternoonStart || null,
    afternoonEnd: params.afternoonEnd || null,
    totalHours,
    ordinaryHours: calc.ordinaryHours,
    extraHours: calc.extraHours,
    holidayHours: calc.holidayHours,
    hourlyRate: round2(params.hourlyRate),
    extraHourlyRate: round2(params.extraHourlyRate),
    holidayHourlyRate: round2(params.holidayHourlyRate),
    totalAmount: calc.totalAmount,
    ordinaryAmount: calc.ordinaryAmount,
    extraAmount: calc.extraAmount,
    holidayAmount: calc.holidayAmount,
    isManualHoliday: params.isManualHoliday,
  };
}

export function recalculateWorkLog(
  log: WorkLog,
  settings: Pick<OwnerSettings, 'extraHoursThreshold' | 'festiveDaysType' | 'globalFestiveDates'>,
): WorkLog {
  const globalSet = new Set(settings.globalFestiveDates);
  const isHoliday = isDateFestive(log.date, log.isManualHoliday, settings.festiveDaysType, globalSet);
  const calc = computeCompensation({
    totalHours: log.totalHours,
    extraThreshold: settings.extraHoursThreshold,
    isHoliday,
    hourlyRate: log.hourlyRate,
    extraHourlyRate: log.extraHourlyRate,
    holidayHourlyRate: log.holidayHourlyRate,
  });

  return {
    ...log,
    ordinaryHours: calc.ordinaryHours,
    extraHours: calc.extraHours,
    holidayHours: calc.holidayHours,
    ordinaryAmount: calc.ordinaryAmount,
    extraAmount: calc.extraAmount,
    holidayAmount: calc.holidayAmount,
    totalAmount: calc.totalAmount,
  };
}
