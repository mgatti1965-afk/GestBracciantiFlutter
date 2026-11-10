import { type HarvestYear } from './harvestYear';
import { type Worker } from './worker';
import { createWorkLogDraft, type WorkLog } from './workLog';

export interface CsvDataset {
  years: HarvestYear[];
  workers: Worker[];
  logs: WorkLog[];
}

const VERSION_MARKER = '#GestBracciantiCSV;1';
const CANONICAL_DESCRIPTION_COLUMN = 'entityDescription';

const CANONICAL_COLUMNS = [
  'entity',
  'id',
  'harvestYearId',
  'isCurrent',
  'notes',
  'name',
  'surname',
  'phoneNumber',
  'isArchived',
  'workerId',
  'date',
  'morningStart',
  'morningEnd',
  'afternoonStart',
  'afternoonEnd',
  'totalHours',
  'ordinaryHours',
  'extraHours',
  'holidayHours',
  'hourlyRate',
  'extraHourlyRate',
  'holidayHourlyRate',
  'totalAmount',
  'ordinaryAmount',
  'extraAmount',
  'holidayAmount',
  'isManualHoliday',
] as const;

type CanonicalColumn = (typeof CANONICAL_COLUMNS)[number];

function canonicalEntityDescription(entity: 'YEAR' | 'WORKER' | 'LOG'): string {
  if (entity === 'YEAR') {
    return 'Annata';
  }
  if (entity === 'WORKER') {
    return 'Bracciante';
  }
  return 'Log giornaliero';
}

function toIsoFromMillis(millis: number): string {
  const d = new Date(millis);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseNumber(value: string, label: string): number {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) {
    throw new Error(`${label} mancante.`);
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} non valido: "${value}".`);
  }
  return parsed;
}

function parseOptionalNumber(value: string): number | undefined {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

function parseHoursValue(value: string, label: string): number {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} mancante.`);
  }

  const hhmm = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const hours = Number(hhmm[1]);
    const minutes = Number(hhmm[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
      throw new Error(`${label} non valido: "${value}".`);
    }
    return (hours * 60 + minutes) / 60;
  }

  return parseNumber(normalized, label);
}

function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized === '1' || normalized === 'true' || normalized === 'si' || normalized === 's' || normalized === 'yes';
}

function escapeCell(value: string): string {
  if (!/[";,\n\r]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function toCsvLine(values: string[]): string {
  return values.map((v) => escapeCell(v)).join(';');
}

function detectDelimiter(header: string): ';' | ',' {
  const semicolons = (header.match(/;/g) ?? []).length;
  const commas = (header.match(/,/g) ?? []).length;
  return semicolons >= commas ? ';' : ',';
}

function parseCsvRows(text: string): string[][] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) {
    return [];
  }

  let cursor = 0;
  if (lines[0].trim().toLowerCase().startsWith('#gestbraccianticsv')) {
    cursor = 1;
  }

  if (cursor >= lines.length) {
    return [];
  }

  const delimiter = detectDelimiter(lines[cursor]);
  const rows: string[][] = [];

  for (let i = cursor; i < lines.length; i += 1) {
    const line = lines[i];
    const row: string[] = [];
    let cell = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j += 1) {
      const char = line[j];
      if (char === '"') {
        if (inQuotes && line[j + 1] === '"') {
          cell += '"';
          j += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === delimiter && !inQuotes) {
        row.push(cell);
        cell = '';
        continue;
      }

      cell += char;
    }

    row.push(cell);
    rows.push(row.map((x) => x.trim()));
  }

  return rows;
}

function normalizedHeaderKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function getByAliases(record: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const value = record[alias];
    if (value !== undefined) {
      return value;
    }
  }
  return '';
}

