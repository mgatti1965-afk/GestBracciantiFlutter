import type { AppRepository } from '../../data/appRepository';
import {
  calculateShiftHours,
  formatCurrencyIt,
  formatHoursLabel,
  isDateFestive,
} from '../../domain/calc';
import {
  computeWorkLogFromShifts,
  toIsoLocalDate,
  workerFullName,
  type WorkerWithRate,
} from '../../domain/models';
import { toMidnightMillisFromIso, type WorkLog } from '../../domain/workLog';
import {
  escapeHtml,
  formatFullDate,
  openModal,
  showConfirmDialog,
  type ToastController,
} from '../utils';
import type { HelpTopic } from './helpModal';

const DAY_MILLIS = 24 * 60 * 60 * 1000;

function adjustTimeStr(value: string, defaultValue: string, deltaMinutes: number): string {
  const base = value.trim() || defaultValue;
  const match = base.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return defaultValue;
  }
  const totalMin = (Number(match[1]) * 60 + Number(match[2]) + deltaMinutes + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function isTimePairValid(start: string, end: string): boolean {
  if (!start.trim() || !end.trim()) {
    return true;
  }
  const ms = start.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  const me = end.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!ms || !me) {
    return false;
  }
  const sMin = Number(ms[1]) * 60 + Number(ms[2]);
  const eMin = Number(me[1]) * 60 + Number(me[2]);
  return eMin > sMin;
}

function createTimeSection(params: {
  title: string;
  initialStart: string;
  initialEnd: string;
  defaultStart: string;
  defaultEnd: string;
  onChange: (start: string, end: string) => void;
}): HTMLElement {
  let start = params.initialStart;
  let end = params.initialEnd;

  const section = document.createElement('div');
  section.className = 'time-section';
  section.innerHTML = `
    <div class="time-section-title">${escapeHtml(params.title)}</div>
    <div class="time-pair-grid">
      <div class="time-picker-box">
        <span class="time-picker-label">Inizio</span>
        <div class="time-controls">
          <button type="button" class="btn-step" data-role="start-minus" title="-15 minuti">-15'</button>
          <input type="text" class="time-input" data-role="start-input" value="${escapeHtml(start)}" placeholder="--:--" maxlength="5" />
          <button type="button" class="btn-step btn-step-plus" data-role="start-plus" title="+15 minuti">+15'</button>
        </div>
        <button type="button" class="btn-clear-time" data-role="start-clear">CANCELLA</button>
      </div>
      <div class="time-picker-box">
        <span class="time-picker-label">Fine</span>
        <div class="time-controls">
          <button type="button" class="btn-step" data-role="end-minus" title="-15 minuti">-15'</button>
          <input type="text" class="time-input" data-role="end-input" value="${escapeHtml(end)}" placeholder="--:--" maxlength="5" />
          <button type="button" class="btn-step btn-step-plus" data-role="end-plus" title="+15 minuti">+15'</button>
        </div>
        <button type="button" class="btn-clear-time" data-role="end-clear">CANCELLA</button>
      </div>
    </div>
  `;

  const startInput = section.querySelector<HTMLInputElement>('[data-role="start-input"]')!;
  const endInput = section.querySelector<HTMLInputElement>('[data-role="end-input"]')!;
  const startClear = section.querySelector<HTMLButtonElement>('[data-role="start-clear"]')!;
  const endClear = section.querySelector<HTMLButtonElement>('[data-role="end-clear"]')!;

  const sync = () => {
    startClear.style.visibility = start.trim() ? 'visible' : 'hidden';
    endClear.style.visibility = end.trim() ? 'visible' : 'hidden';
    params.onChange(start, end);
  };

  section.querySelector('[data-role="start-minus"]')?.addEventListener('click', () => {
    start = adjustTimeStr(start, params.defaultStart, -15);
    startInput.value = start;
    sync();
  });
  section.querySelector('[data-role="start-plus"]')?.addEventListener('click', () => {
    start = adjustTimeStr(start, params.defaultStart, 15);
    startInput.value = start;
    sync();
  });
  section.querySelector('[data-role="end-minus"]')?.addEventListener('click', () => {
    end = adjustTimeStr(end, params.defaultEnd, -15);
    endInput.value = end;
    sync();
  });
  section.querySelector('[data-role="end-plus"]')?.addEventListener('click', () => {
    end = adjustTimeStr(end, params.defaultEnd, 15);
    endInput.value = end;
    sync();
  });

  startClear.addEventListener('click', () => {
    start = '';
    startInput.value = '';
    sync();
  });
  endClear.addEventListener('click', () => {
    end = '';
    endInput.value = '';
    sync();
  });

  startInput.addEventListener('input', () => {
    start = startInput.value;
    sync();
  });
  endInput.addEventListener('input', () => {
    end = endInput.value;
    sync();
  });

  sync();
  return section;
}

