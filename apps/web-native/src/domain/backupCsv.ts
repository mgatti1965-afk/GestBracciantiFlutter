import {
  capitalizeWords,
  computeCompensation,
  isDateFestive,
  round2,
  type FestiveDaysType,
} from './calc';
import { importCsvDataset } from './csvCompat';
import {
  DEFAULT_OWNER_SETTINGS,
  type AppWorker,
  type OwnerSettings,
  type Plantation,
  type WorkerGroup,
  type WorkerGroupMember,
  type WorkerYearConfig,
} from './models';
import type { HarvestYear } from './harvestYear';
import type { WorkLog } from './workLog';
import { toMidnightMillisFromIso } from './workLog';

export interface FullBackupDataset {
  settings: OwnerSettings;
  years: HarvestYear[];
  workers: AppWorker[];
  configs: WorkerYearConfig[];
  groups: WorkerGroup[];
  groupMembers: WorkerGroupMember[];
  plantations: Plantation[];
  logs: WorkLog[];
}

function normalizedHeaderKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function parseBoolFlag(value: string | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'si' || v === 's' || v === 'yes';
}

function parseOptionalFloat(value: string | undefined): number | undefined {
  const normalized = (value ?? '').trim().replace(',', '.');
  if (!normalized) {
    return undefined;
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : undefined;
}

function parseHoursFlexible(raw: string | undefined): number {
  const cleaned = (raw ?? '').trim();
  if (!cleaned) {
    return 0;
  }
  const hhmm = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const h = Number(hhmm[1]);
    const m = Number(hhmm[2]);
    if (Number.isFinite(h) && Number.isFinite(m) && m >= 0 && m <= 59) {
      return round2(h + m / 60);
    }
  }
  return round2(parseOptionalFloat(cleaned) ?? 0);
}

function parseDateMillisFlexible(raw: string | undefined): number {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    throw new Error('Data log mancante nel backup.');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return toMidnightMillisFromIso(trimmed);
  }
  if (/^\d{10,14}$/.test(trimmed)) {
    const millis = Number(trimmed);
    if (Number.isFinite(millis)) {
      const d = new Date(millis);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }
  }
  throw new Error(`Data log non valida nel backup: "${trimmed}".`);
}

function parseTimeOrNull(raw: string | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return null;
  }
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(trimmed) ? trimmed : null;
}

function splitSemicolonCsvLine(line: string): string[] {
  const row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ';' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
      continue;
    }
    cell += ch;
  }
  row.push(cell.trim());
  return row;
}

function getField(record: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    if (record[alias] !== undefined) {
      return record[alias];
    }
  }
  return '';
}

function parseFestiveDaysType(value: number | undefined): FestiveDaysType {
  if (value === 0 || value === 1 || value === 2 || value === 3) {
    return value;
  }
  return 3;
}

function isMultiSectionBackup(lines: string[]): boolean {
  const firstNonEmpty = lines.find((l) => l.trim() !== '')?.trim() ?? '';
  if (firstNonEmpty.toLowerCase().startsWith('#gestbraccianticsv')) {
    return false;
  }
  const firstCells = splitSemicolonCsvLine(firstNonEmpty).map((c) => normalizedHeaderKey(c));
  if (firstCells.includes('tipo')) {
    return true;
  }
  return lines.some((l) => /^(S|W|Y|C|L|G|X|P);/i.test(l.trim()));
}