function parseCanonical(rows: string[][]): CsvDataset {
  if (rows.length === 0) {
    return { years: [], workers: [], logs: [] };
  }

  const header = rows[0];
  const headerMap = new Map<string, number>();
  header.forEach((name, index) => {
    headerMap.set(name, index);
  });

  for (const required of CANONICAL_COLUMNS) {
    if (!headerMap.has(required)) {
      throw new Error(`CSV canonico non valido: colonna mancante "${required}".`);
    }
  }

  const years: HarvestYear[] = [];
  const workers: Worker[] = [];
  const logs: WorkLog[] = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const get = (column: CanonicalColumn): string => {
      const columnIndex = headerMap.get(column);
      if (columnIndex === undefined) {
        return '';
      }
      return row[columnIndex] ?? '';
    };

    const entity = get('entity').toUpperCase();
    if (!entity) {
      continue;
    }

    if (entity === 'YEAR') {
      const id = Math.trunc(parseNumber(get('id'), 'id annata'));
      years.push({
        id,
        isCurrent: parseBoolean(get('isCurrent')),
        notes: get('notes'),
      });
      continue;
    }

    if (entity === 'WORKER') {
      const id = Math.trunc(parseNumber(get('id'), 'id bracciante'));
      workers.push({
        id,
        harvestYearId: Math.trunc(parseNumber(get('harvestYearId'), 'harvestYearId bracciante')),
        name: get('name'),
        surname: get('surname'),
        phoneNumber: get('phoneNumber'),
        isArchived: parseBoolean(get('isArchived')),
      });
      continue;
    }

    if (entity === 'LOG') {
      const dateRaw = get('date');
      const millis = parseOptionalNumber(dateRaw);
      const date = millis !== undefined ? millis : new Date(dateRaw).getTime();
      if (!Number.isFinite(date)) {
        throw new Error(`Data log non valida alla riga ${rowIndex + 1}.`);
      }

      logs.push({
        id: Math.trunc(parseNumber(get('id'), 'id log')),
        workerId: Math.trunc(parseNumber(get('workerId'), 'workerId log')),
        harvestYearId: Math.trunc(parseNumber(get('harvestYearId'), 'harvestYearId log')),
        date,
        morningStart: get('morningStart') || null,
        morningEnd: get('morningEnd') || null,
        afternoonStart: get('afternoonStart') || null,
        afternoonEnd: get('afternoonEnd') || null,
        totalHours: parseNumber(get('totalHours'), 'totalHours'),
        ordinaryHours: parseNumber(get('ordinaryHours'), 'ordinaryHours'),
        extraHours: parseNumber(get('extraHours'), 'extraHours'),
        holidayHours: parseNumber(get('holidayHours'), 'holidayHours'),
        hourlyRate: parseNumber(get('hourlyRate'), 'hourlyRate'),
        extraHourlyRate: parseNumber(get('extraHourlyRate'), 'extraHourlyRate'),
        holidayHourlyRate: parseNumber(get('holidayHourlyRate'), 'holidayHourlyRate'),
        totalAmount: parseNumber(get('totalAmount'), 'totalAmount'),
        ordinaryAmount: parseNumber(get('ordinaryAmount'), 'ordinaryAmount'),
        extraAmount: parseNumber(get('extraAmount'), 'extraAmount'),
        holidayAmount: parseNumber(get('holidayAmount'), 'holidayAmount'),
        isManualHoliday: parseBoolean(get('isManualHoliday')),
      });
      continue;
    }

    throw new Error(`Tipo record non supportato: "${entity}" (riga ${rowIndex + 1}).`);
  }

  const normalizedYears = enforceSingleCurrentYear(years);
  validateReferences(normalizedYears, workers, logs);

  return {
    years: normalizedYears,
    workers,
    logs,
  };
}

function enforceSingleCurrentYear(years: HarvestYear[]): HarvestYear[] {
  if (years.length === 0) {
    return [];
  }

  const current = years.filter((y) => y.isCurrent);
  if (current.length === 1) {
    return years;
  }

  const selectedCurrentId = current.length > 1
    ? current[0].id
    : [...years].sort((a, b) => b.id - a.id)[0].id;

  return years.map((y) => ({
    ...y,
    isCurrent: y.id === selectedCurrentId,
  }));
}

function validateReferences(years: HarvestYear[], workers: Worker[], logs: WorkLog[]): void {
  const yearIds = new Set(years.map((y) => y.id));
  const workerIds = new Set(workers.map((w) => w.id));

  for (const worker of workers) {
    if (!yearIds.has(worker.harvestYearId)) {
      throw new Error(`Bracciante ${worker.id} referenzia annata mancante (${worker.harvestYearId}).`);
    }
  }

  for (const log of logs) {
    if (!yearIds.has(log.harvestYearId)) {
      throw new Error(`Log ${log.id} referenzia annata mancante (${log.harvestYearId}).`);
    }
    if (!workerIds.has(log.workerId)) {
      throw new Error(`Log ${log.id} referenzia bracciante mancante (${log.workerId}).`);
    }
  }
}

