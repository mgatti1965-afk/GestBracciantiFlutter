import type { AppRepository } from '../../data/appRepository';
import { formatCurrencyIt, formatHoursLabel, isDateFestive } from '../../domain/calc';
import {
  workerFullName,
  type AppWorker,
  type OwnerSettings,
  type WorkerWithRate,
} from '../../domain/models';
import type { WorkLog } from '../../domain/workLog';
import {
  buildSummaryPrintHtml,
  openPrintReportPopup,
  type GroupingType,
  type SummaryFilterPeriod,
  type ViewMode,
} from '../printReport';
import {
  escapeHtml,
  formatDayMonth,
  formatDayMonthShort,
  formatFullDate,
  formatMonthYear,
  formatShortDayDate,
  openModal,
  type ToastController,
} from '../utils';

export interface FinancialSummaryState {
  filterPeriod: SummaryFilterPeriod;
  referenceDate: number;
  groupingType: GroupingType;
  viewModeForWorker: ViewMode;
}

function getMondayStart(millis: number): Date {
  const d = new Date(millis);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = midnight.getDay(); // 0=Sun..6=Sat
  const diffToMonday = (day + 6) % 7;
  midnight.setDate(midnight.getDate() - diffToMonday);
  return midnight;
}

function computeDateRange(period: SummaryFilterPeriod, refMillis: number): { start: number; end: number } | null {
  const d = new Date(refMillis);
  if (period === 'YEAR') {
    return null;
  }
  if (period === 'MONTH') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1;
    return { start, end };
  }
  if (period === 'WEEK') {
    const mon = getMondayStart(refMillis);
    const start = mon.getTime();
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7).getTime() - 1;
    return { start, end: sun };
  }
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1;
  return { start, end };
}

function formatPeriodNavLabel(period: SummaryFilterPeriod, refMillis: number, yearId: number): string {
  if (period === 'YEAR') return String(yearId);
  if (period === 'MONTH') return formatMonthYear(refMillis);
  if (period === 'WEEK') {
    const mon = getMondayStart(refMillis);
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    return `${formatDayMonthShort(mon.getTime())} - ${formatDayMonthShort(sun.getTime())}`;
  }
  return formatShortDayDate(refMillis);
}

