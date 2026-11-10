import { computeCompensation } from './domain/calc';
import { HarvestYearRepository } from './data/harvestYearRepository';
import { WorkerRepository } from './data/workerRepository';
import { WorkLogRepository } from './data/workLogRepository';
import { CsvCompatRepository } from './data/csvCompatRepository';
import { type WorkLog } from './domain/workLog';

const yearRepository = new HarvestYearRepository();
const workerRepository = new WorkerRepository();
const workLogRepository = new WorkLogRepository();
const csvRepository = new CsvCompatRepository();

function must<T>(value: T | null, message: string): T {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function parseStrictNumber(value: string, label: string): number {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) {
    throw new Error(`${label} obbligatorio.`);
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} non valido.`);
  }
  return parsed;
}

function parseStrictYear(value: string): number {
  const parsed = parseStrictNumber(value, 'Annata');
  if (!Number.isInteger(parsed)) {
    throw new Error('Annata non valida. Inserisci un anno intero.');
  }
  return parsed;
}

function hasInvalidDateRange(from: string, to: string): boolean {
  return Boolean(from && to && from > to);
}

export async function renderApp(): Promise<HTMLElement> {
  await yearRepository.seedIfEmpty();

  const wrapper = document.createElement('main');
  wrapper.className = 'layout';

  const hero = document.createElement('section');
  hero.className = 'hero';
  hero.innerHTML = `
    <p class="eyebrow">GestBraccianti • Web Native MVP</p>
    <h1>Registro ore con regole canoniche condivise</h1>
    <p class="lead">Scaffold web nativo con gestione annate persistente (IndexedDB) e modulo calcolo allineato alle regole condivise.</p>
  `;

  const yearPanel = document.createElement('section');
  yearPanel.className = 'panel';
  yearPanel.innerHTML = `
    <h2>Gestione annate (IndexedDB)</h2>
    <form class="year-form" id="year-form">
      <label>
        Annata
        <input id="year-input" name="year" type="number" min="2000" max="2100" required />
      </label>
      <label>
        Note
        <input id="notes-input" name="notes" type="text" placeholder="Vendemmia" />
      </label>
      <button type="submit">Aggiungi annata</button>
    </form>
    <p id="year-error" class="error" aria-live="polite"></p>
    <div id="years-list" class="years-list"></div>
  `;

  const demo = document.createElement('section');
  demo.className = 'panel';

  const workersPanel = document.createElement('section');
  workersPanel.className = 'panel';
  workersPanel.innerHTML = `
    <h2>Braccianti per annata corrente</h2>
    <p id="workers-year" class="muted"></p>
    <form class="worker-form" id="worker-form">
      <label>
        Nome
        <input id="worker-name" name="name" type="text" required />
      </label>
      <label>
        Cognome
        <input id="worker-surname" name="surname" type="text" required />
      </label>
      <label>
        Telefono
        <input id="worker-phone" name="phone" type="text" />
      </label>
      <div class="worker-form-actions">
        <button id="worker-submit" type="submit">Aggiungi bracciante</button>
        <button id="worker-cancel-edit" type="button" class="secondary" hidden>Annulla modifica</button>
      </div>
    </form>
    <p id="worker-error" class="error" aria-live="polite"></p>
    <p id="worker-status" class="muted" aria-live="polite"></p>
    <div id="workers-list" class="workers-list"></div>
  `;

  const logsPanel = document.createElement('section');
  logsPanel.className = 'panel';
  logsPanel.innerHTML = `
    <h2>Log giornalieri</h2>
    <div class="log-filters">
      <label>
        Da data
        <input id="logs-filter-from" type="date" />
      </label>
      <label>
        A data
        <input id="logs-filter-to" type="date" />
      </label>
      <label>
        Bracciante
        <select id="logs-filter-worker"></select>
      </label>
      <div class="log-filters-actions">
        <button id="logs-filter-reset" type="button" class="secondary">Reset filtri</button>
      </div>
    </div>
    <form class="log-form" id="log-form">
      <label>
        Data
        <input id="log-date" name="date" type="date" required />
      </label>
      <label>
        Bracciante
        <select id="log-worker" name="worker" required></select>
      </label>
      <label>
        Ore totali
        <input id="log-hours" name="hours" type="number" step="0.25" min="0" required value="8" />
      </label>
      <label>
        Soglia extra
        <input id="log-threshold" name="threshold" type="number" step="0.25" min="0" required value="8" />
      </label>
      <label>
        Tariffa ord
        <input id="log-rate" name="rate" type="number" step="0.01" min="0" required value="9.5" />
      </label>
      <label>
        Tariffa extra
        <input id="log-rate-extra" name="rateExtra" type="number" step="0.01" min="0" required value="12" />
      </label>
      <label>
        Tariffa festiva
        <input id="log-rate-holiday" name="rateHoliday" type="number" step="0.01" min="0" required value="14" />
      </label>
      <label class="checkline">
        <input id="log-holiday" name="holiday" type="checkbox" />
        Festivo manuale
      </label>
      <div class="log-form-actions">
        <button id="log-submit" type="submit">Salva log</button>
        <button id="log-cancel-edit" type="button" class="secondary" hidden>Annulla modifica</button>
      </div>
    </form>
    <p id="log-error" class="error" aria-live="polite"></p>
    <p id="log-status" class="muted" aria-live="polite"></p>
    <div id="logs-list" class="logs-list"></div>
  `;

  const printPanel = document.createElement('section');
  printPanel.className = 'panel';
  printPanel.innerHTML = `
    <h2>Stampe</h2>
    <p class="muted">Stampa un riepilogo completo dell'annata corrente con totali per bracciante e dettaglio giornaliero.</p>
    <div class="print-range">
      <label>
        Da data (stampa)
        <input id="print-from" type="date" />
      </label>
      <label>
        A data (stampa)
        <input id="print-to" type="date" />
      </label>
    </div>
    <div class="print-filters">
      <label>
        Bracciante stampa
        <select id="print-worker"></select>
      </label>
      <label class="checkline">
        <input id="print-only-active-workers" type="checkbox" />
        Escludi braccianti archiviati
      </label>
      <label class="checkline">
        <input id="print-only-holiday" type="checkbox" />
        Solo giornate festive
      </label>
      <label class="checkline">
        <input id="print-monthly-summary" type="checkbox" />
        Riepilogo mensile (richiede bracciante)
      </label>
      <label class="checkline">
        <input id="print-weekly-summary" type="checkbox" />
        Riepilogo settimanale (richiede bracciante)
      </label>
    </div>
    <div class="print-actions">
      <button id="print-current-year" type="button">Stampa riepilogo annata corrente</button>
    </div>
    <p id="print-error" class="error" aria-live="polite"></p>
    <p id="print-status" class="muted" aria-live="polite"></p>
  `;

  const csvPanel = document.createElement('section');
  csvPanel.className = 'panel';
  csvPanel.innerHTML = `
    <h2>Import/Export CSV (fase successiva)</h2>
    <p class="muted">Esporta o importa un file CSV completo (annate, braccianti, log).</p>
    <div class="csv-actions">
      <button id="csv-export" type="button">Esporta CSV</button>
      <form id="csv-import-form" class="csv-import-form">
        <input id="csv-file" type="file" accept=".csv,text/csv" required />
        <button type="submit" class="secondary">Importa CSV</button>
      </form>
    </div>
    <p id="csv-error" class="error" aria-live="polite"></p>
    <p id="csv-status" class="muted" aria-live="polite"></p>
  `;

  const sample = computeCompensation({
    totalHours: 10,
    extraThreshold: 8,
    isHoliday: false,
    hourlyRate: 9.5,
    extraHourlyRate: 12,
    holidayHourlyRate: 14,
  });

  demo.innerHTML = `
    <h2>Demo regole R1-R3</h2>
    <div class="grid">
      <article>
        <h3>Input</h3>
        <ul>
          <li>Ore totali: 10</li>
          <li>Soglia extra: 8</li>
          <li>Festivo: no</li>
          <li>Tariffa ord: 9.50</li>
          <li>Tariffa extra: 12.00</li>
          <li>Tariffa festiva: 14.00</li>
        </ul>
      </article>
      <article>
        <h3>Output calcolato</h3>
        <ul>
          <li>Ordinarie: ${sample.ordinaryHours.toFixed(2)}h</li>
          <li>Straordinarie: ${sample.extraHours.toFixed(2)}h</li>
          <li>Festive: ${sample.holidayHours.toFixed(2)}h</li>
          <li>Compenso totale: € ${sample.totalAmount.toFixed(2)}</li>
        </ul>
      </article>
    </div>
  `;

  const footer = document.createElement('footer');
  footer.className = 'foot';
  footer.textContent = 'Priorita: stabilita gestionale web e stampe. CSV in fase successiva.';

  const yearsList = must(yearPanel.querySelector<HTMLDivElement>('#years-list'), 'Markup gestione annate non valido: years-list');
  const yearError = must(yearPanel.querySelector<HTMLParagraphElement>('#year-error'), 'Markup gestione annate non valido: year-error');
  const yearForm = must(yearPanel.querySelector<HTMLFormElement>('#year-form'), 'Markup gestione annate non valido: year-form');
  const yearInput = must(yearPanel.querySelector<HTMLInputElement>('#year-input'), 'Markup gestione annate non valido: year-input');
  const notesInput = must(yearPanel.querySelector<HTMLInputElement>('#notes-input'), 'Markup gestione annate non valido: notes-input');
  const yearSubmit = must(yearPanel.querySelector<HTMLButtonElement>('button[type="submit"]'), 'Markup gestione annate non valido: year-submit');

  const workersYear = must(workersPanel.querySelector<HTMLParagraphElement>('#workers-year'), 'Markup gestione braccianti non valido: workers-year');
  const workersList = must(workersPanel.querySelector<HTMLDivElement>('#workers-list'), 'Markup gestione braccianti non valido: workers-list');
  const workerError = must(workersPanel.querySelector<HTMLParagraphElement>('#worker-error'), 'Markup gestione braccianti non valido: worker-error');
  const workerStatus = must(workersPanel.querySelector<HTMLParagraphElement>('#worker-status'), 'Markup gestione braccianti non valido: worker-status');
  const workerForm = must(workersPanel.querySelector<HTMLFormElement>('#worker-form'), 'Markup gestione braccianti non valido: worker-form');
  const workerName = must(workersPanel.querySelector<HTMLInputElement>('#worker-name'), 'Markup gestione braccianti non valido: worker-name');
  const workerSurname = must(workersPanel.querySelector<HTMLInputElement>('#worker-surname'), 'Markup gestione braccianti non valido: worker-surname');
  const workerPhone = must(workersPanel.querySelector<HTMLInputElement>('#worker-phone'), 'Markup gestione braccianti non valido: worker-phone');
  const workerSubmit = must(workersPanel.querySelector<HTMLButtonElement>('#worker-submit'), 'Markup gestione braccianti non valido: worker-submit');
  const workerCancelEdit = must(workersPanel.querySelector<HTMLButtonElement>('#worker-cancel-edit'), 'Markup gestione braccianti non valido: worker-cancel-edit');

  const logForm = must(logsPanel.querySelector<HTMLFormElement>('#log-form'), 'Markup log non valido: log-form');
  const logDate = must(logsPanel.querySelector<HTMLInputElement>('#log-date'), 'Markup log non valido: log-date');
  const logWorker = must(logsPanel.querySelector<HTMLSelectElement>('#log-worker'), 'Markup log non valido: log-worker');
  const logHours = must(logsPanel.querySelector<HTMLInputElement>('#log-hours'), 'Markup log non valido: log-hours');
  const logThreshold = must(logsPanel.querySelector<HTMLInputElement>('#log-threshold'), 'Markup log non valido: log-threshold');
  const logRate = must(logsPanel.querySelector<HTMLInputElement>('#log-rate'), 'Markup log non valido: log-rate');
  const logRateExtra = must(logsPanel.querySelector<HTMLInputElement>('#log-rate-extra'), 'Markup log non valido: log-rate-extra');
  const logRateHoliday = must(logsPanel.querySelector<HTMLInputElement>('#log-rate-holiday'), 'Markup log non valido: log-rate-holiday');
  const logHoliday = must(logsPanel.querySelector<HTMLInputElement>('#log-holiday'), 'Markup log non valido: log-holiday');
  const logSubmit = must(logsPanel.querySelector<HTMLButtonElement>('#log-submit'), 'Markup log non valido: log-submit');
  const logCancelEdit = must(logsPanel.querySelector<HTMLButtonElement>('#log-cancel-edit'), 'Markup log non valido: log-cancel-edit');
  const logsFilterFrom = must(logsPanel.querySelector<HTMLInputElement>('#logs-filter-from'), 'Markup log non valido: logs-filter-from');
  const logsFilterTo = must(logsPanel.querySelector<HTMLInputElement>('#logs-filter-to'), 'Markup log non valido: logs-filter-to');
  const logsFilterWorker = must(logsPanel.querySelector<HTMLSelectElement>('#logs-filter-worker'), 'Markup log non valido: logs-filter-worker');
  const logsFilterReset = must(logsPanel.querySelector<HTMLButtonElement>('#logs-filter-reset'), 'Markup log non valido: logs-filter-reset');
  const logError = must(logsPanel.querySelector<HTMLParagraphElement>('#log-error'), 'Markup log non valido: log-error');
  const logStatus = must(logsPanel.querySelector<HTMLParagraphElement>('#log-status'), 'Markup log non valido: log-status');
  const logsList = must(logsPanel.querySelector<HTMLDivElement>('#logs-list'), 'Markup log non valido: logs-list');

  const printCurrentYearButton = must(printPanel.querySelector<HTMLButtonElement>('#print-current-year'), 'Markup stampe non valido: print-current-year');
  const printFrom = must(printPanel.querySelector<HTMLInputElement>('#print-from'), 'Markup stampe non valido: print-from');
  const printTo = must(printPanel.querySelector<HTMLInputElement>('#print-to'), 'Markup stampe non valido: print-to');
  const printWorker = must(printPanel.querySelector<HTMLSelectElement>('#print-worker'), 'Markup stampe non valido: print-worker');
  const printOnlyActiveWorkers = must(printPanel.querySelector<HTMLInputElement>('#print-only-active-workers'), 'Markup stampe non valido: print-only-active-workers');
  const printOnlyHoliday = must(printPanel.querySelector<HTMLInputElement>('#print-only-holiday'), 'Markup stampe non valido: print-only-holiday');
  const printMonthlySummary = must(printPanel.querySelector<HTMLInputElement>('#print-monthly-summary'), 'Markup stampe non valido: print-monthly-summary');
  const printWeeklySummary = must(printPanel.querySelector<HTMLInputElement>('#print-weekly-summary'), 'Markup stampe non valido: print-weekly-summary');
  const printError = must(printPanel.querySelector<HTMLParagraphElement>('#print-error'), 'Markup stampe non valido: print-error');
  const printStatus = must(printPanel.querySelector<HTMLParagraphElement>('#print-status'), 'Markup stampe non valido: print-status');

  const csvExportButton = must(csvPanel.querySelector<HTMLButtonElement>('#csv-export'), 'Markup CSV non valido: csv-export');
  const csvImportForm = must(csvPanel.querySelector<HTMLFormElement>('#csv-import-form'), 'Markup CSV non valido: csv-import-form');
  const csvFileInput = must(csvPanel.querySelector<HTMLInputElement>('#csv-file'), 'Markup CSV non valido: csv-file');
  const csvImportSubmit = must(csvImportForm.querySelector<HTMLButtonElement>('button[type="submit"]'), 'Markup CSV non valido: csv-import-submit');
  const csvError = must(csvPanel.querySelector<HTMLParagraphElement>('#csv-error'), 'Markup CSV non valido: csv-error');
  const csvStatus = must(csvPanel.querySelector<HTMLParagraphElement>('#csv-status'), 'Markup CSV non valido: csv-status');

  let editingLogId: number | null = null;
  let editingWorkerId: number | null = null;
  let yearFormBusy = false;
  let workerFormBusy = false;
  let logFormBusy = false;
  let csvExportBusy = false;
  let csvImportBusy = false;
  let printBusy = false;

  function clearWorkerMessages(): void {
    workerError.textContent = '';
    workerStatus.textContent = '';
  }

  function resetWorkerFormMode(): void {
    editingWorkerId = null;
    workerSubmit.textContent = 'Aggiungi bracciante';
    workerCancelEdit.hidden = true;
  }

  function clearLogMessages(): void {
    logError.textContent = '';
    logStatus.textContent = '';
  }

  function resetLogFormMode(): void {
    editingLogId = null;
    logSubmit.textContent = 'Salva log';
    logCancelEdit.hidden = true;
  }

  function clearCsvMessages(): void {
    csvError.textContent = '';
    csvStatus.textContent = '';
  }

  function downloadCsv(content: string): void {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const filename = `gestbraccianti-backup-${yyyy}${mm}${dd}-${hh}${min}.csv`;

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function formatDate(millis: number): string {
    const d = new Date(millis);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy}`;
  }

  function formatCurrency(value: number): string {
    return value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setTodayIfEmpty(): void {
    if (logDate.value) {
      return;
    }
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    logDate.value = `${yyyy}-${mm}-${dd}`;
  }

  function toIsoDateFromMillis(millis: number): string {
    const d = new Date(millis);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function toIsoWeekKey(millis: number): string {
    const date = new Date(millis);
    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  function readPrintRange(): { from?: number; to?: number; label: string } {
    const from = printFrom.value ? new Date(`${printFrom.value}T00:00:00`).getTime() : undefined;
    const to = printTo.value ? new Date(`${printTo.value}T23:59:59`).getTime() : undefined;
    const label = `${printFrom.value || 'inizio annata'} - ${printTo.value || 'fine annata'}`;
    return { from, to, label };
  }

  function readActiveFilters(): { from?: number; to?: number; workerId?: number } {
    if (hasInvalidDateRange(logsFilterFrom.value, logsFilterTo.value)) {
      throw new Error('Intervallo filtri non valido: la data iniziale supera la data finale.');
    }

    const from = logsFilterFrom.value ? new Date(`${logsFilterFrom.value}T00:00:00`).getTime() : undefined;
    const to = logsFilterTo.value ? new Date(`${logsFilterTo.value}T23:59:59`).getTime() : undefined;
    const workerId = logsFilterWorker.value ? Number(logsFilterWorker.value) : undefined;
    return { from, to, workerId };
  }

  function applyLogFilters(logs: WorkLog[]): WorkLog[] {
    const filters = readActiveFilters();
    return logs.filter((log) => {
      if (filters.workerId !== undefined && log.workerId !== filters.workerId) {
        return false;
      }
      if (filters.from !== undefined && log.date < filters.from) {
        return false;
      }
      if (filters.to !== undefined && log.date > filters.to) {
        return false;
      }
      return true;
    });
  }

  async function getCurrentYearContext(): Promise<{
    yearId: number;
    workers: Awaited<ReturnType<typeof workerRepository.getForYear>>;
    logs: WorkLog[];
  } | null> {
    const currentYear = await yearRepository.getCurrentYear();
    if (!currentYear) {
      return null;
    }

    const [workers, logs] = await Promise.all([
      workerRepository.getForYear(currentYear.id),
      workLogRepository.getForYear(currentYear.id),
    ]);

    return {
      yearId: currentYear.id,
      workers,
      logs,
    };
  }

  async function syncLogFilterWorkerSelect(): Promise<void> {
    const currentYear = await yearRepository.getCurrentYear();
    const previous = logsFilterWorker.value;
    logsFilterWorker.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'Tutti i braccianti';
    logsFilterWorker.appendChild(allOption);

    if (!currentYear) {
      return;
    }

    const workers = await workerRepository.getForYear(currentYear.id);
    for (const worker of workers) {
      const opt = document.createElement('option');
      opt.value = String(worker.id);
      opt.textContent = `${worker.surname} ${worker.name}`;
      logsFilterWorker.appendChild(opt);
    }

    if ([...logsFilterWorker.options].some((opt) => opt.value === previous)) {
      logsFilterWorker.value = previous;
    }
  }

  async function syncPrintWorkerSelect(): Promise<void> {
    const currentYear = await yearRepository.getCurrentYear();
    const previous = printWorker.value;
    printWorker.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'Tutti i braccianti';
    printWorker.appendChild(allOption);

    if (!currentYear) {
      return;
    }

    const workers = await workerRepository.getForYear(currentYear.id);
    for (const worker of workers) {
      const opt = document.createElement('option');
      opt.value = String(worker.id);
      opt.textContent = `${worker.surname} ${worker.name}${worker.isArchived ? ' (archiviato)' : ''}`;
      printWorker.appendChild(opt);
    }

    if ([...printWorker.options].some((opt) => opt.value === previous)) {
      printWorker.value = previous;
    }
  }

  async function refreshWorkerSelect() {
    logWorker.innerHTML = '';
    const currentYear = await yearRepository.getCurrentYear();
    if (!currentYear) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Nessuna annata corrente';
      logWorker.appendChild(opt);
      return;
    }

    const workers = await workerRepository.getActiveForYear(currentYear.id);
    if (workers.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Nessun bracciante attivo';
      logWorker.appendChild(opt);
      return;
    }

    for (const worker of workers) {
      const opt = document.createElement('option');
      opt.value = String(worker.id);
      opt.textContent = `${worker.surname} ${worker.name}`;
      logWorker.appendChild(opt);
    }
  }

  function fillLogFormFromRecord(log: WorkLog): void {
    logDate.value = toIsoDateFromMillis(log.date);
    logWorker.value = String(log.workerId);
    logHours.value = String(log.totalHours);
    logHoliday.checked = log.isManualHoliday;
    logRate.value = String(log.hourlyRate);
    logRateExtra.value = String(log.extraHourlyRate);
    logRateHoliday.value = String(log.holidayHourlyRate);

    if (!log.isManualHoliday && log.ordinaryHours > 0) {
      logThreshold.value = String(log.ordinaryHours);
    }
  }

  async function refreshLogs() {
    clearLogMessages();
    logsList.innerHTML = '';

    const context = await getCurrentYearContext();
    if (!context) {
      logsList.innerHTML = '<p class="muted">Seleziona una annata corrente per vedere i log.</p>';
      return;
    }

    const { workers, logs } = context;
    let filteredLogs: WorkLog[] = [];
    try {
      filteredLogs = applyLogFilters(logs);
    } catch (error) {
      logError.textContent = error instanceof Error ? error.message : 'Filtri log non validi.';
      logsList.innerHTML = '<p class="muted">Correggi i filtri data per visualizzare i log.</p>';
      return;
    }

    const workerMap = new Map<number, string>();
    for (const worker of workers) {
      workerMap.set(worker.id, `${worker.surname} ${worker.name}`);
    }

    if (logs.length === 0) {
      logsList.innerHTML = '<p class="muted">Nessun log registrato per questa annata.</p>';
      return;
    }

    if (filteredLogs.length === 0) {
      logsList.innerHTML = '<p class="muted">Nessun log per i filtri selezionati.</p>';
      return;
    }

    for (const log of filteredLogs) {
      const row = document.createElement('article');
      row.className = 'log-row';
      const workerLabel = workerMap.get(log.workerId) ?? `Bracciante #${log.workerId}`;
      const festive = log.isManualHoliday ? '<span class="badge warn">festivo</span>' : '';
      row.innerHTML = `
        <div>
          <h3>${formatDate(log.date)} • ${workerLabel} ${festive}</h3>
          <p class="year-notes">Ore: ${log.totalHours.toFixed(2)} | Ord: ${log.ordinaryHours.toFixed(2)} | Extra: ${log.extraHours.toFixed(2)} | Fest: ${log.holidayHours.toFixed(2)}</p>
        </div>
        <div class="log-row-actions">
          <strong>€ ${log.totalAmount.toFixed(2)}</strong>
          <button type="button" class="secondary" data-log-edit="${log.id}">Modifica</button>
          <button type="button" class="secondary" data-log-delete="${log.id}">Elimina</button>
        </div>
      `;

      const editButton = row.querySelector<HTMLButtonElement>(`button[data-log-edit="${log.id}"]`);
      if (editButton) {
        editButton.addEventListener('click', () => {
          clearLogMessages();
          editingLogId = log.id;
          fillLogFormFromRecord(log);
          logSubmit.textContent = 'Aggiorna log';
          logCancelEdit.hidden = false;
          logStatus.textContent = `Modifica log #${log.id} in corso.`;
          logForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }

      const deleteButton = row.querySelector<HTMLButtonElement>(`button[data-log-delete="${log.id}"]`);
      if (deleteButton) {
        deleteButton.addEventListener('click', async () => {
          clearLogMessages();
          const ok = window.confirm('Confermi eliminazione del log selezionato?');
          if (!ok) {
            return;
          }
          try {
            await workLogRepository.remove(log.id);
            if (editingLogId === log.id) {
              logForm.reset();
              setTodayIfEmpty();
              resetLogFormMode();
            }
            await refreshLogs();
            logStatus.textContent = `Log #${log.id} eliminato.`;
          } catch (error) {
            logError.textContent = error instanceof Error ? error.message : 'Errore eliminazione log.';
          }
        });
      }

      logsList.appendChild(row);
    }
  }

  async function buildPrintHtml(): Promise<string> {
    const currentYear = await yearRepository.getCurrentYear();
    if (!currentYear) {
      throw new Error('Nessuna annata corrente da stampare.');
    }

    const [workers, logs] = await Promise.all([
      workerRepository.getForYear(currentYear.id),
      workLogRepository.getForYear(currentYear.id),
    ]);

    const printRange = readPrintRange();
    if (printRange.from !== undefined && printRange.to !== undefined && printRange.from > printRange.to) {
      throw new Error('Intervallo stampa non valido: la data iniziale supera la finale.');
    }

    const filteredLogsByPrintRange = logs.filter((log) => {
      if (printRange.from !== undefined && log.date < printRange.from) {
        return false;
      }
      if (printRange.to !== undefined && log.date > printRange.to) {
        return false;
      }
      return true;
    });

    const activeOnly = printOnlyActiveWorkers.checked;
    const holidayOnly = printOnlyHoliday.checked;
    const selectedPrintWorkerId = printWorker.value ? Number(printWorker.value) : undefined;
    const includeMonthlySummary = printMonthlySummary.checked;
    const includeWeeklySummary = printWeeklySummary.checked;

    if ((includeMonthlySummary || includeWeeklySummary) && selectedPrintWorkerId === undefined) {
      throw new Error('Per i riepiloghi per periodo seleziona prima un bracciante stampa.');
    }

    const activeWorkerIds = new Set(workers.filter((w) => !w.isArchived).map((w) => w.id));
    const filteredLogs = filteredLogsByPrintRange.filter((log) => {
      if (selectedPrintWorkerId !== undefined && log.workerId !== selectedPrintWorkerId) {
        return false;
      }
      if (activeOnly && !activeWorkerIds.has(log.workerId)) {
        return false;
      }
      if (holidayOnly && !log.isManualHoliday) {
        return false;
      }
      return true;
    });

    if (filteredLogs.length === 0) {
      throw new Error('Nessun log presente per l\'annata corrente.');
    }

    const workerMap = new Map<number, { label: string; archived: boolean }>();
    for (const worker of workers) {
      workerMap.set(worker.id, {
        label: `${worker.surname} ${worker.name}`,
        archived: worker.isArchived,
      });
    }

    const totalsByWorker = new Map<number, {
      ordinaryHours: number;
      extraHours: number;
      holidayHours: number;
      totalAmount: number;
      logsCount: number;
    }>();

    for (const log of filteredLogs) {
      const current = totalsByWorker.get(log.workerId) ?? {
        ordinaryHours: 0,
        extraHours: 0,
        holidayHours: 0,
        totalAmount: 0,
        logsCount: 0,
      };
      current.ordinaryHours += log.ordinaryHours;
      current.extraHours += log.extraHours;
      current.holidayHours += log.holidayHours;
      current.totalAmount += log.totalAmount;
      current.logsCount += 1;
      totalsByWorker.set(log.workerId, current);
    }

    const workerTotalsRows = [...totalsByWorker.entries()]
      .sort((a, b) => {
        const labelA = workerMap.get(a[0])?.label ?? `Bracciante #${a[0]}`;
        const labelB = workerMap.get(b[0])?.label ?? `Bracciante #${b[0]}`;
        return labelA.localeCompare(labelB, 'it');
      })
      .map(([workerId, totals]) => {
        const workerInfo = workerMap.get(workerId);
        const label = workerInfo?.label ?? `Bracciante #${workerId}`;
        const archived = workerInfo?.archived ? ' (archiviato)' : '';
        return `
          <tr>
            <td>${escapeHtml(label + archived)}</td>
            <td>${totals.logsCount}</td>
            <td>${totals.ordinaryHours.toFixed(2)}</td>
            <td>${totals.extraHours.toFixed(2)}</td>
            <td>${totals.holidayHours.toFixed(2)}</td>
            <td>€ ${formatCurrency(totals.totalAmount)}</td>
          </tr>
        `;
      })
      .join('');

    const logsByWorker = new Map<number, WorkLog[]>();
    for (const log of filteredLogs.slice().sort((a, b) => a.date - b.date || a.id - b.id)) {
      const current = logsByWorker.get(log.workerId) ?? [];
      current.push(log);
      logsByWorker.set(log.workerId, current);
    }

    const detailSectionsHtml = [...logsByWorker.entries()]
      .sort((a, b) => {
        const labelA = workerMap.get(a[0])?.label ?? `Bracciante #${a[0]}`;
        const labelB = workerMap.get(b[0])?.label ?? `Bracciante #${b[0]}`;
        return labelA.localeCompare(labelB, 'it');
      })
      .map(([workerId, workerLogs]) => {
        const workerLabel = workerMap.get(workerId)?.label ?? `Bracciante #${workerId}`;
        const rows = workerLogs
          .map((log) => {
            const festiveLabel = log.isManualHoliday ? 'Sì' : 'No';
            return `
              <tr>
                <td>${escapeHtml(formatDate(log.date))}</td>
                <td>${log.totalHours.toFixed(2)}</td>
                <td>${log.ordinaryHours.toFixed(2)}</td>
                <td>${log.extraHours.toFixed(2)}</td>
                <td>${log.holidayHours.toFixed(2)}</td>
                <td>${festiveLabel}</td>
                <td>€ ${formatCurrency(log.totalAmount)}</td>
              </tr>
            `;
          })
          .join('');

        const subtotal = workerLogs.reduce((sum, log) => sum + log.totalAmount, 0);

        return `
          <section class="sheet page-break">
            <h2>Dettaglio giornaliero - ${escapeHtml(workerLabel)}</h2>
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Ore tot</th>
                  <th>Ore ord</th>
                  <th>Ore extra</th>
                  <th>Ore fest</th>
                  <th>Festivo</th>
                  <th>Importo</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
            <p class="total">Totale ${escapeHtml(workerLabel)}: € ${formatCurrency(subtotal)}</p>
          </section>
        `;
      })
      .join('');

    let monthlySummaryHtml = '';
    if (includeMonthlySummary && selectedPrintWorkerId !== undefined) {
      const monthly = new Map<string, {
        days: number;
        ordinaryHours: number;
        extraHours: number;
        holidayHours: number;
        totalAmount: number;
      }>();

      for (const log of filteredLogs) {
        const d = new Date(log.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const current = monthly.get(key) ?? {
          days: 0,
          ordinaryHours: 0,
          extraHours: 0,
          holidayHours: 0,
          totalAmount: 0,
        };
        current.days += 1;
        current.ordinaryHours += log.ordinaryHours;
        current.extraHours += log.extraHours;
        current.holidayHours += log.holidayHours;
        current.totalAmount += log.totalAmount;
        monthly.set(key, current);
      }

      const monthRows = [...monthly.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([monthKey, totals]) => `
          <tr>
            <td>${escapeHtml(monthKey)}</td>
            <td>${totals.days}</td>
            <td>${totals.ordinaryHours.toFixed(2)}</td>
            <td>${totals.extraHours.toFixed(2)}</td>
            <td>${totals.holidayHours.toFixed(2)}</td>
            <td>€ ${formatCurrency(totals.totalAmount)}</td>
          </tr>
        `)
        .join('');

      monthlySummaryHtml = `
        <section class="sheet page-break">
          <h2>Riepilogo mensile</h2>
          <table>
            <thead>
              <tr>
                <th>Mese</th>
                <th>Giorni</th>
                <th>Ore ord</th>
                <th>Ore extra</th>
                <th>Ore fest</th>
                <th>Totale</th>
              </tr>
            </thead>
            <tbody>
              ${monthRows}
            </tbody>
          </table>
        </section>
      `;
    }

    let weeklySummaryHtml = '';
    if (includeWeeklySummary && selectedPrintWorkerId !== undefined) {
      const weekly = new Map<string, {
        days: number;
        ordinaryHours: number;
        extraHours: number;
        holidayHours: number;
        totalAmount: number;
      }>();

      for (const log of filteredLogs) {
        const key = toIsoWeekKey(log.date);
        const current = weekly.get(key) ?? {
          days: 0,
          ordinaryHours: 0,
          extraHours: 0,
          holidayHours: 0,
          totalAmount: 0,
        };
        current.days += 1;
        current.ordinaryHours += log.ordinaryHours;
        current.extraHours += log.extraHours;
        current.holidayHours += log.holidayHours;
        current.totalAmount += log.totalAmount;
        weekly.set(key, current);
      }

      const weekRows = [...weekly.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([weekKey, totals]) => `
          <tr>
            <td>${escapeHtml(weekKey)}</td>
            <td>${totals.days}</td>
            <td>${totals.ordinaryHours.toFixed(2)}</td>
            <td>${totals.extraHours.toFixed(2)}</td>
            <td>${totals.holidayHours.toFixed(2)}</td>
            <td>€ ${formatCurrency(totals.totalAmount)}</td>
          </tr>
        `)
        .join('');

      weeklySummaryHtml = `
        <section class="sheet page-break">
          <h2>Riepilogo settimanale</h2>
          <table>
            <thead>
              <tr>
                <th>Settimana</th>
                <th>Giorni</th>
                <th>Ore ord</th>
                <th>Ore extra</th>
                <th>Ore fest</th>
                <th>Totale</th>
              </tr>
            </thead>
            <tbody>
              ${weekRows}
            </tbody>
          </table>
        </section>
      `;
    }

    const grandTotal = filteredLogs.reduce((sum, log) => sum + log.totalAmount, 0);
    const printWorkerText = printWorker.options[printWorker.selectedIndex]?.textContent || 'Tutti i braccianti';
    const printFlags: string[] = [];
    if (activeOnly) {
      printFlags.push('solo braccianti attivi');
    }
    if (holidayOnly) {
      printFlags.push('solo giornate festive');
    }
    if (includeMonthlySummary) {
      printFlags.push('riepilogo mensile attivo');
    }
    if (includeWeeklySummary) {
      printFlags.push('riepilogo settimanale attivo');
    }
    const extraFiltersText = printFlags.length > 0 ? printFlags.join(', ') : 'nessuno';
    const now = new Date();
    const generatedAt = now.toLocaleString('it-IT');

    return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <title>Riepilogo annata ${currentYear.id}</title>
    <style>
      body { font-family: "Segoe UI", sans-serif; color: #1f2937; margin: 24px; }
      h1, h2 { margin: 0 0 10px; }
      p { margin: 4px 0 12px; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; }
      th, td { border: 1px solid #d1d5db; padding: 8px; font-size: 12px; }
      th { background: #f3f4f6; text-align: left; }
      .meta { color: #4b5563; font-size: 12px; }
      .sheet-head { border-bottom: 2px solid #0f172a; margin-bottom: 14px; padding-bottom: 8px; }
      .sheet { margin-bottom: 16px; }
      .total { font-weight: 700; font-size: 16px; margin-top: 8px; }
      @media print {
        body { margin: 12mm; }
        .page-break { break-before: page; page-break-before: always; }
        table { break-inside: auto; page-break-inside: auto; }
        tr, td, th { break-inside: avoid; page-break-inside: avoid; }
        thead { display: table-header-group; }
      }
    </style>
  </head>
  <body>
    <section class="sheet">
      <div class="sheet-head">
        <h1>GestBraccianti - Riepilogo annata ${currentYear.id}</h1>
        <p class="meta">Generato il ${escapeHtml(generatedAt)}</p>
        <p>Note annata: ${escapeHtml(currentYear.notes || '-')}</p>
        <p class="meta">Periodo stampa: ${escapeHtml(printRange.label)}</p>
        <p class="meta">Bracciante stampa: ${escapeHtml(printWorkerText)}</p>
        <p class="meta">Filtri stampa: ${escapeHtml(extraFiltersText)}</p>
      </div>

      <h2>Totali per bracciante</h2>
      <table>
        <thead>
          <tr>
            <th>Bracciante</th>
            <th>Giorni</th>
            <th>Ore ord</th>
            <th>Ore extra</th>
            <th>Ore fest</th>
            <th>Totale</th>
          </tr>
        </thead>
        <tbody>
          ${workerTotalsRows}
        </tbody>
      </table>

      <p class="total">Totale annata: € ${formatCurrency(grandTotal)}</p>
      <p class="meta">Firma responsabile: ______________________________</p>
    </section>

    ${detailSectionsHtml}
    ${monthlySummaryHtml}
    ${weeklySummaryHtml}
  </body>
</html>`;
  }

  async function refreshWorkers() {
    clearWorkerMessages();
    workersList.innerHTML = '';

    const currentYear = await yearRepository.getCurrentYear();
    if (!currentYear) {
      workersYear.textContent = 'Nessuna annata corrente.';
      return;
    }

    workersYear.textContent = `Annata corrente: ${currentYear.id}`;

    const workers = await workerRepository.getForYear(currentYear.id);
    if (workers.length === 0) {
      workersList.innerHTML = '<p class="muted">Nessun bracciante registrato per questa annata.</p>';
      return;
    }

    for (const worker of workers) {
      const row = document.createElement('article');
      row.className = 'worker-row';

      const archivedBadge = worker.isArchived ? '<span class="badge warn">archiviato</span>' : '';
      const phone = worker.phoneNumber ? `<p class="year-notes">Tel: ${worker.phoneNumber}</p>` : '';

      row.innerHTML = `
        <div>
          <h3>${worker.surname} ${worker.name} ${archivedBadge}</h3>
          ${phone}
        </div>
        <div class="worker-row-actions">
          <button type="button" data-worker-edit="${worker.id}" class="secondary">Modifica</button>
          <button type="button" data-worker-toggle="${worker.id}" class="secondary">${worker.isArchived ? 'Riattiva' : 'Archivia'}</button>
          <button type="button" data-worker-delete="${worker.id}" class="secondary">Elimina</button>
        </div>
      `;

      const editBtn = row.querySelector<HTMLButtonElement>('button[data-worker-edit]');
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          clearWorkerMessages();
          editingWorkerId = worker.id;
          workerName.value = worker.name;
          workerSurname.value = worker.surname;
          workerPhone.value = worker.phoneNumber;
          workerSubmit.textContent = 'Aggiorna bracciante';
          workerCancelEdit.hidden = false;
          workerStatus.textContent = `Modifica bracciante #${worker.id} in corso.`;
          workerForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }

      const archiveBtn = row.querySelector<HTMLButtonElement>('button[data-worker-toggle]');
      if (archiveBtn) {
        archiveBtn.addEventListener('click', async () => {
          try {
            await workerRepository.setArchived(worker.id, !worker.isArchived);
            await refreshWorkers();
          } catch (error) {
            workerError.textContent = error instanceof Error ? error.message : 'Errore aggiornando il bracciante.';
          }
        });
      }

      const deleteBtn = row.querySelector<HTMLButtonElement>('button[data-worker-delete]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          clearWorkerMessages();
          try {
            const hasLogs = await workLogRepository.hasAnyForWorker(worker.id);
            if (hasLogs) {
              workerError.textContent = 'Impossibile eliminare: il bracciante ha log associati.';
              return;
            }

            const ok = window.confirm(`Confermi eliminazione di ${worker.surname} ${worker.name}?`);
            if (!ok) {
              return;
            }

            await workerRepository.remove(worker.id);
            if (editingWorkerId === worker.id) {
              workerForm.reset();
              resetWorkerFormMode();
            }
            await refreshWorkers();
            workerStatus.textContent = `Bracciante #${worker.id} eliminato.`;
          } catch (error) {
            workerError.textContent = error instanceof Error ? error.message : 'Errore eliminazione bracciante.';
          }
        });
      }

      workersList.appendChild(row);
    }

    await refreshWorkerSelect();
    await syncLogFilterWorkerSelect();
    await syncPrintWorkerSelect();
    await refreshLogs();
  }

  async function refreshYears() {
    const years = await yearRepository.getAll();
    yearsList.innerHTML = '';

    for (const year of years) {
      const row = document.createElement('article');
      row.className = 'year-row';

      const badge = year.isCurrent ? '<span class="badge">corrente</span>' : '';
      const notes = year.notes ? `<p class="year-notes">${year.notes}</p>` : '';

      row.innerHTML = `
        <div>
          <h3>${year.id} ${badge}</h3>
          ${notes}
        </div>
        <div class="year-row-actions">
          <button type="button" data-year="${year.id}" class="secondary">Seleziona</button>
          <button type="button" data-year-duplicate="${year.id}" class="secondary">Duplica</button>
          <button type="button" data-year-clear="${year.id}" class="secondary">Svuota</button>
          <button type="button" data-year-delete="${year.id}" class="secondary">Elimina</button>
        </div>
      `;

      const selectBtn = row.querySelector<HTMLButtonElement>('button[data-year]');
      if (selectBtn) {
        selectBtn.disabled = year.isCurrent;
        selectBtn.addEventListener('click', async () => {
          yearError.textContent = '';
          try {
            await yearRepository.setCurrentYear(year.id);
            await refreshYears();
            await refreshWorkers();
            await refreshLogs();
          } catch (error) {
            yearError.textContent = error instanceof Error ? error.message : 'Errore impostando annata corrente.';
          }
        });
      }

      const duplicateBtn = row.querySelector<HTMLButtonElement>('button[data-year-duplicate]');
      if (duplicateBtn) {
        duplicateBtn.addEventListener('click', async () => {
          yearError.textContent = '';
          const suggestion = String(year.id + 1);
          const value = window.prompt(`Nuova annata da creare copiando note da ${year.id}:`, suggestion);
          if (!value) {
            return;
          }

          const newYear = Number(value);
          if (!Number.isFinite(newYear)) {
            yearError.textContent = 'Anno non valido.';
            return;
          }

          try {
            const copiedNotes = year.notes ? `${year.notes} (copiata da ${year.id})` : `Copiata da ${year.id}`;
            await yearRepository.createYear(newYear, copiedNotes);
            await refreshYears();
            await refreshWorkers();
            await refreshLogs();
          } catch (error) {
            yearError.textContent = error instanceof Error ? error.message : 'Errore durante duplicazione annata.';
          }
        });
      }

      const clearBtn = row.querySelector<HTMLButtonElement>('button[data-year-clear]');
      if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
          yearError.textContent = '';
          try {
            const [workerCount, logCount] = await Promise.all([
              workerRepository.countForYear(year.id),
              workLogRepository.countForYear(year.id),
            ]);

            if (workerCount === 0 && logCount === 0) {
              yearError.textContent = `Annata ${year.id} gia vuota.`;
              return;
            }

            const confirmText = `SVUOTA ${year.id}`;
            const typed = window.prompt(
              `Per confermare, scrivi "${confirmText}". Operazione irreversibile (${workerCount} braccianti, ${logCount} log).`,
            );

            if (typed !== confirmText) {
              yearError.textContent = 'Svuotamento annata annullato: conferma non valida.';
              return;
            }

            const removedLogs = await workLogRepository.removeAllForYear(year.id);
            const removedWorkers = await workerRepository.removeAllForYear(year.id);

            if (year.isCurrent) {
              workerForm.reset();
              resetWorkerFormMode();
              logForm.reset();
              setTodayIfEmpty();
              resetLogFormMode();
            }

            await refreshYears();
            await refreshWorkers();
            await refreshLogs();
            yearError.textContent = `Annata ${year.id} svuotata: rimossi ${removedWorkers} braccianti e ${removedLogs} log.`;
          } catch (error) {
            yearError.textContent = error instanceof Error ? error.message : 'Errore durante svuotamento annata.';
          }
        });
      }

      const deleteBtn = row.querySelector<HTMLButtonElement>('button[data-year-delete]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          yearError.textContent = '';
          try {
            if (year.isCurrent) {
              yearError.textContent = 'Non puoi eliminare l\'annata corrente. Selezionane prima un\'altra.';
              return;
            }

            const [hasWorkers, hasLogs] = await Promise.all([
              workerRepository.countForYear(year.id),
              workLogRepository.countForYear(year.id),
            ]);

            if (hasWorkers || hasLogs) {
              yearError.textContent = `Impossibile eliminare: ${hasWorkers} braccianti e ${hasLogs} log associati.`;
              return;
            }

            const ok = window.confirm(`Confermi eliminazione annata ${year.id}?`);
            if (!ok) {
              return;
            }

            await yearRepository.removeYear(year.id);
            await refreshYears();
            await refreshWorkers();
            await refreshLogs();
          } catch (error) {
            yearError.textContent = error instanceof Error ? error.message : 'Errore eliminazione annata.';
          }
        });
      }

      yearsList.appendChild(row);
    }
  }

  yearForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    yearError.textContent = '';

    if (yearFormBusy) {
      return;
    }

    yearFormBusy = true;
    yearSubmit.disabled = true;

    let yearValue: number;
    try {
      yearValue = parseStrictYear(yearInput.value);
    } catch (error) {
      yearError.textContent = error instanceof Error ? error.message : 'Anno non valido.';
      yearFormBusy = false;
      yearSubmit.disabled = false;
      return;
    }
    const notesValue = notesInput.value;

    try {
      await yearRepository.createYear(yearValue, notesValue);
      yearForm.reset();
      await refreshYears();
      await refreshWorkers();
      await refreshLogs();
    } catch (error) {
      yearError.textContent = error instanceof Error ? error.message : 'Errore durante la creazione annata.';
    } finally {
      yearFormBusy = false;
      yearSubmit.disabled = false;
    }
  });

  workerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearWorkerMessages();

    if (workerFormBusy) {
      return;
    }

    workerFormBusy = true;
    workerSubmit.disabled = true;

    const currentYear = await yearRepository.getCurrentYear();
    if (!currentYear) {
      workerError.textContent = 'Seleziona prima un\'annata corrente.';
      workerFormBusy = false;
      workerSubmit.disabled = false;
      return;
    }

    try {
      if (editingWorkerId === null) {
        await workerRepository.createForYear({
          yearId: currentYear.id,
          name: workerName.value,
          surname: workerSurname.value,
          phoneNumber: workerPhone.value,
        });
        workerStatus.textContent = 'Bracciante aggiunto.';
      } else {
        const current = await workerRepository.getById(editingWorkerId);
        await workerRepository.update({
          id: editingWorkerId,
          yearId: currentYear.id,
          name: workerName.value,
          surname: workerSurname.value,
          phoneNumber: workerPhone.value,
          isArchived: current?.isArchived ?? false,
        });
        workerStatus.textContent = `Bracciante #${editingWorkerId} aggiornato.`;
      }

      workerForm.reset();
      resetWorkerFormMode();
      await refreshWorkers();
      await refreshLogs();
    } catch (error) {
      workerError.textContent = error instanceof Error ? error.message : 'Errore creazione bracciante.';
    } finally {
      workerFormBusy = false;
      workerSubmit.disabled = false;
    }
  });

  workerCancelEdit.addEventListener('click', () => {
    clearWorkerMessages();
    workerForm.reset();
    resetWorkerFormMode();
    workerStatus.textContent = 'Modifica bracciante annullata.';
  });

  logForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearLogMessages();

    if (logFormBusy) {
      return;
    }

    logFormBusy = true;
    logSubmit.disabled = true;

    const currentYear = await yearRepository.getCurrentYear();
    if (!currentYear) {
      logError.textContent = 'Seleziona prima una annata corrente.';
      logFormBusy = false;
      logSubmit.disabled = false;
      return;
    }

    if (!logWorker.value) {
      logError.textContent = 'Seleziona un bracciante attivo.';
      logFormBusy = false;
      logSubmit.disabled = false;
      return;
    }

    if (!logDate.value) {
      logError.textContent = 'Inserisci una data valida.';
      logFormBusy = false;
      logSubmit.disabled = false;
      return;
    }

    try {
      const totalHours = parseStrictNumber(logHours.value, 'Ore totali');
      const extraThreshold = parseStrictNumber(logThreshold.value, 'Soglia extra');
      const hourlyRate = parseStrictNumber(logRate.value, 'Tariffa ordinaria');
      const extraHourlyRate = parseStrictNumber(logRateExtra.value, 'Tariffa extra');
      const holidayHourlyRate = parseStrictNumber(logRateHoliday.value, 'Tariffa festiva');

      if (totalHours < 0 || extraThreshold < 0 || hourlyRate < 0 || extraHourlyRate < 0 || holidayHourlyRate < 0) {
        throw new Error('Valori numerici non validi: usa numeri positivi.');
      }

      const payload = {
        workerId: Number(logWorker.value),
        harvestYearId: currentYear.id,
        dateIso: logDate.value,
        totalHours,
        isManualHoliday: logHoliday.checked,
        extraThreshold,
        hourlyRate,
        extraHourlyRate,
        holidayHourlyRate,
      };

      if (editingLogId === null) {
        await workLogRepository.create(payload);
        logStatus.textContent = 'Log salvato.';
      } else {
        await workLogRepository.update({
          id: editingLogId,
          ...payload,
        });
        logStatus.textContent = `Log #${editingLogId} aggiornato.`;
      }

      logForm.reset();
      setTodayIfEmpty();
      resetLogFormMode();
      await refreshLogs();
    } catch (error) {
      logError.textContent = error instanceof Error ? error.message : 'Errore salvataggio log.';
    } finally {
      logFormBusy = false;
      logSubmit.disabled = false;
    }
  });

  logCancelEdit.addEventListener('click', () => {
    clearLogMessages();
    logForm.reset();
    setTodayIfEmpty();
    resetLogFormMode();
    logStatus.textContent = 'Modifica annullata.';
  });

  logsFilterFrom.addEventListener('change', async () => {
    await refreshLogs();
  });

  logsFilterTo.addEventListener('change', async () => {
    await refreshLogs();
  });

  logsFilterWorker.addEventListener('change', async () => {
    await refreshLogs();
  });

  logsFilterReset.addEventListener('click', async () => {
    logsFilterFrom.value = '';
    logsFilterTo.value = '';
    logsFilterWorker.value = '';
    await refreshLogs();
  });

  printMonthlySummary.addEventListener('change', () => {
    if (printMonthlySummary.checked) {
      printWeeklySummary.checked = false;
    }
  });

  printWeeklySummary.addEventListener('change', () => {
    if (printWeeklySummary.checked) {
      printMonthlySummary.checked = false;
    }
  });

  csvExportButton.addEventListener('click', async () => {
    if (csvExportBusy) {
      return;
    }

    csvExportBusy = true;
    csvExportButton.disabled = true;
    clearCsvMessages();
    csvStatus.textContent = 'Esportazione in corso...';

    try {
      const csv = await csvRepository.exportCsv();
      downloadCsv(csv);
      csvStatus.textContent = 'Esportazione completata.';
    } catch (error) {
      csvError.textContent = error instanceof Error ? error.message : 'Errore durante esportazione CSV.';
      csvStatus.textContent = '';
    } finally {
      csvExportBusy = false;
      csvExportButton.disabled = false;
    }
  });

  csvImportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearCsvMessages();

    if (csvImportBusy) {
      return;
    }

    csvImportBusy = true;
    csvImportSubmit.disabled = true;

    const file = csvFileInput.files?.[0];
    if (!file) {
      csvError.textContent = 'Seleziona un file CSV da importare.';
      csvImportBusy = false;
      csvImportSubmit.disabled = false;
      return;
    }

    csvStatus.textContent = 'Importazione in corso...';

    try {
      const csvText = await file.text();
      const result = await csvRepository.importCsv(csvText);
      await refreshYears();
      await refreshWorkers();
      await refreshLogs();
      setTodayIfEmpty();
      csvImportForm.reset();
      csvStatus.textContent = `Import completato: ${result.years} annate, ${result.workers} braccianti, ${result.logs} log.`;
    } catch (error) {
      csvError.textContent = error instanceof Error ? error.message : 'Errore durante import CSV.';
      csvStatus.textContent = '';
    } finally {
      csvImportBusy = false;
      csvImportSubmit.disabled = false;
    }
  });

  printCurrentYearButton.addEventListener('click', async () => {
    if (printBusy) {
      return;
    }

    printBusy = true;
    printCurrentYearButton.disabled = true;
    printError.textContent = '';
    printStatus.textContent = 'Preparazione stampa in corso...';

    try {
      const html = await buildPrintHtml();
      const popup = window.open('', '_blank', 'noopener,noreferrer');
      if (!popup) {
        throw new Error('Impossibile aprire la finestra di stampa. Verifica i popup del browser.');
      }
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      popup.print();
      printStatus.textContent = 'Stampa avviata.';
    } catch (error) {
      printError.textContent = error instanceof Error ? error.message : 'Errore durante la preparazione della stampa.';
      printStatus.textContent = '';
    } finally {
      printBusy = false;
      printCurrentYearButton.disabled = false;
    }
  });

  setTodayIfEmpty();
  await refreshYears();
  await refreshWorkers();
  await syncLogFilterWorkerSelect();
  await refreshLogs();

  wrapper.append(hero, yearPanel, workersPanel, logsPanel, printPanel, csvPanel, demo, footer);
  return wrapper;
}