function parseLegacy(rows: string[][]): CsvDataset {
  if (rows.length === 0) {
    return { years: [], workers: [], logs: [] };
  }

  const rawHeader = rows[0];
  const header = rawHeader.map((x) => normalizedHeaderKey(x));

  const years = new Map<number, HarvestYear>();
  const workerMap = new Map<string, Worker>();
  const logs: WorkLog[] = [];
  let nextWorkerId = 1;
  let nextLogId = 1;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const record: Record<string, string> = {};
    header.forEach((name, index) => {
      record[name] = row[index] ?? '';
    });

    const yearId = Math.trunc(parseNumber(getByAliases(record, ['annata', 'anno', 'year', 'harvestyearid']), 'annata'));
    const name = getByAliases(record, ['nome', 'name']);
    const surname = getByAliases(record, ['cognome', 'surname']);
    if (!name || !surname) {
      throw new Error(`Nome/cognome mancanti alla riga ${rowIndex + 1}.`);
    }

    if (!years.has(yearId)) {
      years.set(yearId, {
        id: yearId,
        notes: '',
        isCurrent: false,
      });
    }

    const workerKey = `${yearId}::${surname.toLowerCase()}::${name.toLowerCase()}`;
    const existingWorker = workerMap.get(workerKey);
    const archived = parseBoolean(getByAliases(record, ['archiviato', 'isarchived']));
    const phone = getByAliases(record, ['telefono', 'phone', 'phonenumber']);

    const worker = existingWorker ?? {
      id: nextWorkerId,
      harvestYearId: yearId,
      name: name.trim(),
      surname: surname.trim(),
      phoneNumber: phone,
      isArchived: archived,
    };

    if (!existingWorker) {
      workerMap.set(workerKey, worker);
      nextWorkerId += 1;
    }

    const dateIso = getByAliases(record, ['data', 'date', 'giorno']);
    if (!dateIso) {
      throw new Error(`Data mancante alla riga ${rowIndex + 1}.`);
    }

    const draft = createWorkLogDraft({
      workerId: worker.id,
      harvestYearId: yearId,
      dateIso,
      totalHours: parseNumber(getByAliases(record, ['oretotali', 'totalhours', 'ore']), 'ore totali'),
      isManualHoliday: parseBoolean(getByAliases(record, ['festivo', 'ismanualholiday', 'holiday'])),
      extraThreshold: parseNumber(getByAliases(record, ['sogliaextra', 'extrathreshold']), 'soglia extra'),
      hourlyRate: parseNumber(getByAliases(record, ['tariffaord', 'hourlyrate']), 'tariffa ord'),
      extraHourlyRate: parseNumber(getByAliases(record, ['tariffastraord', 'extrahourlyrate']), 'tariffa extra'),
      holidayHourlyRate: parseNumber(getByAliases(record, ['tariffafestiva', 'holidayhourlyrate']), 'tariffa festiva'),
    });

    logs.push({
      ...draft,
      id: nextLogId,
    });
    nextLogId += 1;
  }

  const yearsList = enforceSingleCurrentYear([...years.values()]);
  const workers = [...workerMap.values()];

  validateReferences(yearsList, workers, logs);

  return {
    years: yearsList,
    workers,
    logs,
  };
}

