import type { AppRepository } from '../../data/appRepository';
import type { FestiveDaysType } from '../../domain/calc';
import {
  downloadTextFile,
  escapeHtml,
  formatDateTime,
  showConfirmDialog,
  type ToastController,
} from '../utils';

export async function renderOthersView(params: {
  container: HTMLElement;
  repo: AppRepository;
  toast: ToastController;
  onDatabaseChanged: () => Promise<void>;
}): Promise<void> {
  const { container, repo, toast, onDatabaseChanged } = params;

  const [settings, backups] = await Promise.all([
    repo.getSettings(),
    repo.getBackupHistory(),
  ]);

  container.innerHTML = '';
  const screen = document.createElement('section');
  screen.className = 'screen others-screen';

  // 1. Azienda / Titolare
  const ownerCard = document.createElement('article');
  ownerCard.className = 'card section-card';
  ownerCard.innerHTML = `
    <h3>Azienda / Titolare</h3>
    <p class="muted small-note">Dati stampati nell'intestazione dei report PDF.</p>
    <div class="two-col-grid">
      <label class="field">
        <span>Cognome</span>
        <input id="owner-surname" type="text" value="${escapeHtml(settings.ownerSurname)}" placeholder="Es. Rossi" />
      </label>
      <label class="field">
        <span>Nome</span>
        <input id="owner-name" type="text" value="${escapeHtml(settings.ownerName)}" placeholder="Es. Azienda Agricola" />
      </label>
    </div>
  `;

  const ownerSurnameIn = ownerCard.querySelector<HTMLInputElement>('#owner-surname')!;
  const ownerNameIn = ownerCard.querySelector<HTMLInputElement>('#owner-name')!;
  const saveOwner = async () => {
    await repo.saveSettings({
      ownerSurname: ownerSurnameIn.value.trim(),
      ownerName: ownerNameIn.value.trim(),
    });
    toast.show('Dati titolare salvati.');
  };
  ownerSurnameIn.addEventListener('change', saveOwner);
  ownerNameIn.addEventListener('change', saveOwner);
  screen.appendChild(ownerCard);

  // 2. Impostazioni Calcolo (Impianto)
  const isSatFestive = (settings.festiveDaysType & 1) !== 0;
  const isSunFestive = (settings.festiveDaysType & 2) !== 0;

  const calcCard = document.createElement('article');
  calcCard.className = 'card section-card';
  calcCard.innerHTML = `
    <h3>Impostazioni Calcolo (Impianto)</h3>
    <div class="setting-row">
      <div>
        <strong>Straordinari dopo (ore)</strong>
        <div class="muted small-note">Soglia giornaliera oltre la quale scatta la tariffa straordinaria</div>
      </div>
      <input id="extra-threshold-input" type="number" min="0" max="24" step="0.5" class="input-compact" value="${settings.extraHoursThreshold}" />
    </div>
    <hr class="divider" />
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

  const thresholdIn = calcCard.querySelector<HTMLInputElement>('#extra-threshold-input')!;
  const satCheck = calcCard.querySelector<HTMLInputElement>('#festive-sat')!;
  const sunCheck = calcCard.querySelector<HTMLInputElement>('#festive-sun')!;

  thresholdIn.addEventListener('change', async () => {
    const val = Number(thresholdIn.value.replace(',', '.'));
    if (!Number.isFinite(val) || val < 0) {
      thresholdIn.value = String(settings.extraHoursThreshold);
      toast.show('Inserisci una soglia ore valida.', true);
      return;
    }
    await repo.saveSettings({ extraHoursThreshold: val });
    toast.show(`Soglia straordinari impostata a ${val} ore.`);
  });

  const updateFestiveDays = async () => {
    const newType = ((satCheck.checked ? 1 : 0) | (sunCheck.checked ? 2 : 0)) as FestiveDaysType;
    await repo.saveSettings({ festiveDaysType: newType });
    toast.show('Calendario festivi settimanali aggiornato.');
  };
  satCheck.addEventListener('change', updateFestiveDays);
  sunCheck.addEventListener('change', updateFestiveDays);
  screen.appendChild(calcCard);

  // 3. Esportazione e Backup (CSV)
  const csvCard = document.createElement('article');
  csvCard.className = 'card section-card';
  csvCard.innerHTML = `
    <h3>Esportazione e Backup (CSV)</h3>
    <p class="muted small-note">Formato GestBraccianti compatibile al 100% con i backup Android (annate, braccianti, tariffe, gruppi, orari e impostazioni).</p>
    <div class="two-col-grid">
      <button type="button" class="btn btn-primary" id="others-export-btn">Esporta Backup CSV</button>
      <label class="btn btn-secondary file-btn">
        Importa Backup CSV
        <input type="file" id="others-import-input" accept=".csv,text/csv" hidden />
      </label>
    </div>
  `;

  csvCard.querySelector('#others-export-btn')?.addEventListener('click', async () => {
    const { filename, csvContent } = await repo.exportFullBackup(true);
    downloadTextFile(filename, csvContent);
    toast.show('Dati esportati e salvati nella cronologia backup!');
    await renderOthersView(params);
  });

  const importInput = csvCard.querySelector<HTMLInputElement>('#others-import-input')!;
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      showConfirmDialog({
        title: 'Conferma Importazione',
        message: `Attenzione: caricamento dati da "${file.name}". Questa operazione sostituirà tutti i dati attuali con quelli del file scelto (verrà prima salvato un backup automatico interno). Confermi?`,
        confirmLabel: 'Conferma',
        danger: true,
        onConfirm: async () => {
          const res = await repo.importFullBackup(text);
          toast.show(`Dati importati: ${res.years} annate, ${res.workers} braccianti, ${res.groups} gruppi, ${res.logs} log.`);
          await onDatabaseChanged();
        },
      });
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'File non riconosciuto come backup valido.', true);
    } finally {
      importInput.value = '';
    }
  });
  screen.appendChild(csvCard);

  // 4. Cronologia Backup Interni
  const historyCard = document.createElement('article');
  historyCard.className = 'card section-card';
  historyCard.innerHTML = '<h3>Cronologia Backup Interni</h3>';

  if (backups.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted small-note';
    p.textContent = 'Nessun backup salvato internamente.';
    historyCard.appendChild(p);
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
      row.querySelector('[data-action="download"]')?.addEventListener('click', () => {
        downloadTextFile(item.filename, item.csvContent);
        toast.show('Backup scaricato.');
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
    historyCard.appendChild(bList);
  }
  screen.appendChild(historyCard);

  // 5. Area Manutenzione (Reset DB)
  const dangerCard = document.createElement('article');
  dangerCard.className = 'card section-card danger-zone-card';
  dangerCard.innerHTML = `
    <h3>Manutenzione Archivio</h3>
    <p class="muted small-note">Elimina tutti i dati salvati localmente nel browser (si consiglia un backup CSV prima di procedere).</p>
    <button type="button" class="btn btn-danger-outline" id="clear-db-btn">Svuota Database</button>
  `;
  dangerCard.querySelector('#clear-db-btn')?.addEventListener('click', () => {
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
  screen.appendChild(dangerCard);

  container.appendChild(screen);
}