/** Exports the full application state using the exact multi-section CSV format of the Android app. */
export function exportAndroidBackupCsv(dataset: FullBackupDataset): string {
  const lines: string[] = [];

  lines.push('TIPO;CHIAVE;VALORE');
  lines.push(`S;owner_name;${dataset.settings.ownerName.replace(/[\r\n;]/g, ' ').trim()}`);
  lines.push(`S;owner_surname;${dataset.settings.ownerSurname.replace(/[\r\n;]/g, ' ').trim()}`);
  lines.push(`S;extra_hours_threshold;${dataset.settings.extraHoursThreshold}`);
  lines.push(`S;festive_days_type;${dataset.settings.festiveDaysType}`);
  if (dataset.settings.globalFestiveDates.length > 0) {
    lines.push(`S;global_festive_dates;${dataset.settings.globalFestiveDates.join(',')}`);
  }

  if (dataset.workers.length > 0) {
    lines.push('TIPO;ID;COGNOME;NOME;TELEFONO;ARCHIVIATO');
    for (const w of dataset.workers) {
      lines.push(
        `W;${w.id};${w.surname.replace(/;/g, ',')};${w.name.replace(/;/g, ',')};${w.phoneNumber.replace(/;/g, '')};${w.isArchived ? 1 : 0}`,
      );
    }
  }

  if (dataset.years.length > 0) {
    lines.push('TIPO;ID;CORRENTE;NOTE');
    for (const y of dataset.years) {
      const escapedNotes = y.notes.replace(/\r?\n/g, '\\n').replace(/;/g, ',');
      lines.push(`Y;${y.id};${y.isCurrent ? 1 : 0};${escapedNotes}`);
    }
  }

  if (dataset.configs.length > 0) {
    lines.push('TIPO;LAV_ID;ANNO_ID;TARIFFA;STRAORD;FESTIVO');
    for (const c of dataset.configs) {
      lines.push(
        `C;${c.workerId};${c.harvestYearId};${c.hourlyRate};${c.extraHourlyRate};${c.holidayHourlyRate}`,
      );
    }
  }

  if (dataset.logs.length > 0) {
    lines.push(
      'TIPO;LAV_ID;ANNO_ID;DATA;M_IN;M_OUT;P_IN;P_OUT;ORE;TARIFFA;STRAORD;FESTIVO;MAN_FEST;TOTALE;ORD_H;EXT_H;HOL_H;ORD_A;EXT_A;HOL_A',
    );
    for (const log of dataset.logs) {
      lines.push(
        [
          'L',
          log.workerId,
          log.harvestYearId,
          log.date,
          log.morningStart ?? '',
          log.morningEnd ?? '',
          log.afternoonStart ?? '',
          log.afternoonEnd ?? '',
          log.totalHours.toFixed(2),
          log.hourlyRate,
          log.extraHourlyRate,
          log.holidayHourlyRate,
          log.isManualHoliday ? 1 : 0,
          log.totalAmount,
          log.ordinaryHours,
          log.extraHours,
          log.holidayHours,
          log.ordinaryAmount,
          log.extraAmount,
          log.holidayAmount,
        ].join(';'),
      );
    }
  }

  if (dataset.plantations.length > 0) {
    lines.push('TIPO;ID;NOME;ARCHIVIATO');
    for (const p of dataset.plantations) {
      lines.push(`P;${p.id};${p.name.replace(/;/g, ',')};${p.isArchived ? 1 : 0}`);
    }
  }

  if (dataset.groups.length > 0) {
    lines.push('TIPO;ID;NOME;ANNO_ID');
    for (const g of dataset.groups) {
      lines.push(`G;${g.id};${g.name.replace(/;/g, ',')};${g.yearId}`);
    }
  }

  if (dataset.groupMembers.length > 0) {
    lines.push('TIPO;LAV_ID;GRP_ID');
    for (const m of dataset.groupMembers) {
      lines.push(`X;${m.workerId};${m.groupId}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

/** Imports either an Android multi-section backup CSV or a canonical/legacy CSV into FullBackupDataset. */
export function importFullBackupCsv(text: string): FullBackupDataset {
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) {
    throw new Error('File CSV vuoto.');
  }

  if (!isMultiSectionBackup(lines)) {
    const legacy = importCsvDataset(cleaned);
    const workersMap = new Map<number, AppWorker>();
    const configsMap = new Map<string, WorkerYearConfig>();

    for (const w of legacy.workers) {
      if (!workersMap.has(w.id)) {
        workersMap.set(w.id, {
          id: w.id,
          name: capitalizeWords(w.name),
          surname: capitalizeWords(w.surname),
          phoneNumber: w.phoneNumber,
          isArchived: w.isArchived,
        });
      }
      const key = `${w.id}::${w.harvestYearId}`;
      if (!configsMap.has(key)) {
        const logForWorker = legacy.logs.find((l) => l.workerId === w.id && l.harvestYearId === w.harvestYearId);
        configsMap.set(key, {
          workerId: w.id,
          harvestYearId: w.harvestYearId,
          hourlyRate: logForWorker?.hourlyRate ?? 0,
          extraHourlyRate: logForWorker?.extraHourlyRate ?? 0,
          holidayHourlyRate: logForWorker?.holidayHourlyRate ?? 0,
        });
      }
    }

    return {
      settings: { ...DEFAULT_OWNER_SETTINGS },
      years: legacy.years,
      workers: [...workersMap.values()],
      configs: [...configsMap.values()],
      groups: [],
      groupMembers: [],
      plantations: [],
      logs: legacy.logs,
    };
  }

  const settings: OwnerSettings = { ...DEFAULT_OWNER_SETTINGS };
  const yearsMap = new Map<number, HarvestYear>();
  const workersMap = new Map<number, AppWorker>();
  const configsMap = new Map<string, WorkerYearConfig>();
  const groupsMap = new Map<number, WorkerGroup>();
  const memberSet = new Set<string>();
  const groupMembers: WorkerGroupMember[] = [];
  const plantationsMap = new Map<number, Plantation>();
  const logs: WorkLog[] = [];
  let nextLogId = 1;

  let sectionHeaders: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    const cells = splitSemicolonCsvLine(trimmed);
    const first = cells[0] ?? '';

    if (normalizedHeaderKey(first) === 'tipo') {
      sectionHeaders = cells.map((c) => normalizedHeaderKey(c));
      continue;
    }

    const record: Record<string, string> = {};
    if (sectionHeaders.length > 0) {
      sectionHeaders.forEach((key, idx) => {
        record[key] = cells[idx] ?? '';
      });
    }

    const kind = first.toUpperCase();

    if (kind === 'S') {
      const key = (getField(record, ['chiave']) || cells[1] || '').trim();
      const val = (getField(record, ['valore']) || cells[2] || '').trim();
      if (key === 'owner_name') settings.ownerName = val;
      else if (key === 'owner_surname') settings.ownerSurname = val;
      else if (key === 'extra_hours_threshold') {
        const parsed = parseOptionalFloat(val);
        if (parsed !== undefined && parsed >= 0) settings.extraHoursThreshold = parsed;
      } else if (key === 'festive_days_type') {
        settings.festiveDaysType = parseFestiveDaysType(parseOptionalFloat(val));
      } else if (key === 'global_festive_dates') {
        settings.globalFestiveDates = val
          .split(',')
          .map((x) => Number(x.trim()))
          .filter((x) => Number.isFinite(x));
      }
      continue;
    }

    if (kind === 'Y') {
      const id = Math.trunc(parseOptionalFloat(getField(record, ['id', 'annata', 'anno']) || cells[1]) ?? NaN);
      if (!Number.isFinite(id) || id < 2000 || id > 2100) {
        throw new Error(`Annata non valida nel backup: "${cells[1] ?? ''}".`);
      }
      const isCurrent = parseBoolFlag(getField(record, ['corrente', 'iscurrent']) || cells[2]);
      const notes = (getField(record, ['note', 'notes']) || cells[3] || '').replace(/\\n/g, '\n');
      yearsMap.set(id, { id, isCurrent, notes });
      continue;
    }

    if (kind === 'W') {
      const id = Math.trunc(parseOptionalFloat(getField(record, ['id', 'lavid']) || cells[1]) ?? NaN);
      if (!Number.isFinite(id) || id < 1) {
        throw new Error(`ID bracciante non valido nel backup: "${cells[1] ?? ''}".`);
      }
      const surname = capitalizeWords(getField(record, ['cognome', 'surname']) || cells[2] || '');
      const name = capitalizeWords(getField(record, ['nome', 'name']) || cells[3] || '');
      const phoneNumber = getField(record, ['telefono', 'phone', 'phonenumber']) || cells[4] || '';
      const isArchived = parseBoolFlag(getField(record, ['archiviato', 'isarchived']) || cells[5]);

      workersMap.set(id, {
        id,
        surname: surname || name || `Bracciante ${id}`,
        name: surname ? name : '',
        phoneNumber,
        isArchived,
      });
      continue;
    }

    if (kind === 'P') {
      const id = Math.trunc(parseOptionalFloat(getField(record, ['id']) || cells[1]) ?? NaN);
      if (Number.isFinite(id) && id >= 1) {
        plantationsMap.set(id, {
          id,
          name: getField(record, ['nome', 'name']) || cells[2] || '',
          isArchived: parseBoolFlag(getField(record, ['archiviato', 'isarchived']) || cells[3]),
        });
      }
      continue;
    }

    if (kind === 'C') {
      const workerId = Math.trunc(parseOptionalFloat(getField(record, ['lavid', 'workerid']) || cells[1]) ?? NaN);
      const harvestYearId = Math.trunc(parseOptionalFloat(getField(record, ['annoid', 'harvestyearid']) || cells[2]) ?? NaN);
      if (!Number.isFinite(workerId) || !Number.isFinite(harvestYearId)) {
        continue;
      }
      const hourlyRate = parseOptionalFloat(getField(record, ['tariffa', 'hourlyrate']) || cells[3]) ?? 0;
      const extraHourlyRate = parseOptionalFloat(getField(record, ['straord', 'extrahourlyrate']) || cells[4]) ?? hourlyRate;
      const holidayHourlyRate = parseOptionalFloat(getField(record, ['festivo', 'holidayhourlyrate']) || cells[5]) ?? hourlyRate;

      configsMap.set(`${workerId}::${harvestYearId}`, {
        workerId,
        harvestYearId,
        hourlyRate,
        extraHourlyRate,
        holidayHourlyRate,
      });

      if (!yearsMap.has(harvestYearId)) {
        yearsMap.set(harvestYearId, { id: harvestYearId, isCurrent: false, notes: '' });
      }
      continue;
    }

    if (kind === 'G') {
      const id = Math.trunc(parseOptionalFloat(getField(record, ['id']) || cells[1]) ?? NaN);
      const name = (getField(record, ['nome', 'name']) || cells[2] || '').trim();
      const yearId = Math.trunc(parseOptionalFloat(getField(record, ['annoid', 'yearid']) || cells[3]) ?? NaN);
      if (Number.isFinite(id) && Number.isFinite(yearId) && name) {
        groupsMap.set(id, { id, name, yearId });
      }
      continue;
    }

    if (kind === 'X') {
      const workerId = Math.trunc(parseOptionalFloat(getField(record, ['lavid', 'workerid']) || cells[1]) ?? NaN);
      const groupId = Math.trunc(parseOptionalFloat(getField(record, ['grpid', 'groupid']) || cells[2]) ?? NaN);
      if (Number.isFinite(workerId) && Number.isFinite(groupId)) {
        const key = `${groupId}::${workerId}`;
        if (!memberSet.has(key)) {
          memberSet.add(key);
          groupMembers.push({ groupId, workerId });
        }
      }
      continue;
    }

    if (kind === 'L') {
      const workerId = Math.trunc(parseOptionalFloat(getField(record, ['lavid', 'workerid']) || cells[1]) ?? NaN);
      const harvestYearId = Math.trunc(parseOptionalFloat(getField(record, ['annoid', 'harvestyearid']) || cells[2]) ?? NaN);
      if (!Number.isFinite(workerId) || !Number.isFinite(harvestYearId)) {
        throw new Error('Riferimento bracciante o annata mancante nel log del backup.');
      }
      if (!workersMap.has(workerId)) {
        throw new Error(`Log backup referenzia bracciante mancante (${workerId}).`);
      }
      if (!yearsMap.has(harvestYearId)) {
        yearsMap.set(harvestYearId, { id: harvestYearId, isCurrent: false, notes: '' });
      }

      const date = parseDateMillisFlexible(getField(record, ['data', 'date']) || cells[3]);
      const morningStart = parseTimeOrNull(getField(record, ['min', 'morningstart']) || cells[4]);
      const morningEnd = parseTimeOrNull(getField(record, ['mout', 'morningend']) || cells[5]);
      const afternoonStart = parseTimeOrNull(getField(record, ['pin', 'afternoonstart']) || cells[6]);
      const afternoonEnd = parseTimeOrNull(getField(record, ['pout', 'afternoonend']) || cells[7]);
      const totalHours = parseHoursFlexible(getField(record, ['ore', 'totalhours']) || cells[8]);

      const cfg = configsMap.get(`${workerId}::${harvestYearId}`);
      const hourlyRate = parseOptionalFloat(getField(record, ['tariffa', 'hourlyrate']) || cells[9]) ?? cfg?.hourlyRate ?? 0;
      const extraHourlyRate = parseOptionalFloat(getField(record, ['straord', 'extrahourlyrate']) || cells[10]) ?? cfg?.extraHourlyRate ?? hourlyRate;
      const holidayHourlyRate = parseOptionalFloat(getField(record, ['festivo', 'holidayhourlyrate']) || cells[11]) ?? cfg?.holidayHourlyRate ?? hourlyRate;
      const isManualHoliday = parseBoolFlag(getField(record, ['manfest', 'ismanualholiday']) || cells[12]);

      const explicitTotal = parseOptionalFloat(getField(record, ['totale', 'totalamount']) || cells[13]);
      const explicitOrdH = parseOptionalFloat(getField(record, ['ordh', 'ordinaryhours']) || cells[14]);
      const explicitExtH = parseOptionalFloat(getField(record, ['exth', 'extrahours']) || cells[15]);
      const explicitHolH = parseOptionalFloat(getField(record, ['holh', 'holidayhours']) || cells[16]);
      const explicitOrdA = parseOptionalFloat(getField(record, ['orda', 'ordinaryamount']) || cells[17]);
      const explicitExtA = parseOptionalFloat(getField(record, ['exta', 'extraamount']) || cells[18]);
      const explicitHolA = parseOptionalFloat(getField(record, ['hola', 'holidayamount']) || cells[19]);

      const hasExplicitSplits =
        explicitOrdH !== undefined &&
        explicitExtH !== undefined &&
        explicitHolH !== undefined &&
        explicitTotal !== undefined;

      let ordinaryHours: number;
      let extraHours: number;
      let holidayHours: number;
      let ordinaryAmount: number;
      let extraAmount: number;
      let holidayAmount: number;
      let totalAmount: number;

      if (hasExplicitSplits) {
        ordinaryHours = explicitOrdH;
        extraHours = explicitExtH;
        holidayHours = explicitHolH;
        ordinaryAmount = explicitOrdA ?? round2(ordinaryHours * hourlyRate);
        extraAmount = explicitExtA ?? round2(extraHours * extraHourlyRate);
        holidayAmount = explicitHolA ?? round2(holidayHours * holidayHourlyRate);
        totalAmount = explicitTotal;
      } else {
        const isHoliday = isDateFestive(
          date,
          isManualHoliday,
          settings.festiveDaysType,
          new Set(settings.globalFestiveDates),
        );
        const calc = computeCompensation({
          totalHours,
          extraThreshold: settings.extraHoursThreshold,
          isHoliday,
          hourlyRate,
          extraHourlyRate,
          holidayHourlyRate,
        });
        ordinaryHours = calc.ordinaryHours;
        extraHours = calc.extraHours;
        holidayHours = calc.holidayHours;
        ordinaryAmount = calc.ordinaryAmount;
        extraAmount = calc.extraAmount;
        holidayAmount = calc.holidayAmount;
        totalAmount = calc.totalAmount;
      }

      if (!cfg) {
        configsMap.set(`${workerId}::${harvestYearId}`, {
          workerId,
          harvestYearId,
          hourlyRate,
          extraHourlyRate,
          holidayHourlyRate,
        });
      }

      logs.push({
        id: nextLogId,
        workerId,
        harvestYearId,
        date,
        morningStart,
        morningEnd,
        afternoonStart,
        afternoonEnd,
        totalHours,
        ordinaryHours,
        extraHours,
        holidayHours,
        hourlyRate,
        extraHourlyRate,
        holidayHourlyRate,
        totalAmount,
        ordinaryAmount,
        extraAmount,
        holidayAmount,
        isManualHoliday,
      });
      nextLogId += 1;
    }
  }

  let years = [...yearsMap.values()].sort((a, b) => b.id - a.id);
  const currentYears = years.filter((y) => y.isCurrent);
  if (years.length > 0 && currentYears.length !== 1) {
    const selectedId = currentYears.length > 0 ? currentYears[0].id : years[0].id;
    years = years.map((y) => ({ ...y, isCurrent: y.id === selectedId }));
  }

  const workers = [...workersMap.values()];
  const configs = [...configsMap.values()];
  const groups = [...groupsMap.values()];

  const validWorkerIds = new Set(workers.map((w) => w.id));
  const validGroupIds = new Set(groups.map((g) => g.id));
  const filteredMembers = groupMembers.filter(
    (m) => validWorkerIds.has(m.workerId) && validGroupIds.has(m.groupId),
  );

  if (years.length === 0 && workers.length === 0 && logs.length === 0) {
    throw new Error('File non riconosciuto come backup GestBraccianti valido.');
  }

  return {
    settings,
    years,
    workers,
    configs,
    groups,
    groupMembers: filteredMembers,
    plantations: [...plantationsMap.values()],
    logs,
  };
}