export async function renderWorkDayDetailView(params: {
  container: HTMLElement;
  repo: AppRepository;
  toast: ToastController;
  dateMillis: number;
  yearId: number;
  onBack: () => void;
  onOpenHelp: (topic: HelpTopic) => void;
  onDataChanged: () => Promise<void>;
}): Promise<void> {
  const { container, repo, toast, dateMillis, yearId, onBack, onOpenHelp, onDataChanged } = params;

  const [allLogs, workersWithRate, groupsWithMembers, settings] = await Promise.all([
    repo.getLogsForYear(yearId),
    repo.getWorkersWithRateForYear(yearId),
    repo.getGroupsWithMembersForYear(yearId),
    repo.getSettings(),
  ]);

  const logsForDay = allLogs.filter((l) => l.date === dateMillis);
  const workerMap = new Map<number, WorkerWithRate>(workersWithRate.map((w) => [w.id, w]));
  const globalSet = new Set(settings.globalFestiveDates);
  const isDayFestive = isDateFestive(
    dateMillis,
    logsForDay.some((l) => l.isManualHoliday),
    settings.festiveDaysType,
    globalSet,
  );

  const sortedLogs = [...logsForDay].sort((a, b) => {
    const wa = workerFullName(workerMap.get(a.workerId), a.workerId);
    const wb = workerFullName(workerMap.get(b.workerId), b.workerId);
    return wa.localeCompare(wb, 'it', { sensitivity: 'base' });
  });

  container.innerHTML = '';
  const screen = document.createElement('section');
  screen.className = 'screen day-detail-screen';

  // Day Banner Header
  const header = document.createElement('div');
  header.className = 'day-detail-header';
  header.innerHTML = `
    <button type="button" class="btn btn-ghost btn-sm" id="day-back-btn">← Indietro</button>
    <div class="day-detail-title-wrap">
      <h2>${escapeHtml(formatFullDate(dateMillis))}</h2>
      ${isDayFestive ? '<span class="badge badge-festive">FESTIVO</span>' : ''}
    </div>
    <button type="button" class="btn btn-sm ${globalSet.has(dateMillis) ? 'btn-danger-outline' : 'btn-secondary'}" id="day-toggle-holiday">
      ${globalSet.has(dateMillis) ? 'Ripristina feriale' : 'Forza festivo'}
    </button>
  `;

  header.querySelector('#day-back-btn')?.addEventListener('click', onBack);
  header.querySelector('#day-toggle-holiday')?.addEventListener('click', async () => {
    const res = await repo.toggleGlobalHolidayForDate(dateMillis, yearId);
    const msg = res.isOverridden
      ? res.affectedCount > 0
        ? `Festivo impostato: ${res.affectedCount} braccianti ricalcolati`
        : 'Giorno impostato come festivo'
      : res.affectedCount > 0
        ? `Feriale ripristinato: ${res.affectedCount} braccianti ricalcolati`
        : 'Ripristinato giorno feriale';
    toast.show(msg);
    await onDataChanged();
    await renderWorkDayDetailView(params);
  });
  screen.appendChild(header);

  // Action bar (+ Gruppi / + Bracciante)
  const actionsBar = document.createElement('div');
  actionsBar.className = 'day-actions-bar';
  actionsBar.innerHTML = `
    <button type="button" class="btn btn-secondary" id="add-group-day-btn">+ Gruppi</button>
    <button type="button" class="btn btn-primary" id="add-worker-day-btn">+ Bracciante</button>
  `;
  screen.appendChild(actionsBar);

  // Day Worker Logs List
  if (sortedLogs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-card';
    empty.innerHTML = `
      <p class="empty-title">Nessun bracciante inserito per oggi.</p>
      <p class="muted">Usa "+ Gruppi" o "+ Bracciante" per registrare le ore lavorate.</p>
    `;
    screen.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'card-list';

    sortedLogs.forEach((log, index) => {
      const worker = workerMap.get(log.workerId);
      const name = workerFullName(worker, log.workerId);
      const initial = (worker?.surname || worker?.name || '?').charAt(0).toUpperCase();
      const shiftLine = [
        log.morningStart || log.morningEnd
          ? `M: ${log.morningStart || '--:--'} - ${log.morningEnd || '--:--'}`
          : '',
        log.afternoonStart || log.afternoonEnd
          ? `P: ${log.afternoonStart || '--:--'} - ${log.afternoonEnd || '--:--'}`
          : '',
      ]
        .filter(Boolean)
        .join(' | ');

      const card = document.createElement('article');
      card.className = `card log-day-card ${index % 2 === 1 ? 'card-alt' : ''}`;
      card.innerHTML = `
        <div class="avatar-box ${log.isManualHoliday ? 'avatar-festive' : index % 2 === 0 ? 'avatar-amber' : 'avatar-green'}">
          ${escapeHtml(initial)}
        </div>
        <div class="log-day-body clickable">
          <div class="log-day-top">
            <strong>${escapeHtml(name)}</strong>
            ${log.isManualHoliday ? '<span class="badge badge-festive">FESTIVO</span>' : ''}
          </div>
          <div class="muted small-note">${escapeHtml(shiftLine || 'Nessuna fascia oraria')}</div>
          <div class="log-hours-line">
            <span class="${log.holidayHours > 0 ? 'text-festive' : 'text-primary'}">
              Totale: <strong>${escapeHtml(formatHoursLabel(log.totalHours))}</strong>
            </span>
            <span class="amount-pill">${escapeHtml(formatCurrencyIt(log.totalAmount))}</span>
          </div>
          <div class="chips-row">
            ${log.ordinaryHours > 0 ? `<span class="stat-chip chip-ord">Ord ${escapeHtml(formatHoursLabel(log.ordinaryHours))}</span>` : ''}
            ${log.extraHours > 0 ? `<span class="stat-chip chip-str">STR ${escapeHtml(formatHoursLabel(log.extraHours))}</span>` : ''}
            ${log.holidayHours > 0 ? `<span class="stat-chip chip-fest">fest ${escapeHtml(formatHoursLabel(log.holidayHours))}</span>` : ''}
          </div>
        </div>
        <div class="log-day-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-action="holiday" title="Attiva/disattiva festivo manuale per questo bracciante">
            ${log.isManualHoliday ? 'Feriale' : 'Festivo'}
          </button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="edit">Modifica</button>
          <button type="button" class="btn-icon-danger" data-action="delete" title="Rimuovi">🗑</button>
        </div>
      `;

      card.querySelector('.log-day-body')?.addEventListener('click', () => openWorkerDialog(log));
      card.querySelector('[data-action="edit"]')?.addEventListener('click', () => openWorkerDialog(log));
      card.querySelector('[data-action="holiday"]')?.addEventListener('click', async () => {
        const updated = await repo.toggleManualHolidayForLog(log.id);
        toast.show(
          updated.isManualHoliday
            ? `Giorno festivo forzato per ${name}`
            : `Calcolo festivo automatico ripristinato per ${name}`,
        );
        await onDataChanged();
        await renderWorkDayDetailView(params);
      });
      card.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
        await repo.deleteWorkLog(log.id);
        toast.show(`Registrazione rimossa per ${name}.`);
        await onDataChanged();
        await renderWorkDayDetailView(params);
      });

      list.appendChild(card);
    });

    screen.appendChild(list);
  }

  function openWorkerDialog(editingLog: WorkLog | null): void {
    const selectableWorkers = workersWithRate.filter(
      (w) => !logsForDay.some((l) => l.workerId === w.id),
    );
    if (!editingLog && workersWithRate.length === 0) {
      toast.show('Nessun bracciante in anagrafica per questa annata. Aggiungilo prima in Braccianti.', true);
      return;
    }
    if (!editingLog && selectableWorkers.length === 0) {
      toast.show('Tutti i braccianti dell\'annata sono già inseriti in questa giornata.', true);
      return;
    }

    let selectedWorkerId: number | null = editingLog
      ? editingLog.workerId
      : selectableWorkers.length === 1
        ? selectableWorkers[0].id
        : null;

    let mStart = editingLog?.morningStart ?? '08:00';
    let mEnd = editingLog?.morningEnd ?? '';
    let pStart = editingLog?.afternoonStart ?? '';
    let pEnd = editingLog?.afternoonEnd ?? '';

    // Cascading defaults when reopening an incomplete log (Android WorkDayDetailScreen L852-872)
    if (editingLog) {
      if (mStart && !mEnd) {
        mEnd = '12:00';
      } else if (mStart && mEnd && !pStart) {
        pStart = '13:00';
      } else if (mStart && mEnd && pStart && !pEnd) {
        pEnd = '17:00';
      }
    }

    let expandPeriod = false;
    let endDateMillis = dateMillis;

    const modal = openModal({
      title: editingLog ? 'Modifica Orari' : 'Aggiungi Bracciante',
      headerActionHtml: '<button type="button" class="btn btn-ghost btn-icon" title="Guida">?</button>',
      onHeaderAction: () => onOpenHelp('modifica_orari'),
    });

    const formBody = document.createElement('div');
    formBody.className = 'form-stack';

    if (editingLog) {
      const worker = workerMap.get(editingLog.workerId);
      const label = document.createElement('div');
      label.className = 'editing-worker-banner';
      label.textContent = `Bracciante: ${workerFullName(worker, editingLog.workerId)}`;
      formBody.appendChild(label);
    } else {
      const field = document.createElement('label');
      field.className = 'field';
      field.innerHTML = '<span>Bracciante</span>';
      const select = document.createElement('select');
      select.id = 'dialog-worker-select';
      const placeholderOpt = document.createElement('option');
      placeholderOpt.value = '';
      placeholderOpt.textContent = 'Seleziona Bracciante';
      select.appendChild(placeholderOpt);
      for (const w of selectableWorkers) {
        const opt = document.createElement('option');
        opt.value = String(w.id);
        opt.textContent = workerFullName(w);
        select.appendChild(opt);
      }
      if (selectedWorkerId !== null) {
        select.value = String(selectedWorkerId);
      }
      select.addEventListener('change', () => {
        selectedWorkerId = select.value ? Number(select.value) : null;
        updatePreview();
      });
      field.appendChild(select);
      formBody.appendChild(field);
    }

    const previewBox = document.createElement('div');
    previewBox.className = 'preview-pill';

    const updatePreview = () => {
      const hours = calculateShiftHours(mStart, mEnd, pStart, pEnd);
      const worker = selectedWorkerId !== null ? workerMap.get(selectedWorkerId) : undefined;
      if (worker) {
        const calc = computeWorkLogFromShifts({
          workerId: worker.id,
          harvestYearId: yearId,
          date: dateMillis,
          morningStart: mStart || null,
          morningEnd: mEnd || null,
          afternoonStart: pStart || null,
          afternoonEnd: pEnd || null,
          hourlyRate: worker.hourlyRate,
          extraHourlyRate: worker.extraHourlyRate,
          holidayHourlyRate: worker.holidayHourlyRate,
          isManualHoliday: editingLog?.isManualHoliday ?? false,
          settings,
        });
        previewBox.textContent = `Calcolo: ${formatHoursLabel(hours)} (Ord ${formatHoursLabel(calc.ordinaryHours)}, Str ${formatHoursLabel(calc.extraHours)}, Fes ${formatHoursLabel(calc.holidayHours)}) → ${formatCurrencyIt(calc.totalAmount)}`;
      } else {
        previewBox.textContent = `Ore calcolate: ${formatHoursLabel(hours)}`;
      }
    };

    formBody.appendChild(
      createTimeSection({
        title: 'Mattina',
        initialStart: mStart,
        initialEnd: mEnd,
        defaultStart: '08:00',
        defaultEnd: '12:00',
        onChange: (s, e) => {
          mStart = s;
          mEnd = e;
          updatePreview();
        },
      }),
    );

    formBody.appendChild(
      createTimeSection({
        title: 'Pomeriggio',
        initialStart: pStart,
        initialEnd: pEnd,
        defaultStart: '13:00',
        defaultEnd: '17:00',
        onChange: (s, e) => {
          pStart = s;
          pEnd = e;
          updatePreview();
        },
      }),
    );

    formBody.appendChild(previewBox);
    formBody.appendChild(
      createExpandPeriodBlock({
        currentDate: dateMillis,
        onChange: (expanded, newEndMillis) => {
          expandPeriod = expanded;
          endDateMillis = newEndMillis;
        },
      }),
    );

    const errorLine = document.createElement('p');
    errorLine.className = 'error-text';
    formBody.appendChild(errorLine);

    modal.body.appendChild(formBody);
    updatePreview();

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = 'Annulla';
    cancelBtn.addEventListener('click', () => modal.close());

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Salva';

    const performSave = async () => {
      if (selectedWorkerId === null) {
        errorLine.textContent = 'Seleziona un bracciante.';
        return;
      }
      saveBtn.disabled = true;
      try {
        if (expandPeriod) {
          await repo.saveWorkLogRange({
            workerIds: [selectedWorkerId],
            yearId,
            startDate: dateMillis,
            endDate: endDateMillis,
            morningStart: mStart.trim() || null,
            morningEnd: mEnd.trim() || null,
            afternoonStart: pStart.trim() || null,
            afternoonEnd: pEnd.trim() || null,
          });
          modal.close();
          toast.show('Orari salvati per tutto il periodo.');
          await onDataChanged();
          onBack();
        } else {
          const res = await repo.saveWorkLog({
            id: editingLog?.id,
            workerId: selectedWorkerId,
            yearId,
            date: dateMillis,
            morningStart: mStart.trim() || null,
            morningEnd: mEnd.trim() || null,
            afternoonStart: pStart.trim() || null,
            afternoonEnd: pEnd.trim() || null,
          });
          modal.close();
          if (res.rateChangedFrom !== undefined && res.rateChangedTo !== undefined) {
            toast.show(
              `Tariffa aggiornata: da ${formatCurrencyIt(res.rateChangedFrom)} a ${formatCurrencyIt(res.rateChangedTo)}`,
            );
          } else {
            toast.show('Orari salvati.');
          }
          await onDataChanged();
          await renderWorkDayDetailView(params);
        }
      } catch (err) {
        errorLine.textContent = err instanceof Error ? err.message : 'Errore salvataggio.';
      } finally {
        saveBtn.disabled = false;
      }
    };

    saveBtn.addEventListener('click', async () => {
      errorLine.textContent = '';
      if (selectedWorkerId === null) {
        errorLine.textContent = 'Seleziona un bracciante.';
        return;
      }
      if (!isTimePairValid(mStart, mEnd)) {
        errorLine.textContent = 'Fine mattina deve essere dopo l\'inizio.';
        return;
      }
      if (!isTimePairValid(pStart, pEnd)) {
        errorLine.textContent = 'Fine pomeriggio deve essere dopo l\'inizio.';
        return;
      }
      if (!mStart.trim() && !pStart.trim()) {
        errorLine.textContent = 'Inserire almeno un orario di inizio.';
        return;
      }
      if (expandPeriod) {
        const daysCount = Math.round((endDateMillis - dateMillis) / DAY_MILLIS) + 1;
        showConfirmDialog({
          title: `Inserimento orari per ${daysCount} giorni lavorativi`,
          message: 'Attenzione: gli orari già presenti in questo periodo verranno sovrascritti. Vuoi continuare?',
          confirmLabel: 'Conferma',
          onConfirm: performSave,
        });
      } else {
        await performSave();
      }
    });

    modal.footer.append(cancelBtn, saveBtn);
  }

  function openGroupDialog(): void {
    if (groupsWithMembers.length === 0) {
      toast.show('Nessun gruppo creato per questa annata. Creane uno in Braccianti → Gruppi.', true);
      return;
    }

    let selectedGroupId: number | null =
      groupsWithMembers.length === 1 ? groupsWithMembers[0].group.id : null;
    let mStart = '08:00';
    let mEnd = '';
    let pStart = '';
    let pEnd = '';
    let expandPeriod = false;
    let endDateMillis = dateMillis;

    const modal = openModal({
      title: 'Aggiungi Gruppo',
      headerActionHtml: '<button type="button" class="btn btn-ghost btn-icon" title="Guida">?</button>',
      onHeaderAction: () => onOpenHelp('modifica_orari'),
    });

    const formBody = document.createElement('div');
    formBody.className = 'form-stack';

    const field = document.createElement('label');
    field.className = 'field';
    field.innerHTML = '<span>Nome Gruppo</span>';
    const select = document.createElement('select');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Seleziona Gruppo';
    select.appendChild(placeholder);
    for (const item of groupsWithMembers) {
      const opt = document.createElement('option');
      opt.value = String(item.group.id);
      opt.textContent = `${item.group.name} (${item.members.length} bracc.)`;
      select.appendChild(opt);
    }
    if (selectedGroupId !== null) {
      select.value = String(selectedGroupId);
    }
    select.addEventListener('change', () => {
      selectedGroupId = select.value ? Number(select.value) : null;
    });
    field.appendChild(select);
    formBody.appendChild(field);

    const previewBox = document.createElement('div');
    previewBox.className = 'preview-pill';
    const updatePreview = () => {
      previewBox.textContent = `Ore calcolate per componente: ${formatHoursLabel(calculateShiftHours(mStart, mEnd, pStart, pEnd))}`;
    };

    formBody.appendChild(
      createTimeSection({
        title: 'Mattina',
        initialStart: mStart,
        initialEnd: mEnd,
        defaultStart: '08:00',
        defaultEnd: '12:00',
        onChange: (s, e) => {
          mStart = s;
          mEnd = e;
          updatePreview();
        },
      }),
    );

    formBody.appendChild(
      createTimeSection({
        title: 'Pomeriggio',
        initialStart: pStart,
        initialEnd: pEnd,
        defaultStart: '13:00',
        defaultEnd: '17:00',
        onChange: (s, e) => {
          pStart = s;
          pEnd = e;
          updatePreview();
        },
      }),
    );

    formBody.appendChild(previewBox);
    formBody.appendChild(
      createExpandPeriodBlock({
        currentDate: dateMillis,
        onChange: (expanded, newEndMillis) => {
          expandPeriod = expanded;
          endDateMillis = newEndMillis;
        },
      }),
    );

    const errorLine = document.createElement('p');
    errorLine.className = 'error-text';
    formBody.appendChild(errorLine);

    modal.body.appendChild(formBody);
    updatePreview();

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = 'Annulla';
    cancelBtn.addEventListener('click', () => modal.close());

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Salva';

    const performSave = async () => {
      const grpEntry = groupsWithMembers.find((g) => g.group.id === selectedGroupId);
      if (!grpEntry) {
        errorLine.textContent = 'Seleziona un gruppo.';
        return;
      }
      if (grpEntry.members.length === 0) {
        errorLine.textContent = 'Questo gruppo non ha braccianti assegnati.';
        return;
      }
      saveBtn.disabled = true;
      try {
        const targetIds = grpEntry.members.map((m) => m.id);
        await repo.saveWorkLogRange({
          workerIds: targetIds,
          yearId,
          startDate: dateMillis,
          endDate: expandPeriod ? endDateMillis : dateMillis,
          morningStart: mStart.trim() || null,
          morningEnd: mEnd.trim() || null,
          afternoonStart: pStart.trim() || null,
          afternoonEnd: pEnd.trim() || null,
        });
        modal.close();
        toast.show(`Inserito gruppo "${grpEntry.group.name}" (${targetIds.length} braccianti).`);
        await onDataChanged();
        if (expandPeriod) {
          onBack();
        } else {
          await renderWorkDayDetailView(params);
        }
      } catch (err) {
        errorLine.textContent = err instanceof Error ? err.message : 'Errore salvataggio gruppo.';
      } finally {
        saveBtn.disabled = false;
      }
    };

    saveBtn.addEventListener('click', async () => {
      errorLine.textContent = '';
      if (selectedGroupId === null) {
        errorLine.textContent = 'Seleziona un gruppo.';
        return;
      }
      if (!isTimePairValid(mStart, mEnd)) {
        errorLine.textContent = 'Fine mattina deve essere dopo l\'inizio.';
        return;
      }
      if (!isTimePairValid(pStart, pEnd)) {
        errorLine.textContent = 'Fine pomeriggio deve essere dopo l\'inizio.';
        return;
      }
      if (!mStart.trim() && !pStart.trim()) {
        errorLine.textContent = 'Inserire almeno un orario di inizio.';
        return;
      }
      if (expandPeriod) {
        const daysCount = Math.round((endDateMillis - dateMillis) / DAY_MILLIS) + 1;
        showConfirmDialog({
          title: `Inserimento orari per ${daysCount} giorni lavorativi`,
          message: 'Attenzione: gli orari già presenti in questo periodo verranno sovrascritti. Vuoi continuare?',
          confirmLabel: 'Conferma',
          onConfirm: performSave,
        });
      } else {
        await performSave();
      }
    });

    modal.footer.append(cancelBtn, saveBtn);
  }

  actionsBar.querySelector('#add-worker-day-btn')?.addEventListener('click', () => openWorkerDialog(null));
  actionsBar.querySelector('#add-group-day-btn')?.addEventListener('click', openGroupDialog);

  container.appendChild(screen);
}