export async function renderFinancialSummaryView(params: {
  container: HTMLElement;
  repo: AppRepository;
  toast: ToastController;
  yearId: number;
  state: FinancialSummaryState;
}): Promise<void> {
  const { container, repo, toast, yearId, state } = params;

  const [allLogs, workersWithRate, allWorkers, groupsWithMembers, settings] = await Promise.all([
    repo.getLogsForYear(yearId),
    repo.getWorkersWithRateForYear(yearId),
    repo.getAllWorkers(),
    repo.getGroupsWithMembersForYear(yearId),
    repo.getSettings(),
  ]);

  // Keep referenceDate anchored within yearId
  if (new Date(state.referenceDate).getFullYear() !== yearId) {
    const now = new Date();
    state.referenceDate =
      now.getFullYear() === yearId
        ? new Date(yearId, now.getMonth(), now.getDate()).getTime()
        : new Date(yearId, 0, 1).getTime();
  }

  const range = computeDateRange(state.filterPeriod, state.referenceDate);
  const filteredLogs = range
    ? allLogs.filter((l) => l.date >= range.start && l.date <= range.end)
    : allLogs;

  const workerMap = new Map<number, AppWorker | WorkerWithRate>();
  for (const w of allWorkers) workerMap.set(w.id, w);
  for (const w of workersWithRate) workerMap.set(w.id, w);

  const effectiveViewMode: ViewMode =
    state.groupingType === 'BY_GROUP' ? 'TOTALS' : state.viewModeForWorker;

  container.innerHTML = '';
  const screen = document.createElement('section');
  screen.className = 'screen financial-summary-screen';

  // Period Tabs (Anno | Mese | Settimana | Giorno) + Export PDF
  const topControls = document.createElement('div');
  topControls.className = 'summary-top-row';
  const periodTabs: Array<{ id: SummaryFilterPeriod; label: string }> = [
    { id: 'YEAR', label: 'Anno' },
    { id: 'MONTH', label: 'Mese' },
    { id: 'WEEK', label: 'Settimana' },
    { id: 'DAY', label: 'Giorno' },
  ];
  topControls.innerHTML = `
    <div class="period-tabs">
      ${periodTabs
        .map(
          (t) =>
            `<button type="button" class="period-tab ${state.filterPeriod === t.id ? 'active' : ''}" data-period="${t.id}">${t.label}</button>`,
        )
        .join('')}
    </div>
    <button type="button" class="btn btn-primary btn-sm" id="summary-pdf-btn" ${filteredLogs.length === 0 ? 'disabled' : ''}>
      📄 Report PDF / Stampa
    </button>
  `;
  topControls.querySelectorAll<HTMLButtonElement>('[data-period]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.filterPeriod = btn.dataset.period as SummaryFilterPeriod;
      await renderFinancialSummaryView(params);
    });
  });
  screen.appendChild(topControls);

  // Period Navigator
  const navBar = document.createElement('div');
  navBar.className = 'month-nav-card compact-nav';
  const navDisabled = state.filterPeriod === 'YEAR';
  navBar.innerHTML = `
    <button type="button" class="btn-icon-nav" id="sum-prev-btn" ${navDisabled ? 'disabled' : ''}>‹</button>
    <strong class="period-label">${escapeHtml(formatPeriodNavLabel(state.filterPeriod, state.referenceDate, yearId))}</strong>
    <button type="button" class="btn-icon-nav" id="sum-next-btn" ${navDisabled ? 'disabled' : ''}>›</button>
  `;

  const movePeriod = (delta: number) => {
    const d = new Date(state.referenceDate);
    if (state.filterPeriod === 'MONTH') {
      const currentMonth = d.getMonth();
      const targetMonth = currentMonth + delta;
      if (targetMonth >= 0 && targetMonth <= 11) {
        state.referenceDate = new Date(yearId, targetMonth, 1).getTime();
      }
    } else if (state.filterPeriod === 'WEEK') {
      const newD = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta * 7);
      const mon = getMondayStart(newD.getTime());
      const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
      if (mon.getFullYear() === yearId || sun.getFullYear() === yearId) {
        state.referenceDate = newD.getTime();
      }
    } else if (state.filterPeriod === 'DAY') {
      const newD = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
      if (newD.getFullYear() === yearId) {
        state.referenceDate = newD.getTime();
      }
    }
  };

  navBar.querySelector('#sum-prev-btn')?.addEventListener('click', async () => {
    movePeriod(-1);
    await renderFinancialSummaryView(params);
  });
  navBar.querySelector('#sum-next-btn')?.addEventListener('click', async () => {
    movePeriod(1);
    await renderFinancialSummaryView(params);
  });
  screen.appendChild(navBar);

  // Segmented Toggles (Bracc/Grp blue, Dett/Tot orange)
  const togglesRow = document.createElement('div');
  togglesRow.className = 'summary-toggles-row';
  const detailAvailable = state.groupingType === 'BY_WORKER';
  togglesRow.innerHTML = `
    <div class="seg-group seg-blue">
      <button type="button" class="seg-btn ${state.groupingType === 'BY_WORKER' ? 'active' : ''}" data-group="BY_WORKER">👤 Bracc</button>
      <button type="button" class="seg-btn ${state.groupingType === 'BY_GROUP' ? 'active' : ''}" data-group="BY_GROUP">👥 Grp</button>
    </div>
    <div class="seg-group seg-orange">
      <button type="button" class="seg-btn ${detailAvailable && effectiveViewMode === 'DETAIL' ? 'active' : ''}" data-mode="DETAIL" ${detailAvailable ? '' : 'disabled'}>📝 Dett</button>
      <button type="button" class="seg-btn ${effectiveViewMode === 'TOTALS' ? 'active' : ''}" data-mode="TOTALS" ${detailAvailable ? '' : 'disabled'}>📊 Tot</button>
    </div>
  `;
  togglesRow.querySelectorAll<HTMLButtonElement>('[data-group]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.groupingType = btn.dataset.group as GroupingType;
      await renderFinancialSummaryView(params);
    });
  });
  togglesRow.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.viewModeForWorker = btn.dataset.mode as ViewMode;
      await renderFinancialSummaryView(params);
    });
  });
  screen.appendChild(togglesRow);

  // PDF Report Modal
  topControls.querySelector('#summary-pdf-btn')?.addEventListener('click', () => {
    let selectedWorkerId: number | null = null;
    const modal = openModal({ title: 'Genera Report PDF' });

    if (state.groupingType === 'BY_GROUP') {
      modal.body.innerHTML = '<p class="modal-text">Verrà generato il report per i gruppi come visualizzati a video.</p>';
    } else {
      const workerIdsInPeriod = [...new Set(filteredLogs.map((l) => l.workerId))].sort((a, b) =>
        workerFullName(workerMap.get(a), a).localeCompare(workerFullName(workerMap.get(b), b), 'it'),
      );

      const list = document.createElement('div');
      list.className = 'checklist';
      list.innerHTML = `
        <p class="muted small-note">Seleziona i braccianti da includere:</p>
        <label class="radio-card selected">
          <input type="radio" name="pdf-worker" value="" checked />
          <span>Tutti i braccianti</span>
        </label>
        <hr class="divider" />
        ${workerIdsInPeriod
          .map(
            (wId) => `
          <label class="radio-card">
            <input type="radio" name="pdf-worker" value="${wId}" />
            <span>${escapeHtml(workerFullName(workerMap.get(wId), wId))}</span>
          </label>
        `,
          )
          .join('')}
      `;

      list.querySelectorAll<HTMLInputElement>('input[name="pdf-worker"]').forEach((radio) => {
        radio.addEventListener('change', () => {
          selectedWorkerId = radio.value ? Number(radio.value) : null;
          list.querySelectorAll('.radio-card').forEach((card) => card.classList.remove('selected'));
          radio.closest('.radio-card')?.classList.add('selected');
        });
      });

      modal.body.appendChild(list);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = 'Annulla';
    cancelBtn.addEventListener('click', () => modal.close());

    const genBtn = document.createElement('button');
    genBtn.type = 'button';
    genBtn.className = 'btn btn-primary';
    genBtn.textContent = 'Genera PDF / Stampa';
    genBtn.addEventListener('click', () => {
      try {
        const html = buildSummaryPrintHtml({
          logs: filteredLogs,
          workers: allWorkers,
          configs: [],
          groups: groupsWithMembers,
          settings,
          filterPeriod: state.filterPeriod,
          referenceDate: state.referenceDate,
          groupingType: state.groupingType,
          viewMode: effectiveViewMode,
          selectedWorkerId: selectedWorkerId ?? undefined,
        });
        modal.close();
        openPrintReportPopup(html);
        toast.show('Report pronto per stampa / salvataggio PDF.');
      } catch (err) {
        toast.show(err instanceof Error ? err.message : 'Errore generazione report.', true);
      }
    });

    modal.footer.append(cancelBtn, genBtn);
  });

  if (filteredLogs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-card';
    empty.textContent =
      state.filterPeriod === 'YEAR'
        ? "Nessun movimento registrato nell'anno."
        : 'Nessun dato disponibile per questa selezione.';
    screen.appendChild(empty);
    container.appendChild(screen);
    return;
  }

  // Group logs by month (newest month first)
  const byMonth = new Map<number, WorkLog[]>();
  for (const log of filteredLogs) {
    const m = new Date(log.date).getMonth();
    const list = byMonth.get(m) ?? [];
    list.push(log);
    byMonth.set(m, list);
  }

  const allGroupedWorkerIds = new Set<number>();
  const groupMemberIdsMap = new Map<number, Set<number>>();
  for (const g of groupsWithMembers) {
    const ids = new Set(g.members.map((m) => m.id));
    groupMemberIdsMap.set(g.group.id, ids);
    for (const id of ids) allGroupedWorkerIds.add(id);
  }

  const periodTotalLabel =
    state.filterPeriod === 'WEEK'
      ? 'Totale Settimanale'
      : state.filterPeriod === 'DAY'
        ? 'Totale Giornaliero'
        : 'Totale Mensile';

  const monthsWrap = document.createElement('div');
  monthsWrap.className = 'months-stack';

  for (const [, mLogs] of [...byMonth.entries()].sort((a, b) => b[0] - a[0])) {
    const monthName = formatMonthYear(mLogs[0].date);
    const monthSection = document.createElement('section');
    monthSection.className = 'month-summary-block';

    const mHead = document.createElement('div');
    mHead.className = 'month-summary-heading';
    mHead.textContent = monthName;
    monthSection.appendChild(mHead);

    const cardList = document.createElement('div');
    cardList.className = 'card-list';

    if (state.groupingType === 'BY_GROUP') {
      const groupBuckets: Array<{ title: string; logs: WorkLog[] }> = [];
      for (const { group } of groupsWithMembers) {
        const ids = groupMemberIdsMap.get(group.id) ?? new Set<number>();
        const gLogs = mLogs.filter((l) => ids.has(l.workerId));
        if (gLogs.length > 0) {
          groupBuckets.push({ title: group.name, logs: gLogs });
        }
      }
      const noGroup = mLogs.filter((l) => !allGroupedWorkerIds.has(l.workerId));
      if (noGroup.length > 0) {
        groupBuckets.push({ title: 'Senza Gruppo', logs: noGroup });
      }
      groupBuckets.forEach((bucket, idx) => {
        cardList.appendChild(
          createAggregatedCard({
            title: bucket.title,
            subtitle: 'Totale Gruppo',
            periodName: monthName,
            logs: bucket.logs,
            alt: idx % 2 === 1,
          }),
        );
      });
    } else if (effectiveViewMode === 'TOTALS') {
      const byWorker = new Map<number, WorkLog[]>();
      for (const l of mLogs) {
        const list = byWorker.get(l.workerId) ?? [];
        list.push(l);
        byWorker.set(l.workerId, list);
      }
      [...byWorker.entries()]
        .sort((a, b) =>
          workerFullName(workerMap.get(a[0]), a[0]).localeCompare(
            workerFullName(workerMap.get(b[0]), b[0]),
            'it',
          ),
        )
        .forEach(([wId, wLogs], idx) => {
          cardList.appendChild(
            createAggregatedCard({
              title: workerFullName(workerMap.get(wId), wId),
              subtitle: 'Totale Bracciante',
              periodName: monthName,
              logs: wLogs,
              alt: idx % 2 === 1,
            }),
          );
        });
    } else {
      const sorted = [...mLogs].sort(
        (a, b) =>
          b.date - a.date ||
          workerFullName(workerMap.get(a.workerId), a.workerId).localeCompare(
            workerFullName(workerMap.get(b.workerId), b.workerId),
            'it',
          ),
      );
      const uniqueDates = [...new Set(sorted.map((l) => l.date))];
      const dayColorIdx = new Map(uniqueDates.map((d, i) => [d, i]));

      sorted.forEach((log) => {
        const wName = workerFullName(workerMap.get(log.workerId), log.workerId);
        const dayIdx = dayColorIdx.get(log.date) ?? 0;

        const card = document.createElement('article');
        card.className = `card summary-detail-card clickable ${dayIdx % 2 === 1 ? 'card-alt' : ''}`;
        card.innerHTML = `
          <div class="summary-detail-top">
            <span class="date-pill ${log.isManualHoliday ? 'date-pill-festive' : dayIdx % 2 === 0 ? 'date-pill-amber' : 'date-pill-green'}">
              ${escapeHtml(formatDayMonth(log.date))}
            </span>
            <strong class="summary-worker-name">${escapeHtml(wName)}</strong>
            <div class="summary-right">
              <span class="muted small-note">${escapeHtml(formatHoursLabel(log.totalHours))}</span>
              <strong class="${log.isManualHoliday ? 'text-festive' : 'text-primary'}">${escapeHtml(formatCurrencyIt(log.totalAmount))}</strong>
            </div>
          </div>
          <div class="chips-row">
            ${log.ordinaryHours > 0 ? `<span class="stat-chip chip-ord">Ord ${escapeHtml(formatHoursLabel(log.ordinaryHours))}</span>` : ''}
            ${log.extraHours > 0 ? `<span class="stat-chip chip-str">STR ${escapeHtml(formatHoursLabel(log.extraHours))}</span>` : ''}
            ${log.holidayHours > 0 ? `<span class="stat-chip chip-fest">fest ${escapeHtml(formatHoursLabel(log.holidayHours))}</span>` : ''}
          </div>
        `;
        card.addEventListener('click', () => openLogReadonlyDialog(log, wName, settings));
        cardList.appendChild(card);
      });
    }

    monthSection.appendChild(cardList);

    const mHours = mLogs.reduce((s, l) => s + l.totalHours, 0);
    const mEarnings = mLogs.reduce((s, l) => s + l.totalAmount, 0);
    const subFooter = document.createElement('div');
    subFooter.className = 'month-subtotal-row';
    subFooter.innerHTML = `
      <span>${escapeHtml(periodTotalLabel)}</span>
      <div class="month-subtotal-values">
        <strong>${escapeHtml(formatHoursLabel(mHours))}</strong>
        <strong class="text-primary">${escapeHtml(formatCurrencyIt(mEarnings))}</strong>
      </div>
    `;
    monthSection.appendChild(subFooter);
    monthsWrap.appendChild(monthSection);
  }

  screen.appendChild(monthsWrap);

  // Overall Summary Card (RIEPILOGO COMPLESSIVO)
  const totalOrdH = filteredLogs.reduce((s, l) => s + l.ordinaryHours, 0);
  const totalExtH = filteredLogs.reduce((s, l) => s + l.extraHours, 0);
  const totalHolH = filteredLogs.reduce((s, l) => s + l.holidayHours, 0);
  const totalOrdA = filteredLogs.reduce((s, l) => s + l.ordinaryAmount, 0);
  const totalExtA = filteredLogs.reduce((s, l) => s + l.extraAmount, 0);
  const totalHolA = filteredLogs.reduce((s, l) => s + l.holidayAmount, 0);
  const grandH = totalOrdH + totalExtH + totalHolH;
  const grandA = totalOrdA + totalExtA + totalHolA;

  const grandCard = document.createElement('article');
  grandCard.className = 'grand-summary-card';
  grandCard.innerHTML = `
    <div class="grand-kicker">RIEPILOGO COMPLESSIVO</div>
    <div class="grand-main-grid">
      <div>
        <div class="muted small-note">Ore Totali</div>
        <div class="grand-hours">${escapeHtml(formatHoursLabel(grandH))}</div>
      </div>
      <div>
        <div class="muted small-note">Importo Totale</div>
        <div class="grand-amount">${escapeHtml(formatCurrencyIt(grandA))}</div>
      </div>
    </div>
    <hr class="divider" />
    <div class="grand-breakdown">
      <div class="breakdown-row">
        <span>Ordinarie</span>
        <span>${escapeHtml(formatHoursLabel(totalOrdH))} · <strong>${escapeHtml(formatCurrencyIt(totalOrdA))}</strong></span>
      </div>
      <div class="breakdown-row">
        <span>Straordinari</span>
        <span>${escapeHtml(formatHoursLabel(totalExtH))} · <strong>${escapeHtml(formatCurrencyIt(totalExtA))}</strong></span>
      </div>
      <div class="breakdown-row">
        <span>Festivi</span>
        <span>${escapeHtml(formatHoursLabel(totalHolH))} · <strong>${escapeHtml(formatCurrencyIt(totalHolA))}</strong></span>
      </div>
    </div>
  `;
  screen.appendChild(grandCard);

  container.appendChild(screen);
}

