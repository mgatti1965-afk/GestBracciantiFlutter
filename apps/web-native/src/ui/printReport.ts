import { formatCurrencyIt, formatHoursLabel, isDateFestive } from '../domain/calc';
import {
  workerFullName,
  type AppWorker,
  type OwnerSettings,
  type WorkerGroup,
  type WorkerYearConfig,
} from '../domain/models';
import type { WorkLog } from '../domain/workLog';
import { escapeHtml, formatDayMonth, formatFullDate, formatMonthYear } from './utils';

export type GroupingType = 'BY_WORKER' | 'BY_GROUP';
export type ViewMode = 'DETAIL' | 'TOTALS';
export type SummaryFilterPeriod = 'YEAR' | 'MONTH' | 'WEEK' | 'DAY';

export interface PrintSummaryParams {
  logs: WorkLog[];
  workers: AppWorker[];
  configs: WorkerYearConfig[];
  groups: Array<{ group: WorkerGroup; members: AppWorker[] }>;
  settings: OwnerSettings;
  filterPeriod: SummaryFilterPeriod;
  referenceDate: number;
  groupingType: GroupingType;
  viewMode: ViewMode;
  selectedWorkerId?: number;
}

function getIsoWeekLabel(millis: number): string {
  const date = new Date(millis);
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `Settimana ${weekNo}, ${utc.getUTCFullYear()}`;
}

