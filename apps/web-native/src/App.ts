import { AppRepository } from './data/appRepository';
import { googleDriveService } from './data/googleDriveService';
import { parseBackupHeaderDate } from './domain/backupCsv';
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
import { createToastController, formatDateTime, openModal } from './ui/utils';

type MainTab = 'DAILY' | 'SUMMARY' | 'WORKERS' | 'OTHERS';

function defaultDateForYear(yearId: number): number {
  const now = new Date();
  if (now.getFullYear() === yearId) {
    return toLocalMidnightMillis(now);
  }
  return new Date(yearId, 0, 1).getTime();
}

function formatImportDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'nessun import';
  const ts = parseBackupHeaderDate(dateStr);
  return ts !== null ? formatDateTime(ts) : dateStr;
}

export async function renderApp(): Promise<HTMLElement> {
  const repo = new AppRepository();

  const shell = document.createElement('div');
  shell.className = 'app-shell';

  const topBar = document.createElement('header');
  topBar.className = 'app-topbar';
  topBar.hidden = true;

  const readOnlyBanner = document.createElement('div');
  readOnlyBanner.className = 'banner-readonly';
  readOnlyBanner.hidden = true;

  const mainContent = document.createElement('main');
  mainContent.className = 'app-main';

  const navBar = document.createElement('nav');
  navBar.className = 'app-navbar';
  navBar.setAttribute('aria-label', 'Navigazione principale');
  navBar.hidden = true;

  const toastHost = document.createElement('div');
  toastHost.className = 'toast-host';
  const toast = createToastController(toastHost);

  shell.append(topBar, readOnlyBanner, mainContent, navBar, toastHost);

  let currentYear = await repo.getCurrentYear();
  let activeTab: MainTab = 'DAILY';
  let activeDayDetailDate: number | null = null;
  let backupReminderShown = false;
  let isReadOnlyDueToAlignment = false;
  let alignmentGeneration = 0;

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

  const renderChrome = async () => {
    const hasYear = Boolean(currentYear);
    topBar.hidden = !hasYear;
    navBar.hidden = !hasYear;

    if (isReadOnlyDueToAlignment) {
      readOnlyBanner.hidden = false;
      readOnlyBanner.innerHTML = `
        <span>🔒 <strong>Modalità Sola Lettura:</strong> è necessario procedere all'import dei dati da "Varie" per abilitare le modifiche.</span>
        <button type="button" class="banner-btn" id="banner-goto-varie">Vai a Varie</button>
      `;
      readOnlyBanner.querySelector('#banner-goto-varie')?.addEventListener('click', async () => {
        activeTab = 'OTHERS';
        await renderCurrentRoute();
      });
    } else {
      readOnlyBanner.hidden = true;
      readOnlyBanner.innerHTML = '';
    }

    if (!currentYear) {
      return;
    }

    const hasUnexported = await repo.hasUnexportedChanges();

    topBar.innerHTML = `
      <div class="topbar-inner">
        <div class="topbar-brand" style="display: flex; align-items: center; gap: 0.45rem;">
          <img src="./favicon.svg" alt="" width="26" height="26" style="border-radius: 6px; flex-shrink: 0;" />
          <div>
            <span class="topbar-title">${getScreenTitle()}</span>
            ${currentYear.notes ? `<span class="topbar-sub">${currentYear.notes}</span>` : ''}
          </div>
        </div>
        <div class="topbar-actions">
          ${
            hasUnexported
              ? '<button type="button" class="export-needed-badge" id="topbar-export-needed" title="Ci sono modifiche locali non ancora salvate su Google Drive. Clicca per andare a Varie">⚠️ Modifiche non salvate</button>'
              : ''
          }
          <button type="button" class="btn btn-ghost btn-icon" id="topbar-help" title="Guida contestuale">?</button>
          <button type="button" class="btn btn-ghost btn-sm" id="topbar-switch-year" title="Cambia o gestisci annata">Cambia Annata</button>
        </div>
      </div>
    `;

    topBar.querySelector('#topbar-export-needed')?.addEventListener('click', async () => {
      activeTab = 'OTHERS';
      await renderCurrentRoute();
    });

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

    const navItems: Array<{ id: MainTab; label: string; icon: string; showBadge?: boolean }> = [
      { id: 'DAILY', label: 'Ore', icon: '📅' },
      { id: 'SUMMARY', label: 'Riepilogo', icon: '📊' },
      { id: 'WORKERS', label: 'Braccianti', icon: '👥' },
      { id: 'OTHERS', label: 'Varie', icon: '⚙️', showBadge: hasUnexported },
    ];

    navBar.innerHTML = navItems
      .map(
        (item) => `
      <button type="button" class="nav-item ${activeTab === item.id ? 'active' : ''}" data-tab="${item.id}" style="position: relative;">
        <span class="nav-icon" aria-hidden="true">${item.icon}</span>
        <span class="nav-label">${item.label}</span>
        ${item.showBadge ? '<span class="nav-item-badge-dot" title="Modifiche non esportate"></span>' : ''}
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

  const applyReadOnlyRestrictions = () => {
    if (!isReadOnlyDueToAlignment || activeTab === 'OTHERS') {
      return;
    }
    const isNavigationOrViewControl = (el: HTMLElement): boolean => {
      if (el.classList.contains('nav-item') || el.classList.contains('tab-pill')) return true;
      if (
        el.classList.contains('btn-icon-nav') ||
        el.classList.contains('filter-chip') ||
        el.classList.contains('seg-btn') ||
        el.classList.contains('subtab')
      ) {
        return true;
      }
      if (
        el.matches(
          '#sum-prev-btn, #sum-next-btn, #prev-month-btn, #next-month-btn, #day-back-btn, #toggle-cal-expand, #print-summary-btn, #topbar-help',
        )
      ) {
        return true;
      }
      if (el.matches('[data-action="view"], [data-subtab], [data-group], [data-mode]')) {
        return true;
      }
      if (el instanceof HTMLInputElement && (el.type === 'search' || el.id === 'worker-search-input')) {
        return true;
      }
      return false;
    };

    mainContent
      .querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'button, input, select, textarea',
      )
      .forEach((el) => {
        if (isNavigationOrViewControl(el)) return;
        el.setAttribute('disabled', 'true');
        el.setAttribute('title', 'Sola visualizzazione: è necessario allineare i dati importando da Varie');
      });
  };

  const renderCurrentRoute = async () => {
    await renderChrome();

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
      applyReadOnlyRestrictions();
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
            await renderChrome();
          },
        });
      } else {
        await renderDailyLoggingView({
          container: mainContent,
          repo,
          toast,
          state: dailyState,
          isReadOnly: isReadOnlyDueToAlignment,
          onOpenDayDetail: async (dateMillis) => {
            activeDayDetailDate = dateMillis;
            summaryState.referenceDate = dateMillis;
            await renderCurrentRoute();
          },
        });
      }
      applyReadOnlyRestrictions();
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
      applyReadOnlyRestrictions();
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
      applyReadOnlyRestrictions();
      return;
    }

    await renderOthersView({
      container: mainContent,
      repo,
      toast,
      onDatabaseChanged: async () => {
        alignmentGeneration += 1;
        isReadOnlyDueToAlignment = false;
        currentYear = await repo.getCurrentYear();
        if (currentYear) {
          syncYearStates(currentYear.id);
          activeTab = 'DAILY';
        }
        await renderCurrentRoute();
      },
      onRefreshChrome: async () => {
        await renderChrome();
      },
      onDriveSignedIn: async () => {
        await verifyCloudAlignment({ showAlignedToast: true });
      },
    });
  };

  const renderClosedScreen = (message: string) => {
    alignmentGeneration += 1;
    isReadOnlyDueToAlignment = false;
    try {
      window.close();
    } catch {
      // Ignora se il browser blocca window.close()
    }
    shell.innerHTML = `
      <div class="card" style="max-width: 440px; margin: 4rem auto; text-align: center; padding: 1.5rem;">
        <h2 style="margin-bottom: 0.75rem;">Applicazione chiusa</h2>
        <p class="muted" style="margin-bottom: 1.25rem;">${message}</p>
        <button type="button" class="btn btn-primary" id="app-exit-reload-btn">Ricarica</button>
      </div>
    `;
    shell.querySelector('#app-exit-reload-btn')?.addEventListener('click', () => {
      window.location.reload();
    });
  };

  const enterApp = async (readOnly: boolean) => {
    isReadOnlyDueToAlignment = readOnly;
    currentYear = await repo.getCurrentYear();
    if (currentYear) {
      syncYearStates(currentYear.id);
      if (!readOnly) {
        void checkBackupReminder();
      }
    }
    await renderCurrentRoute();
  };

  const verifyCloudAlignment = async (opts?: { showAlignedToast?: boolean; fromStartup?: boolean }) => {
    const checkGen = ++alignmentGeneration;
    const latest = await googleDriveService.getLatestBackupFile();
    if (checkGen !== alignmentGeneration) {
      return;
    }
    const [settings, existingYears] = await Promise.all([repo.getSettings(), repo.getAllYears()]);
    if (checkGen !== alignmentGeneration) {
      return;
    }
    if (!latest) {
      if (opts?.fromStartup) {
        await enterApp(false);
      } else if (isReadOnlyDueToAlignment) {
        isReadOnlyDueToAlignment = false;
        await renderCurrentRoute();
      }
      if (opts?.showAlignedToast) {
        toast.show('Nessun backup trovato su Google Drive: puoi procedere.');
      }
      return;
    }

    const cloudTimestamp = latest.headerTimestamp;
    const localImportTimestamp = parseBackupHeaderDate(settings.lastImportDate);

    if (cloudTimestamp !== null && (localImportTimestamp === null || cloudTimestamp > localImportTimestamp)) {
      if (!opts?.fromStartup) {
        isReadOnlyDueToAlignment = true;
        activeTab = 'OTHERS';
        await renderCurrentRoute();
      }

      const hasLocalData = existingYears.length > 0;
      const modal = openModal({ title: 'Allineamento Dati Richiesto' });
      const p1 = document.createElement('p');
      p1.className = 'modal-text';
      p1.innerHTML = `<strong>È necessario procedere all'import dei dati.</strong>`;
      const p2 = document.createElement('p');
      p2.className = 'modal-text';
      p2.innerHTML = `Su Google Drive è presente un file di backup più recente (<strong>${formatImportDate(latest.headerDate)}</strong>) rispetto alla versione su questo dispositivo (${formatImportDate(settings.lastImportDate)}).`;
      const p3 = document.createElement('p');
      p3.className = 'modal-text muted small-note';
      p3.textContent = hasLocalData
        ? 'Se non effettui l’import, puoi solo visualizzare e stampare i dati locali (inserimenti e modifiche bloccati) oppure uscire.'
        : 'Per proteggere i dati, è necessario importare il backup da Google Drive prima di proseguire.';
      modal.body.append(p1, p2, p3);

      const importBtn = document.createElement('button');
      importBtn.type = 'button';
      importBtn.className = 'btn btn-primary';
      importBtn.textContent = 'Importa da Drive';
      importBtn.addEventListener('click', async () => {
        importBtn.disabled = true;
        try {
          const res = await repo.importFullBackup(latest.content);
          alignmentGeneration += 1;
          modal.close();
          toast.show(`Dati importati dal cloud: ${res.years} annate, ${res.workers} braccianti, ${res.logs} log.`);
          activeTab = 'DAILY';
          await enterApp(false);
        } catch (e) {
          toast.show('Errore importazione: ' + (e instanceof Error ? e.message : String(e)), true);
        } finally {
          importBtn.disabled = false;
        }
      });

      const exitBtn = document.createElement('button');
      exitBtn.type = 'button';
      exitBtn.className = 'btn btn-ghost';
      exitBtn.textContent = 'Esci';
      exitBtn.addEventListener('click', () => {
        modal.close();
        renderClosedScreen(
          "Per evitare disallineamenti è necessario importare i dati da Google Drive prima di utilizzare l'applicazione. Puoi chiudere questa finestra o ricaricare per riprovare.",
        );
      });

      if (hasLocalData) {
        const viewOnlyBtn = document.createElement('button');
        viewOnlyBtn.type = 'button';
        viewOnlyBtn.className = 'btn btn-secondary';
        viewOnlyBtn.textContent = 'Visualizza Soltanto';
        viewOnlyBtn.addEventListener('click', async () => {
          modal.close();
          if (opts?.fromStartup) {
            activeTab = 'DAILY';
            await enterApp(true);
          }
        });
        modal.footer.append(exitBtn, viewOnlyBtn, importBtn);
      } else {
        modal.footer.append(exitBtn, importBtn);
      }
      return;
    }

    if (opts?.fromStartup) {
      await enterApp(false);
    } else if (isReadOnlyDueToAlignment) {
      isReadOnlyDueToAlignment = false;
      await renderCurrentRoute();
    }
    if (opts?.showAlignedToast) {
      toast.show('Dati allineati con Google Drive: puoi procedere.');
    }
  };

  const renderStartupDriveGate = async () => {
    topBar.hidden = true;
    navBar.hidden = true;
    readOnlyBanner.hidden = true;

    const runVerification = async () => {
      mainContent.innerHTML = `
        <div class="card" style="max-width: 460px; margin: 3.5rem auto; text-align: center; padding: 1.75rem;">
          <h2 style="margin-bottom: 0.75rem;">Verifica Google Drive</h2>
          <p class="muted">Verifica stato dei backup su Google Drive in corso...</p>
        </div>
      `;
      try {
        await verifyCloudAlignment({ showAlignedToast: false, fromStartup: true });
      } catch (err) {
        const existingYears = await repo.getAllYears();
        const hasLocalData = existingYears.length > 0;
        const errMsg = err instanceof Error ? err.message : String(err);
        mainContent.innerHTML = `
          <div class="card" style="max-width: 460px; margin: 3.5rem auto; text-align: center; padding: 1.75rem;">
            <h2 style="margin-bottom: 0.75rem;">Impossibile verificare Drive</h2>
            <p class="muted" style="margin-bottom: 1.25rem;">${errMsg}</p>
            <div style="display: flex; gap: 0.6rem; justify-content: center; flex-wrap: wrap;">
              <button type="button" class="btn btn-ghost" id="gate-exit-btn">Esci</button>
              ${
                hasLocalData
                  ? '<button type="button" class="btn btn-secondary" id="gate-viewonly-btn">Visualizza Soltanto</button>'
                  : ''
              }
              <button type="button" class="btn btn-primary" id="gate-retry-btn">Riprova</button>
            </div>
          </div>
        `;
        mainContent.querySelector('#gate-retry-btn')?.addEventListener('click', () => {
          void runVerification();
        });
        mainContent.querySelector('#gate-viewonly-btn')?.addEventListener('click', () => {
          activeTab = 'DAILY';
          void enterApp(true);
        });
        mainContent.querySelector('#gate-exit-btn')?.addEventListener('click', () => {
          renderClosedScreen(
            "Accesso a Google Drive non completato. Puoi chiudere questa finestra o ricaricare per riprovare.",
          );
        });
      }
    };

    if (googleDriveService.isSignedIn()) {
      await runVerification();
      return;
    }

    mainContent.innerHTML = `
      <div class="card" style="max-width: 460px; margin: 3.5rem auto; text-align: center; padding: 1.75rem;">
        <img src="./favicon.svg" alt="GestBraccianti" width="44" height="44" style="border-radius: 10px; margin-bottom: 0.75rem;" />
        <h2 style="margin-bottom: 0.6rem;">Accesso a Google Drive</h2>
        <p class="muted" style="margin-bottom: 1.35rem;">
          Prima di iniziare è necessario accedere a Google Drive per verificare la presenza o lo stato dei backup.
        </p>
        <div style="display: flex; gap: 0.65rem; justify-content: center; flex-wrap: wrap;">
          <button type="button" class="btn btn-ghost" id="startup-drive-exit-btn">Esci</button>
          <button type="button" class="btn btn-primary" id="startup-drive-connect-btn">Connetti Google Drive</button>
        </div>
      </div>
    `;

    const connectBtn = mainContent.querySelector<HTMLButtonElement>('#startup-drive-connect-btn');
    connectBtn?.addEventListener('click', async () => {
      connectBtn.disabled = true;
      try {
        await googleDriveService.signIn();
        await runVerification();
      } catch (err) {
        toast.show(err instanceof Error ? err.message : 'Errore connessione Google Drive', true);
        connectBtn.disabled = false;
      }
    });

    mainContent.querySelector('#startup-drive-exit-btn')?.addEventListener('click', () => {
      renderClosedScreen(
        "È necessario connettersi a Google Drive per utilizzare l'applicazione. Puoi chiudere questa finestra o ricaricare per riprovare.",
      );
    });
  };

  void renderStartupDriveGate();

  return shell;
}