function createAggregatedCard(params: {
  title: string;
  subtitle: string;
  periodName: string;
  logs: WorkLog[];
  alt: boolean;
}): HTMLElement {
  const ordH = params.logs.reduce((s, l) => s + l.ordinaryHours, 0);
  const extH = params.logs.reduce((s, l) => s + l.extraHours, 0);
  const holH = params.logs.reduce((s, l) => s + l.holidayHours, 0);
  const ordA = params.logs.reduce((s, l) => s + l.ordinaryAmount, 0);
  const extA = params.logs.reduce((s, l) => s + l.extraAmount, 0);
  const holA = params.logs.reduce((s, l) => s + l.holidayAmount, 0);
  const totalH = params.logs.reduce((s, l) => s + l.totalHours, 0);
  const totalA = params.logs.reduce((s, l) => s + l.totalAmount, 0);

  const card = document.createElement('article');
  card.className = `card summary-agg-card clickable ${params.alt ? 'card-alt' : ''}`;
  card.innerHTML = `
    <div class="summary-agg-top">
      <div>
        <strong>${escapeHtml(params.title)}</strong>
        <div class="muted small-note">${escapeHtml(params.subtitle)}</div>
      </div>
      <div class="summary-right">
        <span class="muted small-note">${escapeHtml(formatHoursLabel(totalH))}</span>
        <strong class="text-primary">${escapeHtml(formatCurrencyIt(totalA))}</strong>
      </div>
    </div>
    <div class="chips-row">
      ${ordH > 0 ? `<span class="stat-chip chip-ord">Ord ${escapeHtml(formatHoursLabel(ordH))}</span>` : ''}
      ${extH > 0 ? `<span class="stat-chip chip-str">STR ${escapeHtml(formatHoursLabel(extH))}</span>` : ''}
      ${holH > 0 ? `<span class="stat-chip chip-fest">fest ${escapeHtml(formatHoursLabel(holH))}</span>` : ''}
    </div>
  `;

  card.addEventListener('click', () => {
    const modal = openModal({ title: `${params.title} — ${params.periodName}` });
    modal.body.innerHTML = `
      <div class="detail-box">
        ${ordH > 0 ? `<div class="detail-row"><span>Ordinarie</span><span>${escapeHtml(formatHoursLabel(ordH))} (${escapeHtml(formatCurrencyIt(ordA))})</span></div>` : ''}
        ${extH > 0 ? `<div class="detail-row"><span>Straordinari</span><span>${escapeHtml(formatHoursLabel(extH))} (${escapeHtml(formatCurrencyIt(extA))})</span></div>` : ''}
        ${holH > 0 ? `<div class="detail-row"><span>Festivi</span><span>${escapeHtml(formatHoursLabel(holH))} (${escapeHtml(formatCurrencyIt(holA))})</span></div>` : ''}
        <hr class="divider" />
        <div class="detail-row"><strong>Ore Totali</strong><strong>${escapeHtml(formatHoursLabel(totalH))}</strong></div>
        <div class="detail-row"><strong class="text-primary">Importo Totale</strong><strong class="text-primary">${escapeHtml(formatCurrencyIt(totalA))}</strong></div>
      </div>
      <p class="muted small-note">Riepilogo dei compensi per il periodo selezionato.</p>
    `;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary';
    btn.textContent = 'Chiudi';
    btn.addEventListener('click', () => modal.close());
    modal.footer.appendChild(btn);
  });

  return card;
}

