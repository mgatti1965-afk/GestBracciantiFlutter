import type { AppRepository } from '../../data/appRepository';
import { escapeHtml, openModal, showConfirmDialog, type ToastController } from '../utils';

export async function renderYearSelectionView(params: {
  container: HTMLElement;
  repo: AppRepository;
  toast: ToastController;
  onYearSelected: (yearId: number) => Promise<void>;
  onOpenHelp: () => void;
}): Promise<void> {
  const { container, repo, toast, onYearSelected, onOpenHelp } = params;
  const years = await repo.getAllYears();

  container.innerHTML = '';

  const page = document.createElement('section');
  page.className = 'screen year-selection-screen';

  const topBar = document.createElement('header');
  topBar.className = 'sub-topbar';
  topBar.innerHTML = `
    <div style="display: flex; align-items: center; gap: 0.65rem;">
      <img src="./favicon.svg" alt="GestBraccianti" width="38" height="38" style="border-radius: 9px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); flex-shrink: 0;" />
      <div>
        <p class="eyebrow">GestBraccianti</p>
        <h2>Seleziona Annata</h2>
      </div>
    </div>
    <div class="sub-topbar-actions">
      <button type="button" class="btn btn-ghost btn-icon" id="year-help-btn" title="Guida">?</button>
      <label class="btn btn-secondary file-btn" title="Importa un backup CSV esistente">
        Importa CSV
        <input type="file" id="year-quick-import" accept=".csv,text/csv" hidden />
      </label>
      <button type="button" class="btn btn-primary" id="new-year-btn">+ Nuova Annata</button>
    </div>
  `;
  page.appendChild(topBar);

  topBar.querySelector('#year-help-btn')?.addEventListener('click', onOpenHelp);

  const quickImportInput = topBar.querySelector<HTMLInputElement>('#year-quick-import');
  quickImportInput?.addEventListener('change', async () => {
    const file = quickImportInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      showConfirmDialog({
        title: 'Conferma Importazione',
        message: `Stai per importare "${file.name}". I dati attualmente salvati nel browser verranno sostituiti (verrà creato un backup automatico di sicurezza). Confermi?`,
        confirmLabel: 'Importa',
        danger: true,
        onConfirm: async () => {
          const res = await repo.importFullBackup(text);
          toast.show(
            `Importati: ${res.years} annate, ${res.workers} braccianti, ${res.groups} gruppi, ${res.logs} log.`,
          );
          const current = await repo.getCurrentYear();
          if (current) {
            await onYearSelected(current.id);
          } else {
            await renderYearSelectionView(params);
          }
        },
      });
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Errore durante importazione CSV.', true);
    } finally {
      quickImportInput.value = '';
    }
  });

  const openAddYearDialog = () => {
    const lastYear = years.length > 0 ? Math.max(...years.map((y) => y.id)) : null;
    const suggestedYear = lastYear !== null ? lastYear + 1 : new Date().getFullYear();

    const modal = openModal({ title: 'Nuova Annata' });
    modal.body.innerHTML = `
      <div class="form-stack">
        <label class="field">
          <span>Anno (es. ${suggestedYear})</span>
          <input id="modal-year-id" type="number" min="2000" max="2100" value="${suggestedYear}" class="input-big" />
        </label>
        <label class="field">
          <span>Note (es. Vendemmia)</span>
          <input id="modal-year-notes" type="text" placeholder="Vendemmia" />
        </label>
        ${
          lastYear !== null
            ? `
          <div class="migrate-box">
            <p class="migrate-title">Importa dati dall'ultima annata (${lastYear}):</p>
            <label class="switch-row">
              <span>Braccianti (e relative tariffe)</span>
              <input id="modal-migrate-workers" type="checkbox" checked />
            </label>
            <label class="switch-row">
              <span>Gruppi</span>
              <input id="modal-migrate-groups" type="checkbox" checked />
            </label>
          </div>
        `
            : ''
        }
      </div>
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = 'Annulla';
    cancelBtn.addEventListener('click', () => modal.close());

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'btn btn-primary';
    createBtn.textContent = 'Crea';
    createBtn.addEventListener('click', async () => {
      const yearInput = modal.body.querySelector<HTMLInputElement>('#modal-year-id');
      const notesInput = modal.body.querySelector<HTMLInputElement>('#modal-year-notes');
      const migrateWorkers = modal.body.querySelector<HTMLInputElement>('#modal-migrate-workers')?.checked ?? false;
      const migrateGroups = modal.body.querySelector<HTMLInputElement>('#modal-migrate-groups')?.checked ?? false;

      const parsedYear = Number(yearInput?.value);
      if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
        toast.show('Inserisci un anno valido tra 2000 e 2100.', true);
        return;
      }

      createBtn.disabled = true;
      try {
        await repo.createYear({
          yearId: parsedYear,
          notes: notesInput?.value ?? '',
          migrateFromYearId: lastYear,
          migrateWorkers,
          migrateGroups,
        });
        modal.close();
        toast.show(`Annata ${parsedYear} creata.`);
        await onYearSelected(parsedYear);
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Errore creazione annata.', true);
      } finally {
        createBtn.disabled = false;
      }
    });

    modal.footer.append(cancelBtn, createBtn);
  };

  topBar.querySelector('#new-year-btn')?.addEventListener('click', openAddYearDialog);

  if (years.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-card';
    empty.innerHTML = `
      <p class="empty-title">Nessuna annata presente</p>
      <p class="muted">Crea la prima annata agraria oppure importa un file di backup CSV dall'app Android.</p>
      <button type="button" class="btn btn-primary" id="empty-create-year">Crea Annata ${new Date().getFullYear()}</button>
    `;
    empty.querySelector('#empty-create-year')?.addEventListener('click', openAddYearDialog);
    page.appendChild(empty);
    container.appendChild(page);
    return;
  }

  const list = document.createElement('div');
  list.className = 'card-list';

  for (const year of years) {
    const card = document.createElement('article');
    card.className = `card year-card clickable ${year.isCurrent ? 'year-card-current' : ''}`;
    const title = year.notes ? `${year.id} - ${year.notes}` : `${year.id}`;
    card.innerHTML = `
      <div class="year-card-main">
        <div class="year-card-title">${escapeHtml(title)}</div>
        ${year.isCurrent ? '<span class="chip chip-primary">Corrente</span>' : ''}
      </div>
      <button type="button" class="btn-icon-danger" title="Elimina annata" aria-label="Elimina annata ${year.id}">🗑</button>
    `;

    card.addEventListener('click', async (event) => {
      if ((event.target as HTMLElement).closest('button')) {
        return;
      }
      await repo.selectYear(year.id);
      await onYearSelected(year.id);
    });

    card.querySelector('button')?.addEventListener('click', (event) => {
      event.stopPropagation();
      showConfirmDialog({
        title: 'Elimina Annata',
        message: `Sei sicuro di voler eliminare l'annata ${year.id}? Tutti i dati relativi (tariffe annuali, gruppi e ore di lavoro) verranno persi permanentemente.`,
        confirmLabel: 'Elimina',
        danger: true,
        onConfirm: async () => {
          await repo.deleteYear(year.id);
          toast.show(`Annata ${year.id} eliminata.`);
          await renderYearSelectionView(params);
        },
      });
    });

    list.appendChild(card);
  }

  page.appendChild(list);
  container.appendChild(page);
}
