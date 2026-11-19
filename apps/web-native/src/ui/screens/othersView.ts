import type { AppRepository } from '../../data/appRepository';
import { googleDriveService } from '../../data/googleDriveService';
import { parseBackupHeaderDate } from '../../domain/backupCsv';
import type { FestiveDaysType } from '../../domain/calc';
import {
  escapeHtml,
  formatDateTime,
  saveTextFileLocally,
  showConfirmDialog,
  type ToastController,
} from '../utils';

export async function renderOthersView(params: {
  container: HTMLElement;
  repo: AppRepository;
  toast: ToastController;
  onDatabaseChanged: () => Promise<void>;
  onRefreshChrome?: () => Promise<void>;
  onDriveSignedIn?: () => Promise<void>;
}): Promise<void> {
  const { container, repo, toast, onDatabaseChanged, onRefreshChrome, onDriveSignedIn } = params;

  const refreshSelf = async () => {
    if (onRefreshChrome) {
      await onRefreshChrome();
    }
    await renderOthersView(params);
  };

  const formatImportDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return 'Nessuno';
    const ts = parseBackupHeaderDate(dateStr);
    return ts !== null ? formatDateTime(ts) : dateStr;
  };

  let [settings, backups, hasUnexported] = await Promise.all([
    repo.getSettings(),
    repo.getBackupHistory(),
    repo.hasUnexportedChanges(),
  ]);

  container.innerHTML = '';
  const screen = document.createElement('section');
  screen.className = 'screen others-screen';

  // ==========================================
  // 1. IMPOSTAZIONI AZIENDA E CALCOLO
  // ==========================================
  const isSatFestive = (settings.festiveDaysType & 1) !== 0;
  const isSunFestive = (settings.festiveDaysType & 2) !== 0;

  const settingsCard = document.createElement('article');
  settingsCard.className = 'card section-card';
  settingsCard.innerHTML = `
    <h3>Azienda e Impostazioni Calcolo</h3>
    <p class="muted small-note">Dati aziendali per i report e parametri per il calcolo delle ore lavorate.</p>

    <div class="two-col-grid" style="margin-bottom: 0.75rem;">
      <label class="field">
        <span>Cognome Titolare</span>
        <input id="owner-surname" type="text" value="${escapeHtml(settings.ownerSurname)}" placeholder="Es. Rossi" />
      </label>
      <label class="field">
        <span>Nome Titolare</span>
        <input id="owner-name" type="text" value="${escapeHtml(settings.ownerName)}" placeholder="Es. Azienda Agricola" />
      </label>
    </div>

    <div class="setting-row">
      <div>
        <strong>Straordinari dopo (ore)</strong>
        <div class="muted small-note">Soglia giornaliera per tariffa straordinaria</div>
      </div>
      <input id="extra-threshold-input" type="number" min="0" max="24" step="0.5" class="input-compact" value="${settings.extraHoursThreshold}" />
    </div>

    <hr class="divider" style="margin: 0.75rem 0;" />

    <div class="festive-config-block">
      <strong class="text-primary">Giorni Festivi Settimanali</strong>
      <label class="check-row">
        <input id="festive-sat" type="checkbox" ${isSatFestive ? 'checked' : ''} />
        <span>Sabato</span>
      </label>
      <label class="check-row">
        <input id="festive-sun" type="checkbox" ${isSunFestive ? 'checked' : ''} />
        <span>Domenica</span>
      </label>
    </div>
  `;

  const ownerSurnameIn = settingsCard.querySelector<HTMLInputElement>('#owner-surname')!;
  const ownerNameIn = settingsCard.querySelector<HTMLInputElement>('#owner-name')!;
  const saveOwner = async () => {
    const newSurname = ownerSurnameIn.value.trim();
    const newName = ownerNameIn.value.trim();
    if (newSurname === settings.ownerSurname && newName === settings.ownerName) {
      return;
    }
    settings = await repo.saveSettings({
      ownerSurname: newSurname,
      ownerName: newName,
    });
    toast.show('Dati titolare salvati.');
    if (onRefreshChrome) {
      await onRefreshChrome();
    }
  };
  ownerSurnameIn.addEventListener('change', saveOwner);
  ownerNameIn.addEventListener('change', saveOwner);

  const thresholdIn = settingsCard.querySelector<HTMLInputElement>('#extra-threshold-input')!;
  const satCheck = settingsCard.querySelector<HTMLInputElement>('#festive-sat')!;
  const sunCheck = settingsCard.querySelector<HTMLInputElement>('#festive-sun')!;

  thresholdIn.addEventListener('change', async () => {
    const val = Number(thresholdIn.value.replace(',', '.'));
    if (!Number.isFinite(val) || val < 0) {
      thresholdIn.value = String(settings.extraHoursThreshold);
      toast.show('Inserisci una soglia ore valida.', true);
      return;
    }
    if (val === settings.extraHoursThreshold) {
      return;
    }
    settings = await repo.saveSettings({ extraHoursThreshold: val });
    toast.show(`Soglia straordinari impostata a ${val} ore.`);
    if (onRefreshChrome) {
      await onRefreshChrome();
    }
  });

  const updateFestiveDays = async () => {
    const newType = ((satCheck.checked ? 1 : 0) | (sunCheck.checked ? 2 : 0)) as FestiveDaysType;
    if (newType === settings.festiveDaysType) {
      return;
    }
    settings = await repo.saveSettings({ festiveDaysType: newType });
    toast.show('Calendario festivi aggiornato.');
    if (onRefreshChrome) {
      await onRefreshChrome();
    }
  };
  satCheck.addEventListener('change', updateFestiveDays);
  sunCheck.addEventListener('change', updateFestiveDays);

  screen.appendChild(settingsCard);

  // ==========================================
  // 2. SINCRONIZZAZIONE E BACKUP (UNIFICATO)
  // ==========================================
  const isDriveSignedIn = googleDriveService.isSignedIn();
  const driveEmail = googleDriveService.getUserEmail();
  const lastEmail = googleDriveService.getLastUserEmail();

  const syncCard = document.createElement('article');
  syncCard.className = 'card section-card';
  syncCard.innerHTML = `
    <h3>Sincronizzazione e Backup</h3>
    <p class="muted small-note">Salvataggio automatico su Google Drive e file CSV per allineare smartphone, tablet e PC.</p>

    ${
      hasUnexported
        ? `<div style="margin-bottom: 0.85rem; padding: 0.65rem 0.85rem; background: #fff3cd; color: #856404; border-radius: 8px; font-weight: 700; font-size: 0.85rem; border: 1px solid #ffeeba;">
            ⚠️ Sono presenti modifiche locali non ancora salvate su Google Drive. Clicca su "Esporta Backup" per inviarle al cloud.
           </div>`
        : ''
    }

    <!-- Stato Google Drive -->
    <div style="margin: 0.5rem 0 0.85rem 0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; background: var(--surface-alt); padding: 0.6rem 0.85rem; border-radius: 8px;">
      <div>
        ${
          isDriveSignedIn
            ? `<span class="badge badge-success">🟢 Connesso: ${escapeHtml(driveEmail ?? 'Account Google')}</span>`
            : '<span class="badge badge-warning">⚪ Google Drive non connesso</span>'
        }
      </div>
      <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
        ${
          isDriveSignedIn
            ? '<button type="button" class="btn btn-ghost btn-sm" id="drive-disconnect-btn">Disconnetti</button>'
            : `<button type="button" class="btn btn-primary btn-sm" id="drive-connect-btn">Connetti Google Drive</button>
               ${lastEmail ? '<button type="button" class="btn btn-ghost btn-sm" id="drive-switch-btn" title="Accedi con un account differente">Cambia account</button>' : ''}`
        }
      </div>
    </div>

    <!-- Pulsanti Principali -->
    <div class="two-col-grid" style="margin-bottom: 0.75rem;">
      <button type="button" class="btn btn-primary" id="export-backup-btn">
        📤 Esporta Backup CSV
      </button>

      ${
        isDriveSignedIn
          ? `<button type="button" class="btn btn-secondary" id="drive-import-btn">
               📥 Importa da Google Drive
             </button>`
          : `<label class="btn btn-secondary file-btn">
               📂 Importa Backup Locale
               <input type="file" id="local-import-input" accept=".csv,text/csv" hidden />
             </label>`
      }
    </div>

    ${
      isDriveSignedIn
        ? `<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
            <label class="btn btn-ghost btn-sm file-btn">
              📂 Oppure importa file locale
              <input type="file" id="local-import-input" accept=".csv,text/csv" hidden />
            </label>
            <button type="button" class="btn btn-ghost btn-sm" id="drive-check-btn">
              🔄 Controlla Allineamento Drive
            </button>
           </div>`
        : ''
    }

    <!-- Tabella Stato Allineamento -->
    <div class="sync-info-grid">
      <div class="sync-info-item">
        <span class="sync-info-label">Data Ultimo Import</span>
        <span class="sync-info-value">${escapeHtml(formatImportDate(settings.lastImportDate))}</span>
      </div>
      <div class="sync-info-item">
        <span class="sync-info-label">Data Ultima Modifica</span>
        <span class="sync-info-value">${
          settings.lastMutationDate ? escapeHtml(formatDateTime(settings.lastMutationDate)) : 'Nessuna'
        }</span>
      </div>
      <div class="sync-info-item">
        <span class="sync-info-label">Data Ultimo Export</span>
        <span class="sync-info-value">${
          settings.lastExportDate ? escapeHtml(formatDateTime(settings.lastExportDate)) : 'Nessuno'
        }</span>
      </div>
    </div>
  `;

  // Drive Connect / Disconnect / Switch
  const driveConnectBtn = syncCard.querySelector<HTMLButtonElement>('#drive-connect-btn');
  driveConnectBtn?.addEventListener('click', async () => {
    driveConnectBtn.disabled = true;
    try {
      await googleDriveService.signIn();
      toast.show('Collegamento a Google Drive effettuato! Verifica allineamento...');
      if (onDriveSignedIn) {
        await onDriveSignedIn();
      }
      await refreshSelf();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Errore connessione Google Drive', true);
    } finally {
      driveConnectBtn.disabled = false;
    }
  });

  const driveSwitchBtn = syncCard.querySelector<HTMLButtonElement>('#drive-switch-btn');
  driveSwitchBtn?.addEventListener('click', async () => {
    driveSwitchBtn.disabled = true;
    try {
      await googleDriveService.signIn(undefined, { selectAccount: true });
      toast.show('Collegamento a Google Drive effettuato! Verifica allineamento...');
      if (onDriveSignedIn) {
        await onDriveSignedIn();
      }
      await refreshSelf();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Errore connessione Google Drive', true);
    } finally {
      driveSwitchBtn.disabled = false;
    }
  });

  syncCard.querySelector('#drive-disconnect-btn')?.addEventListener('click', async () => {
    googleDriveService.clearSession();
    toast.show('Disconnesso da Google Drive.');
    await refreshSelf();
  });

  // Export Button (con controllo di sicurezza cloud)
  const exportBackupBtn = syncCard.querySelector<HTMLButtonElement>('#export-backup-btn');
  exportBackupBtn?.addEventListener('click', async () => {
    exportBackupBtn.disabled = true;
    try {
      if (googleDriveService.isSignedIn()) {
        toast.show('Controllo allineamento su Google Drive prima dello scarico...');
        const latestCloud = await googleDriveService.getLatestBackupFile();
        if (latestCloud) {
          const cloudTimestamp = latestCloud.headerTimestamp;
          const localImportTimestamp = parseBackupHeaderDate(settings.lastImportDate);
          if (cloudTimestamp !== null && localImportTimestamp !== null && cloudTimestamp > localImportTimestamp) {
            showConfirmDialog({
              title: 'Export Bloccato: Serve Allineamento',
              message: `Impossibile procedere con l'Export: su Google Drive è presente un backup più recente (${formatImportDate(latestCloud.headerDate)}) rispetto alla data del tuo archivio (${formatImportDate(settings.lastImportDate)}).\n\nÈ necessario procedere prima all'import dei dati per non sovrascrivere le modifiche apportate da un altro dispositivo.`,
              confirmLabel: 'Ho capito',
              cancelLabel: '',
              onConfirm: () => {},
            });
            return;
          }
        }
      }

      const { filename, csvContent } = await repo.exportFullBackup(true);

      if (googleDriveService.isSignedIn()) {
        try {
          await googleDriveService.uploadBackupFile(csvContent);
          const localResult = await saveTextFileLocally(filename, csvContent);
          toast.show(
            localResult === 'cancelled'
              ? 'Backup salvato su Google Drive (salvataggio locale annullato).'
              : 'Backup salvato su Google Drive e in locale!',
          );
        } catch (uploadErr) {
          await repo.recordMutation();
          await saveTextFileLocally(filename, csvContent);
          toast.show(
            `Backup salvato in locale, ma errore nel caricamento su Drive: ${
              uploadErr instanceof Error ? uploadErr.message : String(uploadErr)
            }`,
            true,
          );
        }
      } else {
        const localResult = await saveTextFileLocally(filename, csvContent);
        if (localResult !== 'cancelled') {
          toast.show('Backup salvato in locale e nella cronologia interna!');
        }
      }

      await refreshSelf();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Errore durante l’esportazione.', true);
    } finally {
      exportBackupBtn.disabled = false;
    }
  });

  // Import from Drive
  const driveImportBtn = syncCard.querySelector<HTMLButtonElement>('#drive-import-btn');
  driveImportBtn?.addEventListener('click', async () => {
    driveImportBtn.disabled = true;
    try {
      toast.show('Ricerca ultimo backup su Google Drive...');
      const latest = await googleDriveService.getLatestBackupFile();
      if (!latest) {
        toast.show('Nessun file di backup trovato nella cartella GestBraccianti_Backup su Drive.', true);
        return;
      }
      showConfirmDialog({
        title: 'Importa Backup da Google Drive',
        message: `Verrà scaricato e importato il backup "${latest.name}" (Data: ${formatImportDate(latest.headerDate)}). Questa operazione sostituirà i dati attuali con quelli del cloud (verrà prima salvato un backup automatico interno). Confermi?`,
        confirmLabel: 'Conferma Import',
        danger: true,
        onConfirm: async () => {
          const res = await repo.importFullBackup(latest.content);
          toast.show(`Dati importati: ${res.years} annate, ${res.workers} braccianti, ${res.logs} log.`);
          await onDatabaseChanged();
        },
      });
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Errore import da Google Drive.', true);
    } finally {
      driveImportBtn.disabled = false;
    }
  });

  // Check alignment
  const driveCheckBtn = syncCard.querySelector<HTMLButtonElement>('#drive-check-btn');
  driveCheckBtn?.addEventListener('click', async () => {
    driveCheckBtn.disabled = true;
    try {
      toast.show('Verifica in corso su Google Drive...');
      const latest = await googleDriveService.getLatestBackupFile();
      if (!latest) {
        toast.show('Nessun file di backup trovato su Google Drive.');
        return;
      }
      const cloudTimestamp = latest.headerTimestamp;
      const localImportTimestamp = parseBackupHeaderDate(settings.lastImportDate);

      const unexported = await repo.hasUnexportedChanges();

      if (cloudTimestamp !== null && (localImportTimestamp === null || cloudTimestamp > localImportTimestamp)) {
        showConfirmDialog({
          title: 'Serve Allineamento dal Cloud',
          message: `Su Google Drive è presente un file più recente:\n\n• File Cloud: "${latest.name}"\n• Data Cloud: ${formatImportDate(latest.headerDate)}\n• Data Locale: ${formatImportDate(settings.lastImportDate)}\n\nÈ necessario procedere all'import per allineare questo dispositivo.`,
          confirmLabel: 'Importa Ora da Drive',
          cancelLabel: 'Chiudi',
          onConfirm: async () => {
            await repo.importFullBackup(latest.content);
            toast.show('Dati importati e allineati con Google Drive!');
            await onDatabaseChanged();
          },
        });
      } else if (unexported) {
        toast.show('Il cloud è allineato all’ultimo import, ma hai nuove modifiche locali. Clicca su "Esporta Backup" per salvarle su Drive.');
      } else {
        toast.show(`Archivio già allineato! Ultimo backup cloud: ${formatImportDate(latest.headerDate)}`);
      }
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Errore verifica Google Drive.', true);
    } finally {
      driveCheckBtn.disabled = false;
    }
  });

  // Import local CSV
  const localImportInput = syncCard.querySelector<HTMLInputElement>('#local-import-input');
  localImportInput?.addEventListener('change', async () => {
    const file = localImportInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      showConfirmDialog({
        title: 'Conferma Importazione File',
        message: `Attenzione: caricamento dati da "${file.name}". Questa operazione sostituirà i dati attuali (verrà prima salvato un backup automatico interno). Confermi?`,
        confirmLabel: 'Conferma',
        danger: true,
        onConfirm: async () => {
          const res = await repo.importFullBackup(text);
          toast.show(`Dati importati: ${res.years} annate, ${res.workers} braccianti, ${res.logs} log.`);
          await onDatabaseChanged();
        },
      });
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'File non riconosciuto come backup valido.', true);
    } finally {
      localImportInput.value = '';
    }
  });

  screen.appendChild(syncCard);

  // ==========================================
  // 3. MANUTENZIONE E CRONOLOGIA (IN FONDO)
  // ==========================================
  const maintCard = document.createElement('article');
  maintCard.className = 'card section-card';
  maintCard.innerHTML = `
    <h3>Manutenzione e Cronologia</h3>
    <p class="muted small-note">Archivio storico dei backup interni e gestione del database locale.</p>

    <details style="margin: 0.75rem 0;">
      <summary style="cursor: pointer; font-weight: 700; color: var(--primary);">
        📦 Cronologia Backup Interni (${backups.length})
      </summary>
      <div id="backup-history-container" style="margin-top: 0.65rem;"></div>
    </details>

    <hr class="divider" style="margin: 0.85rem 0;" />

    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
      <div class="muted small-note">Elimina tutti i dati locali memorizzati nel browser.</div>
      <button type="button" class="btn btn-danger-outline btn-sm" id="clear-db-btn">Svuota Database</button>
    </div>
  `;

  // Riempimento lista backup interni
  const historyContainer = maintCard.querySelector<HTMLElement>('#backup-history-container')!;
  if (backups.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted small-note';
    p.textContent = 'Nessun backup salvato internamente.';
    historyContainer.appendChild(p);
  } else {
    const bList = document.createElement('div');
    bList.className = 'card-list';
    for (const item of backups) {
      const row = document.createElement('div');
      row.className = 'backup-row';
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(item.filename)}</strong>
          <div class="muted small-note">${escapeHtml(formatDateTime(item.createdAt))}</div>
        </div>
        <div class="backup-row-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-action="download">Scarica</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="restore">Ripristina</button>
          <button type="button" class="btn-icon-danger" data-action="delete" title="Elimina backup">🗑</button>
        </div>
      `;
      row.querySelector('[data-action="download"]')?.addEventListener('click', async () => {
        const localResult = await saveTextFileLocally(item.filename, item.csvContent);
        if (localResult !== 'cancelled') {
          toast.show('Backup scaricato.');
        }
      });
      row.querySelector('[data-action="restore"]')?.addEventListener('click', () => {
        showConfirmDialog({
          title: 'Ripristina Backup',
          message: `Vuoi ripristinare il backup "${item.filename}"? I dati attuali verranno sostituiti.`,
          confirmLabel: 'Ripristina',
          danger: true,
          onConfirm: async () => {
            await repo.importFullBackup(item.csvContent);
            toast.show('Backup ripristinato correttamente!');
            await onDatabaseChanged();
          },
        });
      });
      row.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
        await repo.deleteBackupHistoryItem(item.id);
        toast.show('Backup rimosso dalla cronologia.');
        await renderOthersView(params);
      });
      bList.appendChild(row);
    }
    historyContainer.appendChild(bList);
  }

  // Clear Database
  maintCard.querySelector('#clear-db-btn')?.addEventListener('click', () => {
    showConfirmDialog({
      title: 'Svuota Database',
      message:
        'Sei sicuro di voler eliminare TUTTI i dati presenti nel database locale? Questa operazione è irreversibile e cancellerà annate, braccianti, gruppi e ore lavorate.',
      confirmLabel: 'Conferma',
      danger: true,
      onConfirm: async () => {
        await repo.clearAllDatabase();
        toast.show('Database svuotato correttamente.');
        await onDatabaseChanged();
      },
    });
  });

  screen.appendChild(maintCard);

  container.appendChild(screen);
}