function parseBackupMultiSection(rows: string[][]): CsvDataset {
  if (rows.length === 0) {
    return { years: [], workers: [], logs: [] };
  }

  const yearsById = new Map<number, HarvestYear>();
  const workersById = new Map<number, Worker>();
  const rateByWorkerYear = new Map<string, number>();
  const logs: WorkLog[] = [];
  let nextLogId = 1;

  let sectionHeaderKeys: string[] = [];

  for (const row of rows) {
    if (row.length === 0) {
      continue;
    }

    const first = (row[0] ?? '').trim();
    if (!first) {
      continue;
    }

    if (normalizedHeaderKey(first) === 'tipo') {
      sectionHeaderKeys = row.map((x) => normalizedHeaderKey(x));
      continue;
    }

    if (sectionHeaderKeys.length === 0) {
      continue;
    }

    const record: Record<string, string> = {};
    sectionHeaderKeys.forEach((key, index) => {
      record[key] = row[index] ?? '';
    });

    const recordType = first.toUpperCase();

    if (recordType === 'Y') {
      const yearId = Math.trunc(parseNumber(getByAliases(record, ['id', 'annata', 'anno', 'annoid']), 'id annata'));
      yearsById.set(yearId, {
        id: yearId,
        notes: '',
        isCurrent: parseBoolean(getByAliases(record, ['corrente', 'iscurrent'])),
      });
      continue;
    }

    if (recordType === 'W') {
      const workerId = Math.trunc(parseNumber(getByAliases(record, ['id', 'lavid']), 'id bracciante'));
      workersById.set(workerId, {
        id: workerId,
        // Il formato W non include l'annata: verra completata dai record C/L.
        harvestYearId: 0,
        name: getByAliases(record, ['nome', 'name']).trim(),
        surname: getByAliases(record, ['cognome', 'surname']).trim(),
        phoneNumber: getByAliases(record, ['telefono', 'phone', 'phonenumber']),
        isArchived: parseBoolean(getByAliases(record, ['archiviato', 'isarchived'])),
      });
      continue;
    }

    if (recordType === 'C') {
      const workerId = Math.trunc(parseNumber(getByAliases(record, ['lavid', 'workerid']), 'lav_id'));
      const yearId = Math.trunc(parseNumber(getByAliases(record, ['annoid', 'annata', 'anno', 'harvestyearid']), 'anno_id'));
      const rate = parseNumber(getByAliases(record, ['tariffa', 'hourlyrate']), 'tariffa');
      rateByWorkerYear.set(`${workerId}::${yearId}`, rate);

      const worker = workersById.get(workerId);
      if (worker && worker.harvestYearId === 0) {
        worker.harvestYearId = yearId;
      }
      if (!yearsById.has(yearId)) {
        yearsById.set(yearId, { id: yearId, notes: '', isCurrent: false });
      }
      continue;
    }

    if (recordType === 'L') {
      const workerId = Math.trunc(parseNumber(getByAliases(record, ['lavid', 'workerid']), 'lav_id'));
      const yearId = Math.trunc(parseNumber(getByAliases(record, ['annoid', 'annata', 'anno', 'harvestyearid']), 'anno_id'));
      const dateRaw = getByAliases(record, ['data', 'date']);
      const totalHours = parseHoursValue(getByAliases(record, ['ore', 'oretotali', 'totalhours']), 'ore');

      const parsedDateMillis = parseOptionalNumber(dateRaw);
      const dateMillis = parsedDateMillis !== undefined ? parsedDateMillis : new Date(dateRaw).getTime();
      if (!Number.isFinite(dateMillis)) {
        throw new Error('Data log non valida nel backup multi-sezione.');
      }

      const hourlyRateRaw = getByAliases(record, ['tariffa', 'hourlyrate']);
      const fallbackRate = rateByWorkerYear.get(`${workerId}::${yearId}`);
      const hourlyRate = hourlyRateRaw.trim() ? parseNumber(hourlyRateRaw, 'tariffa') : (fallbackRate ?? 0);

      const worker = workersById.get(workerId);
      if (!worker) {
        throw new Error(`Log backup referenzia bracciante mancante (${workerId}).`);
      }
      if (worker.harvestYearId === 0) {
        worker.harvestYearId = yearId;
      }
      if (!yearsById.has(yearId)) {
        yearsById.set(yearId, { id: yearId, notes: '', isCurrent: false });
      }

      const draft = createWorkLogDraft({
        workerId,
        harvestYearId: yearId,
        dateIso: toIsoFromMillis(dateMillis),
        totalHours,
        isManualHoliday: false,
        // Nel backup non c'e soglia extra esplicita: assumiamo tutto ordinario.
        extraThreshold: totalHours,
        hourlyRate,
        extraHourlyRate: hourlyRate,
        holidayHourlyRate: hourlyRate,
      });

      logs.push({
        ...draft,
        id: nextLogId,
      });
      nextLogId += 1;
      continue;
    }
  }

  const years = enforceSingleCurrentYear([...yearsById.values()]);
  const workers = [...workersById.values()].map((worker) => {
    if (worker.harvestYearId !== 0) {
      return worker;
    }
    const defaultYearId = years[0]?.id;
    if (defaultYearId === undefined) {
      throw new Error(`Bracciante ${worker.id} senza annata associata nel backup.`);
    }
    return {
      ...worker,
      harvestYearId: defaultYearId,
    };
  });

  validateReferences(years, workers, logs);

  return {
    years,
    workers,
    logs,
  };
}