function openLogReadonlyDialog(log: WorkLog, workerName: string, settings: OwnerSettings): void {
  const isFest = isDateFestive(
    log.date,
    log.isManualHoliday,
    settings.festiveDaysType,
    new Set(settings.globalFestiveDates),
  );
  const modal = openModal({ title: `${workerName} — ${formatFullDate(log.date)}` });
  const mInterval = log.morningStart && log.morningEnd ? `${log.morningStart} - ${log.morningEnd}` : 'N/A';
  const pInterval = log.afternoonStart && log.afternoonEnd ? `${log.afternoonStart} - ${log.afternoonEnd}` : 'N/A';

  modal.body.innerHTML = `
    <div class="detail-box">
      ${isFest ? '<span class="badge badge-festive">FESTIVO</span>' : ''}
      <div class="detail-row"><span>Mattina</span><span>${escapeHtml(mInterval)}</span></div>
      <div class="detail-row"><span>Pomeriggio</span><span>${escapeHtml(pInterval)}</span></div>
      <hr class="divider" />
      ${
        isFest
          ? `
        <div class="detail-row"><strong>Festivi</strong><strong>${escapeHtml(formatHoursLabel(log.holidayHours))}</strong></div>
        <div class="detail-row"><span>Importo fest</span><span>${escapeHtml(formatCurrencyIt(log.holidayAmount))}</span></div>
      `
          : `
        <div class="detail-row"><span>Ordinarie</span><span>${escapeHtml(formatHoursLabel(log.ordinaryHours))}</span></div>
        ${log.extraHours > 0 ? `<div class="detail-row"><span>Straordinari</span><span>${escapeHtml(formatHoursLabel(log.extraHours))}</span></div>` : ''}
        <div class="detail-row"><strong>Ore Totali</strong><strong>${escapeHtml(formatHoursLabel(log.totalHours))}</strong></div>
        <div class="detail-row"><span>Importo Ord</span><span>${escapeHtml(formatCurrencyIt(log.ordinaryAmount))}</span></div>
        ${log.extraHours > 0 ? `<div class="detail-row"><span>Importo STR</span><span>${escapeHtml(formatCurrencyIt(log.extraAmount))}</span></div>` : ''}
      `
      }
      <hr class="divider" />
      <div class="detail-row"><strong class="${isFest ? 'text-festive' : 'text-primary'}">Importo</strong><strong class="${isFest ? 'text-festive' : 'text-primary'}">${escapeHtml(formatCurrencyIt(log.totalAmount))}</strong></div>
    </div>
    <p class="muted small-note">Vista in sola lettura. Per modificare, usa la sezione Ore → Dettaglio Giornata.</p>
  `;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary';
  btn.textContent = 'Chiudi';
  btn.addEventListener('click', () => modal.close());
  modal.footer.appendChild(btn);
}
