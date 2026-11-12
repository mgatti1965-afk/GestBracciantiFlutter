import { AppRepository } from './data/appRepository';
import { toLocalMidnightMillis } from './domain/models';
import {
  renderDailyLoggingView,
  type DailyLoggingState,
} from './ui/screens/dailyLoggingView';
import {
  renderFinancialSummaryView,
  type FinancialSummaryState,
} from './ui/screens/financialSummaryView';
import { showHelpDialog, type HelpTopic } from './ui/screens/helpModal';
import { renderOthersView } from './ui/screens/othersView';
import { renderWorkDayDetailView } from './ui/screens/workDayDetailView';
import {
  renderWorkerRegistryView,
  type WorkerRegistryState,
} from './ui/screens/workerRegistryView';
import { renderYearSelectionView } from './ui/screens/yearSelectionView';
import { createToastController, openModal } from './ui/utils';

type MainTab = 'DAILY' | 'SUMMARY' | 'WORKERS' | 'OTHERS';

function defaultDateForYear(yearId: number): number {
  const now = new Date();
  if (now.getFullYear() === yearId) {
    return toLocalMidnightMillis(now);
  }
  return new Date(yearId, 0, 1).getTime();
}

export async function renderApp(): Promise<HTMLElement> {
  const repo = new AppRepository();

  const shell = document.createElement('div');
  shell.className = 'app-shell';

  const topBar = document.createElement('header');
  topBar.className = 'app-topbar';
  topBar.hidden = true;

  const mainContent = document.createElement('main');
  mainContent.className = 'app-main';

  const navBar = document.createElement('nav');
  navBar.className = 'app-navbar';
  navBar.setAttribute('aria-label', 'Navigazione principale');
  navBar.hidden = true;

  const toastHost = document.createElement('div');
  toastHost.className = 'toast-host';
  const toast = createToastController(toastHost);

  shell.append(topBar, mainContent, navBar, toastHost);

  let currentYear = await repo.getCurrentYear();
  let activeTab: MainTab = 'DAILY';
  let activeDayDetailDate: number | null = null;
  let backupReminderShown = false;

  const dailyState: DailyLoggingState = {
    yearId: currentYear?.id ?? new Date().getFullYear(),
    referenceDate: defaultDateForYear(currentYear?.id ?? new Date().getFullYear()),
    selectedDate: null,
    isCalendarExpanded: false,
  };

  const summaryState: FinancialSummaryState = {
    filterPeriod: 'YEAR',
    referenceDate: defaultDateForYear(currentYear?.id ?? new Date().getFullYear()),
    groupingType: 'BY_WORKER',
    viewModeForWorker: 'DETAIL',
  };

  const registryState: WorkerRegistryState = {
    activeSubTab: 'WORKERS',
    searchQuery: '',
  };

  const syncYearStates = (yearId: number) => {
    const def = defaultDateForYear(yearId);
    dailyState.yearId = yearId;
    dailyState.referenceDate = def;
    dailyState.selectedDate = null;
    summaryState.referenceDate = def;
    activeDayDetailDate = null;
  };

  const getCurrentHelpTopic = (): HelpTopic => {
    if (!currentYear) return 'year_selection';
    if (activeTab === 'DAILY') {
      return activeDayDetailDate !== null ? 'work_day_detail' : 'daily_logging';
    }
    if (activeTab === 'SUMMARY') return 'financial_summary';
    if (activeTab === 'WORKERS') return 'worker_registry';
    return 'others';
  };

  const getScreenTitle = (): string => {
    if (!currentYear) return 'GestBraccianti';
    if (activeTab === 'WORKERS') return 'Registro Braccianti';
    if (activeTab === 'OTHERS') return 'Altre Funzioni';
    if (activeTab === 'SUMMARY') return `Riepilogo - ${currentYear.id}`;
    return `Ore Lavorate - ${currentYear.id}`;
  };

  const checkBackupReminder = async () => {
    if (backupReminderShown || !currentYear) return;
    const settings = await repo.getSettings();
    if (settings.saveCountSinceBackup > 30) {
      backupReminderShown = true;
      const modal = openModal({ title: 'Consiglio di Sicurezza' });
      const p = document.createElement('p');
      p.className = 'modal-text';
      p.textContent =
        "Hai effettuato diverse operazioni dall'ultimo backup. Ti consiglio di esportare un backup CSV dalla scheda Varie per mettere al sicuro i tuoi dati.";
      modal.body.appendChild(p);
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'btn btn-primary';
      okBtn.textContent = 'Ho capito';
      okBtn.addEventListener('click', () => modal.close());
      modal.footer.appendChild(okBtn);
    }
  };

  const renderChrome = () => {
    const hasYear = Boolean(currentYear);
    topBar.hidden = !hasYear;
    navBar.hidden = !hasYear;

    if (!currentYear) {
      return;
    }

    topBar.innerHTML = `
      <div class="topbar-inner">
        <div class="topbar-brand">
          <span class="topbar-title">${getScreenTitle()}</span>
          ${currentYear.notes ? `<span class="topbar-sub">${currentYear.notes}</span>` : ''}
        </div>
        <div class="topbar-actions">
          <button type="button" class="btn btn-ghost btn-icon" id="topbar-help" title="Guida contestuale">?</button>
          <button type="button" class="btn btn-ghost btn-sm" id="topbar-switch-year" title="Cambia o gestisci annata">Cambia Annata</button>
        </div>
      </div>
    `;

    // Replace textContent safely for notes in case of special characters
    const subEl = topBar.querySelector<HTMLElement>('.topbar-sub');
    if (subEl && currentYear.notes) {
      subEl.textContent = currentYear.notes;
    }

    topBar.querySelector('#topbar-help')?.addEventListener('click', () => {
      showHelpDialog(getCurrentHelpTopic());
    });

    topBar.querySelector('#topbar-switch-year')?.addEventListener('click', async () => {
      await repo.deselectYear();
      currentYear = undefined;
      activeDayDetailDate = null;
      await renderCurrentRoute();
    });

    const navItems: Array<{ id: MainTab; label: string; icon: string }> = [
      { id: 'DAILY', label: 'Ore', icon: '📅' },
      { id: 'SUMMARY', label: 'Riepilogo', icon: '📊' },
      { id: 'WORKERS', label: 'Braccianti', icon: '👥' },
      { id: 'OTHERS', label: 'Varie', icon: '⚙️' },
    ];

    navBar.innerHTML = navItems
      .map(
        (item) => `
      <button type="button" class="nav-item ${activeTab === item.id ? 'active' : ''}" data-tab="${item.id}">
        <span class="nav-icon" aria-hidden="true">${item.icon}</span>
        <span class="nav-label">${item.label}</span>
      </button>
    `,
      )
      .join('');

    navBar.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nextTab = btn.dataset.tab as MainTab;
        if (nextTab === 'DAILY' && activeTab === 'DAILY' && activeDayDetailDate !== null) {
          activeDayDetailDate = null;
        } else {
          activeTab = nextTab;
          if (nextTab !== 'DAILY') {
            activeDayDetailDate = null;
          }
        }
        await renderCurrentRoute();
      });
    });
  };

  const renderCurrentRoute = async () => {
    renderChrome();

    if (!currentYear) {
      await renderYearSelectionView({
        container: mainContent,
        repo,
        toast,
        onOpenHelp: () => showHelpDialog('year_selection'),
        onYearSelected: async (yearId) => {
          currentYear = await repo.getCurrentYear();
          syncYearStates(yearId);
          activeTab = 'DAILY';
          await renderCurrentRoute();
        },
      });
      return;
    }

    const yearId = currentYear.id;

    if (activeTab === 'DAILY') {
      if (activeDayDetailDate !== null) {
        await renderWorkDayDetailView({
          container: mainContent,
          repo,
          toast,
          dateMillis: activeDayDetailDate,
          yearId,
          onBack: async () => {
            activeDayDetailDate = null;
            await renderCurrentRoute();
          },
          onOpenHelp: (topic) => showHelpDialog(topic),
          onDataChanged: async () => {
            await checkBackupReminder();
          },
        });
      } else {
        await renderDailyLoggingView({
          container: mainContent,
          repo,
          toast,
          state: dailyState,
          onOpenDayDetail: async (dateMillis) => {
            activeDayDetailDate = dateMillis;
            summaryState.referenceDate = dateMillis;
            await renderCurrentRoute();
          },
        });
      }
      return;
    }

    if (activeTab === 'SUMMARY') {
      await renderFinancialSummaryView({
        container: mainContent,
        repo,
        toast,
        yearId,
        state: summaryState,
      });
      return;
    }

    if (activeTab === 'WORKERS') {
      await renderWorkerRegistryView({
        container: mainContent,
        repo,
        toast,
        yearId,
        state: registryState,
      });
      return;
    }

    await renderOthersView({
      container: mainContent,
      repo,
      toast,
      onDatabaseChanged: async () => {
        currentYear = await repo.getCurrentYear();
        if (currentYear) {
          syncYearStates(currentYear.id);
          activeTab = 'DAILY';
        }
        await renderCurrentRoute();
      },
    });
  };

  if (currentYear) {
    syncYearStates(currentYear.id);
    void checkBackupReminder();
  }
  await renderCurrentRoute();

  return shell;
}