export function exportCsvDataset(dataset: CsvDataset): string {
  const lines: string[] = [VERSION_MARKER, toCsvLine([...CANONICAL_COLUMNS, CANONICAL_DESCRIPTION_COLUMN])];

  for (const year of dataset.years) {
    const row: Record<CanonicalColumn, string> = {
      entity: 'YEAR',
      id: String(year.id),
      harvestYearId: '',
      isCurrent: year.isCurrent ? '1' : '0',
      notes: year.notes,
      name: '',
      surname: '',
      phoneNumber: '',
      isArchived: '',
      workerId: '',
      date: '',
      morningStart: '',
      morningEnd: '',
      afternoonStart: '',
      afternoonEnd: '',
      totalHours: '',
      ordinaryHours: '',
      extraHours: '',
      holidayHours: '',
      hourlyRate: '',
      extraHourlyRate: '',
      holidayHourlyRate: '',
      totalAmount: '',
      ordinaryAmount: '',
      extraAmount: '',
      holidayAmount: '',
      isManualHoliday: '',
    };
    lines.push(toCsvLine([...CANONICAL_COLUMNS.map((k) => row[k]), canonicalEntityDescription('YEAR')]));
  }

  for (const worker of dataset.workers) {
    const row: Record<CanonicalColumn, string> = {
      entity: 'WORKER',
      id: String(worker.id),
      harvestYearId: String(worker.harvestYearId),
      isCurrent: '',
      notes: '',
      name: worker.name,
      surname: worker.surname,
      phoneNumber: worker.phoneNumber,
      isArchived: worker.isArchived ? '1' : '0',
      workerId: '',
      date: '',
      morningStart: '',
      morningEnd: '',
      afternoonStart: '',
      afternoonEnd: '',
      totalHours: '',
      ordinaryHours: '',
      extraHours: '',
      holidayHours: '',
      hourlyRate: '',
      extraHourlyRate: '',
      holidayHourlyRate: '',
      totalAmount: '',
      ordinaryAmount: '',
      extraAmount: '',
      holidayAmount: '',
      isManualHoliday: '',
    };
    lines.push(toCsvLine([...CANONICAL_COLUMNS.map((k) => row[k]), canonicalEntityDescription('WORKER')]));
  }

  for (const log of dataset.logs) {
    const row: Record<CanonicalColumn, string> = {
      entity: 'LOG',
      id: String(log.id),
      harvestYearId: String(log.harvestYearId),
      isCurrent: '',
      notes: '',
      name: '',
      surname: '',
      phoneNumber: '',
      isArchived: '',
      workerId: String(log.workerId),
      date: toIsoFromMillis(log.date),
      morningStart: log.morningStart ?? '',
      morningEnd: log.morningEnd ?? '',
      afternoonStart: log.afternoonStart ?? '',
      afternoonEnd: log.afternoonEnd ?? '',
      totalHours: String(log.totalHours),
      ordinaryHours: String(log.ordinaryHours),
      extraHours: String(log.extraHours),
      holidayHours: String(log.holidayHours),
      hourlyRate: String(log.hourlyRate),
      extraHourlyRate: String(log.extraHourlyRate),
      holidayHourlyRate: String(log.holidayHourlyRate),
      totalAmount: String(log.totalAmount),
      ordinaryAmount: String(log.ordinaryAmount),
      extraAmount: String(log.extraAmount),
      holidayAmount: String(log.holidayAmount),
      isManualHoliday: log.isManualHoliday ? '1' : '0',
    };
    lines.push(toCsvLine([...CANONICAL_COLUMNS.map((k) => row[k]), canonicalEntityDescription('LOG')]));
  }

  return `${lines.join('\n')}\n`;
}

export function importCsvDataset(text: string): CsvDataset {
  const rows = parseCsvRows(text);
  if (rows.length === 0) {
    throw new Error('CSV vuoto.');
  }

  const firstHeader = rows[0].map((x) => x.trim().toLowerCase());
  if (firstHeader.includes('entity')) {
    return parseCanonical(rows);
  }

  if (firstHeader.some((x) => normalizedHeaderKey(x) === 'tipo')) {
    return parseBackupMultiSection(rows);
  }

  return parseLegacy(rows);
}
