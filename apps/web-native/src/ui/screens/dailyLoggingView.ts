import type { AppRepository } from '../../data/appRepository';
import { formatHoursLabel, isDateFestive } from '../../domain/calc';
import { toLocalMidnightMillis } from '../../domain/models';
import {
  escapeHtml,
  formatDayName,
  formatMonthYear,
  type ToastController,
} from '../utils';

export interface DailyLoggingState {
  yearId: number;
  referenceDate: number;
  selectedDate: number | null;
  isCalendarExpanded: boolean;
}

export async function renderDailyLoggingView(params: {
  container: HTMLElement;
  repo: AppRepository;
  toast: ToastController;
  state: DailyLoggingState;
  onOpenDayDetail: (dateMillis: number) => void;
}): Promise<void> {
  const { container, repo, toast, state, onOpenDayDetail } = params;

  const [allLogs, settings] = await Promise.all([
    repo.getLogsForYear(state.yearId),
    repo.getSettings(),
  ]);

  const refDate = new Date(state.referenceDate);
  const viewMonth = refDate.getMonth();
  const viewYear = state.yearId;
  const monthStart = new Date(viewYear, viewMonth, 1);

  const globalFestiveSet = new Set(settings.globalFestiveDates);
  const todayMidnight = toLocalMidnightMillis(new Date());

  // Aggregate logs for the active month
  const workedDaysHours = new Map<number, number>();
  const workedDaysCount = new Map<number, number>();
  const logsByDate = new Map<number, typeof allLogs>();

  for (const log of allLogs) {
    const list = logsByDate.get(log.date) ?? [];
    list.push(log);
    logsByDate.set(log.date, list);

    const d = new Date(log.date);
    if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
      workedDaysHours.set(log.date, (workedDaysHours.get(log.date) ?? 0) + log.totalHours);
      workedDaysCount.set(log.date, (workedDaysCount.get(log.date) ?? 0) + 1);
    }
  }

  const registeredDaysInMonth = [...workedDaysHours.keys()].sort((a, b) => b - a);

  container.innerHTML = '';
  const screen = document.createElement('section');
  screen.className = 'screen daily-logging-screen';

  // Month Navigation Header
  const monthBar = document.createElement('div');
  monthBar.className = 'month-nav-card';
  const isFirstMonth = viewMonth === 0;
  const isLastMonth = viewMonth === 11;
  monthBar.innerHTML = `
    <button type="button" class="btn-icon-nav" id="prev-month-btn" ${isFirstMonth ? 'disabled' : ''} aria-label="Mese precedente">‹</button>
    <h3 class="month-title">${escapeHtml(formatMonthYear(monthStart.getTime()))}</h3>
    <button type="button" class="btn-icon-nav" id="next-month-btn" ${isLastMonth ? 'disabled' : ''} aria-label="Mese successivo">›</button>
  `;

  monthBar.querySelector('#prev-month-btn')?.addEventListener('click', async () => {
    if (viewMonth > 0) {
      state.referenceDate = new Date(viewYear, viewMonth - 1, 1).getTime();
      await renderDailyLoggingView(params);
    }
  });
  monthBar.querySelector('#next-month-btn')?.addEventListener('click', async () => {
    if (viewMonth < 11) {
      state.referenceDate = new Date(viewYear, viewMonth + 1, 1).getTime();
      await renderDailyLoggingView(params);
    }
  });
  screen.appendChild(monthBar);

  // Expandable Calendar Grid (Mon-Sun)
  const calendarWrap = document.createElement('div');
  calendarWrap.className = 'calendar-card';

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = monthStart.getDay(); // 0=Sun..6=Sat
  const offset = (firstWeekday + 6) % 7; // Monday = 0
  const totalRows = Math.ceil((daysInMonth + offset) / 7);

  let rowToShow = 0;
  if (!state.isCalendarExpanded) {
    const focusMillis = state.selectedDate ?? todayMidnight;
    const focusDate = new Date(focusMillis);
    const dayToFocus =
      focusDate.getFullYear() === viewYear && focusDate.getMonth() === viewMonth
        ? focusDate.getDate()
        : new Date(todayMidnight).getFullYear() === viewYear &&
            new Date(todayMidnight).getMonth() === viewMonth
          ? new Date(todayMidnight).getDate()
          : 1;
    rowToShow = Math.floor((dayToFocus + offset - 1) / 7);
  }

  const weekdayHeader = document.createElement('div');
  weekdayHeader.className = 'calendar-weekdays';
  for (const label of ['L', 'M', 'M', 'G', 'V', 'S', 'D']) {
    const span = document.createElement('span');
    span.textContent = label;
    weekdayHeader.appendChild(span);
  }
  calendarWrap.appendChild(weekdayHeader);

  const grid = document.createElement('div');
  grid.className = 'calendar-grid';

  const rowIndices = state.isCalendarExpanded
    ? Array.from({ length: totalRows }, (_, i) => i)
    : [rowToShow];

  for (const r of rowIndices) {
    for (let col = 0; col < 7; col += 1) {
      const dayNum = r * 7 + col - offset + 1;
      if (dayNum < 1 || dayNum > daysInMonth) {
        const blank = document.createElement('div');
        blank.className = 'day-cell-empty';
        grid.appendChild(blank);
        continue;
      }

      const cellDate = new Date(viewYear, viewMonth, dayNum).getTime();
      const totalHours = workedDaysHours.get(cellDate);
      const hasWorked = totalHours !== undefined && totalHours > 0;
      const dayLogs = logsByDate.get(cellDate) ?? [];
      const isManualFromLogs = dayLogs.some((l) => l.isManualHoliday);
      const isGlobalOverride = globalFestiveSet.has(cellDate);
      const isFest = isDateFestive(
        cellDate,
        isManualFromLogs,
        settings.festiveDaysType,
        globalFestiveSet,
      );
      const isToday = cellDate === todayMidnight;
      const isSelected = state.selectedDate === cellDate;

      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = [
        'day-cell',
        hasWorked ? 'day-worked' : '',
        isFest ? 'day-festive' : '',
        isToday ? 'day-today' : '',
        isSelected ? 'day-selected' : '',
      ]
        .filter(Boolean)
        .join(' ');
      cell.title = 'Clicca per aprire la giornata • Tasto destro per attivare/disattivare festività';

      cell.innerHTML = `
        ${isGlobalOverride || isManualFromLogs ? '<span class="override-dot" title="Festività manuale"></span>' : ''}
        <span class="day-num">${dayNum}</span>
        ${hasWorked ? `<span class="day-hours">${escapeHtml(formatHoursLabel(totalHours))}</span>` : ''}
      `;

      cell.addEventListener('click', () => {
        state.selectedDate = cellDate;
        state.referenceDate = cellDate;
        onOpenDayDetail(cellDate);
      });

      cell.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        const res = await repo.toggleGlobalHolidayForDate(cellDate, state.yearId);
        const msg = res.isOverridden
          ? res.affectedCount > 0
            ? `Festivo impostato: ${res.affectedCount} braccianti ricalcolati`
            : 'Giorno impostato come festivo'
          : res.affectedCount > 0
            ? `Feriale ripristinato: ${res.affectedCount} braccianti ricalcolati`
            : 'Ripristinato giorno feriale';
        toast.show(msg);
        await renderDailyLoggingView(params);
      });

      grid.appendChild(cell);
    }
  }
  calendarWrap.appendChild(grid);

  const calFooter = document.createElement('div');
  calFooter.className = 'calendar-footer';
  calFooter.innerHTML = `
    <span class="muted small-note">Tasto destro (o dal dettaglio) per forzare festività</span>
    <button type="button" class="btn-link" id="toggle-cal-expand">
      ${state.isCalendarExpanded ? '▲ Riduci a settimana' : '▼ Espandi mese'}
    </button>
  `;
  calFooter.querySelector('#toggle-cal-expand')?.addEventListener('click', async () => {
    state.isCalendarExpanded = !state.isCalendarExpanded;
    await renderDailyLoggingView(params);
  });
  calendarWrap.appendChild(calFooter);
  screen.appendChild(calendarWrap);

  // Registered Days List
  const listHeader = document.createElement('div');
  listHeader.className = 'section-heading-row';
  listHeader.innerHTML = `
    <h3>Giornate registrate</h3>
    <button type="button" class="btn btn-primary btn-sm" id="open-today-btn">
      ${new Date(todayMidnight).getFullYear() === viewYear ? 'Apri Oggi' : 'Nuova Giornata'}
    </button>
  `;
  listHeader.querySelector('#open-today-btn')?.addEventListener('click', () => {
    const target =
      new Date(todayMidnight).getFullYear() === viewYear &&
      new Date(todayMidnight).getMonth() === viewMonth
        ? todayMidnight
        : new Date(viewYear, viewMonth, 1).getTime();
    state.selectedDate = target;
    state.referenceDate = target;
    onOpenDayDetail(target);
  });
  screen.appendChild(listHeader);

  if (registeredDaysInMonth.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-card';
    empty.innerHTML = `
      <p class="muted">Nessun dato per questo mese. Seleziona un giorno sul calendario per registrare presenze.</p>
    `;
    screen.appendChild(empty);
  } else {
    const dayList = document.createElement('div');
    dayList.className = 'card-list';

    registeredDaysInMonth.forEach((dateMillis, index) => {
      const workersCount = workedDaysCount.get(dateMillis) ?? 0;
      const hours = workedDaysHours.get(dateMillis) ?? 0;
      const dayNum = new Date(dateMillis).getDate();
      const isSelected = state.selectedDate === dateMillis;

      const card = document.createElement('article');
      card.className = `card day-summary-card clickable ${isSelected ? 'card-selected' : index % 2 === 1 ? 'card-alt' : ''}`;
      card.innerHTML = `
        <div class="day-badge-num">${dayNum}</div>
        <div class="day-summary-info">
          <div class="day-summary-weekday">${escapeHtml(formatDayName(dateMillis))}</div>
          <div class="muted">${workersCount} bracc. | ${escapeHtml(formatHoursLabel(hours))}</div>
        </div>
        <span class="chevron">›</span>
      `;
      card.addEventListener('click', () => {
        state.selectedDate = dateMillis;
        state.referenceDate = dateMillis;
        onOpenDayDetail(dateMillis);
      });
      dayList.appendChild(card);
    });

    screen.appendChild(dayList);
  }

  container.appendChild(screen);
}