function createExpandPeriodBlock(params: {
  currentDate: number;
  onChange: (expanded: boolean, endDateMillis: number) => void;
}): HTMLElement {
  let expanded = false;
  let endDateMillis = params.currentDate;

  const block = document.createElement('div');
  block.className = 'expand-period-box';
  block.innerHTML = `
    <label class="checkline">
      <input type="checkbox" data-role="expand-check" />
      <span><strong>Espandi a più giorni</strong></span>
    </label>
    <div class="expand-period-body" data-role="expand-body" hidden>
      <div class="expand-date-row">
        <button type="button" class="btn-step" data-role="day-minus">-1g</button>
        <input type="date" data-role="end-date" value="${toIsoLocalDate(endDateMillis)}" min="${toIsoLocalDate(params.currentDate)}" />
        <button type="button" class="btn-step btn-step-plus" data-role="day-plus">+1g</button>
      </div>
      <div class="expand-meta">
        <strong data-role="days-count">Totale: 1 giorni</strong>
        <span class="error-text small-note">⚠ Gli orari esistenti nel periodo verranno sovrascritti.</span>
      </div>
    </div>
  `;

  const check = block.querySelector<HTMLInputElement>('[data-role="expand-check"]')!;
  const body = block.querySelector<HTMLDivElement>('[data-role="expand-body"]')!;
  const dateInput = block.querySelector<HTMLInputElement>('[data-role="end-date"]')!;
  const daysLabel = block.querySelector<HTMLElement>('[data-role="days-count"]')!;

  const sync = () => {
    body.hidden = !expanded;
    dateInput.value = toIsoLocalDate(endDateMillis);
    const days = Math.max(1, Math.round((endDateMillis - params.currentDate) / DAY_MILLIS) + 1);
    daysLabel.textContent = `Totale: ${days} giorni`;
    params.onChange(expanded, endDateMillis);
  };

  check.addEventListener('change', () => {
    expanded = check.checked;
    sync();
  });

  dateInput.addEventListener('change', () => {
    try {
      const parsed = toMidnightMillisFromIso(dateInput.value);
      endDateMillis = Math.max(params.currentDate, parsed);
    } catch {
      endDateMillis = params.currentDate;
    }
    sync();
  });

  block.querySelector('[data-role="day-minus"]')?.addEventListener('click', () => {
    const prev = new Date(endDateMillis);
    prev.setDate(prev.getDate() - 1);
    const prevMillis = prev.getTime();
    if (prevMillis >= params.currentDate) {
      endDateMillis = prevMillis;
      sync();
    }
  });

  block.querySelector('[data-role="day-plus"]')?.addEventListener('click', () => {
    const next = new Date(endDateMillis);
    next.setDate(next.getDate() + 1);
    endDateMillis = next.getTime();
    sync();
  });

  return block;
}