export function buildSummaryPrintHtml(params: PrintSummaryParams): string {
  const filteredLogs =
    params.selectedWorkerId !== undefined
      ? params.logs.filter((l) => l.workerId === params.selectedWorkerId)
      : params.logs;

  if (filteredLogs.length === 0) {
    throw new Error('Nessun movimento da stampare per la selezione corrente.');
  }

  const effectiveGrouping: GroupingType =
    params.selectedWorkerId !== undefined ? 'BY_WORKER' : params.groupingType;
  const effectiveViewMode: ViewMode =
    effectiveGrouping === 'BY_GROUP' ? 'TOTALS' : params.viewMode;

  const workerMap = new Map(params.workers.map((w) => [w.id, w]));
  const globalSet = new Set(params.settings.globalFestiveDates);

  const periodLabel =
    params.filterPeriod === 'MONTH'
      ? formatMonthYear(params.referenceDate)
      : params.filterPeriod === 'WEEK'
        ? getIsoWeekLabel(params.referenceDate)
        : params.filterPeriod === 'DAY'
          ? formatFullDate(params.referenceDate)
          : String(new Date(params.referenceDate).getFullYear());

  const modeText =
    effectiveGrouping === 'BY_GROUP' ? 'Raggruppamento: Gruppi' : 'Raggruppamento: Braccianti';
  const viewText = effectiveViewMode === 'TOTALS' ? 'Vista: Solo Totali' : 'Vista: Dettaglio';
  const companyName = `${params.settings.ownerSurname} ${params.settings.ownerName}`.trim();

  // Group logs by month index ascending
  const byMonth = new Map<number, WorkLog[]>();
  for (const log of filteredLogs) {
    const m = new Date(log.date).getMonth();
    const list = byMonth.get(m) ?? [];
    list.push(log);
    byMonth.set(m, list);
  }

  let totalOverallHours = 0;
  let totalOverallEarnings = 0;
  let totalOrdH = 0;
  let totalExtH = 0;
  let totalHolH = 0;
  let totalOrdA = 0;
  let totalExtA = 0;
  let totalHolA = 0;

  const groupMemberIdsMap = new Map<number, Set<number>>();
  const allGroupedWorkerIds = new Set<number>();
  for (const g of params.groups) {
    const ids = new Set(g.members.map((m) => m.id));
    groupMemberIdsMap.set(g.group.id, ids);
    for (const id of ids) {
      allGroupedWorkerIds.add(id);
    }
  }

  const monthBlocks = [...byMonth.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, mLogs]) => {
      for (const l of mLogs) {
        totalOrdH += l.ordinaryHours;
        totalExtH += l.extraHours;
        totalHolH += l.holidayHours;
        totalOrdA += l.ordinaryAmount;
        totalExtA += l.extraAmount;
        totalHolA += l.holidayAmount;
        totalOverallHours += l.totalHours;
        totalOverallEarnings += l.totalAmount;
      }

      const monthTitle = formatMonthYear(mLogs[0].date).toUpperCase();
      let contentHtml = '';

      if (effectiveGrouping === 'BY_GROUP') {
        const groupSections: string[] = [];
        for (const { group } of params.groups) {
          const memberIds = groupMemberIdsMap.get(group.id) ?? new Set<number>();
          const gLogs = mLogs.filter((l) => memberIds.has(l.workerId));
          if (gLogs.length === 0) continue;
          groupSections.push(renderAggregateRowHtml(group.name, gLogs, 'TOTALE GRUPPO'));
        }
        const noGroupLogs = mLogs.filter((l) => !allGroupedWorkerIds.has(l.workerId));
        if (noGroupLogs.length > 0) {
          groupSections.push(renderAggregateRowHtml('Senza Gruppo', noGroupLogs, 'TOTALE'));
        }
        contentHtml = groupSections.join('');
      } else if (effectiveViewMode === 'TOTALS') {
        const byWorker = new Map<number, WorkLog[]>();
        for (const l of mLogs) {
          const list = byWorker.get(l.workerId) ?? [];
          list.push(l);
          byWorker.set(l.workerId, list);
        }
        contentHtml = [...byWorker.entries()]
          .sort((a, b) => {
            const na = workerFullName(workerMap.get(a[0]), a[0]);
            const nb = workerFullName(workerMap.get(b[0]), b[0]);
            return na.localeCompare(nb, 'it');
          })
          .map(([wId, wLogs]) =>
            renderAggregateRowHtml(workerFullName(workerMap.get(wId), wId), wLogs, 'TOTALE'),
          )
          .join('');
      } else {
        const rowsHtml = mLogs
          .slice()
          .sort((a, b) => a.date - b.date || a.id - b.id)
          .map((log) => {
            const wName = workerFullName(workerMap.get(log.workerId), log.workerId);
            const isFest = isDateFestive(
              log.date,
              log.isManualHoliday,
              params.settings.festiveDaysType,
              globalSet,
            );
            const festMark = isFest ? '*' : '';
            const shifts = [
              log.morningStart && log.morningEnd ? `M ${log.morningStart}-${log.morningEnd}` : '',
              log.afternoonStart && log.afternoonEnd ? `P ${log.afternoonStart}-${log.afternoonEnd}` : '',
            ]
              .filter(Boolean)
              .join(' | ');
            return `
              <tr>
                <td>${escapeHtml(formatDayMonth(log.date) + festMark)}</td>
                <td>${escapeHtml(wName)}</td>
                <td>${escapeHtml(shifts || '-')}</td>
                <td>${escapeHtml(formatHoursLabel(log.ordinaryHours))}</td>
                <td>${escapeHtml(formatHoursLabel(log.extraHours))}</td>
                <td>${escapeHtml(formatHoursLabel(log.holidayHours))}</td>
                <td class="num"><strong>${escapeHtml(formatCurrencyIt(log.totalAmount))}</strong></td>
              </tr>
            `;
          })
          .join('');

        contentHtml = `
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Bracciante</th>
                <th>Orari</th>
                <th>Ord</th>
                <th>Str</th>
                <th>Fes</th>
                <th class="num">Importo</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        `;
      }

      const monthHours = mLogs.reduce((s, l) => s + l.totalHours, 0);
      const monthEarnings = mLogs.reduce((s, l) => s + l.totalAmount, 0);

      return `
        <section class="month-block">
          <h2>${escapeHtml(monthTitle)}</h2>
          ${contentHtml}
          <p class="period-total">TOTALE PERIODO: ${escapeHtml(formatHoursLabel(monthHours))} | ${escapeHtml(formatCurrencyIt(monthEarnings))}</p>
        </section>
      `;
    })
    .join('');

  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <title>Riepilogo Presenze e Compensi</title>
    <style>
      body { font-family: "Segoe UI", Arial, sans-serif; color: #16222a; margin: 24px; font-size: 12px; }
      .header { border-bottom: 2px solid #1b4332; padding-bottom: 10px; margin-bottom: 18px; }
      h1 { margin: 0 0 6px; font-size: 18px; color: #1b4332; }
      h2 { margin: 16px 0 8px; font-size: 14px; color: #1b4332; border-bottom: 1px solid #d8cfbf; padding-bottom: 4px; }
      p { margin: 3px 0; }
      .meta { color: #4b5563; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; margin: 8px 0 10px; }
      th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
      th { background: #f4ebd0; font-weight: 700; }
      .num { text-align: right; white-space: nowrap; }
      .agg-card { border: 1px solid #d8cfbf; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; background: #faf5e9; }
      .agg-title { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
      .agg-split { display: flex; gap: 18px; font-size: 11px; color: #374151; margin-bottom: 4px; }
      .agg-total { font-weight: 700; }
      .period-total { font-weight: 700; margin: 8px 0 14px; color: #1b4332; }
      .grand-box { border-top: 2px solid #1b4332; margin-top: 20px; padding-top: 12px; }
      .grand-box h2 { border: none; margin-top: 0; }
      .grand-line { font-size: 14px; font-weight: 700; margin-top: 8px; color: #1b4332; }
      @media print {
        body { margin: 12mm; }
        .month-block { break-inside: avoid-page; }
        tr { break-inside: avoid; }
        thead { display: table-header-group; }
      }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>RIEPILOGO PRESENZE E COMPENSI</h1>
      ${companyName ? `<p><strong>Azienda:</strong> ${escapeHtml(companyName)}</p>` : ''}
      <p><strong>Periodo:</strong> ${escapeHtml(periodLabel)}</p>
      <p class="meta">${escapeHtml(modeText)} | ${escapeHtml(viewText)} | * = giornata festiva</p>
    </div>

    ${monthBlocks}

    <div class="grand-box">
      <h2>RIEPILOGO COMPLESSIVO</h2>
      <p>Ore ordinarie: ${escapeHtml(formatHoursLabel(totalOrdH))} (${escapeHtml(formatCurrencyIt(totalOrdA))})</p>
      <p>Ore straordinarie: ${escapeHtml(formatHoursLabel(totalExtH))} (${escapeHtml(formatCurrencyIt(totalExtA))})</p>
      <p>Ore festive: ${escapeHtml(formatHoursLabel(totalHolH))} (${escapeHtml(formatCurrencyIt(totalHolA))})</p>
      <p>Ore totali: <strong>${escapeHtml(formatHoursLabel(totalOverallHours))}</strong></p>
      <p class="grand-line">Importo totale: ${escapeHtml(formatCurrencyIt(totalOverallEarnings))}</p>
    </div>
  </body>
</html>`;
}

function renderAggregateRowHtml(title: string, logs: WorkLog[], totalLabel: string): string {
  const ordH = logs.reduce((s, l) => s + l.ordinaryHours, 0);
  const extH = logs.reduce((s, l) => s + l.extraHours, 0);
  const holH = logs.reduce((s, l) => s + l.holidayHours, 0);
  const ordA = logs.reduce((s, l) => s + l.ordinaryAmount, 0);
  const extA = logs.reduce((s, l) => s + l.extraAmount, 0);
  const holA = logs.reduce((s, l) => s + l.holidayAmount, 0);
  const totalH = logs.reduce((s, l) => s + l.totalHours, 0);
  const totalA = logs.reduce((s, l) => s + l.totalAmount, 0);

  return `
    <div class="agg-card">
      <div class="agg-title">${escapeHtml(title)}</div>
      <div class="agg-split">
        <span>Ord: ${escapeHtml(formatHoursLabel(ordH))} (${escapeHtml(formatCurrencyIt(ordA))})</span>
        <span>Str: ${escapeHtml(formatHoursLabel(extH))} (${escapeHtml(formatCurrencyIt(extA))})</span>
        <span>Fes: ${escapeHtml(formatHoursLabel(holH))} (${escapeHtml(formatCurrencyIt(holA))})</span>
      </div>
      <div class="agg-total">${escapeHtml(totalLabel)}: ${escapeHtml(formatHoursLabel(totalH))} | ${escapeHtml(formatCurrencyIt(totalA))}</div>
    </div>
  `;
}

export function openPrintReportPopup(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document;
  if (!iframeDoc || !iframe.contentWindow) {
    iframe.remove();
    const popup = window.open('', '_blank');
    if (!popup) {
      throw new Error('Impossibile aprire la finestra di stampa. Consenti i popup per questo sito.');
    }
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
    return;
  }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow?.print();
    setTimeout(() => {
      iframe.remove();
    }, 1000);
  }, 250);
}
