import type { AppRepository } from '../../data/appRepository';
import { formatCurrencyIt } from '../../domain/calc';
import {
  findDuplicateWorkerGroups,
  workerFullName,
  type WorkerGroup,
  type WorkerWithRate,
} from '../../domain/models';
import { escapeHtml, openModal, showConfirmDialog, type ToastController } from '../utils';

export interface WorkerRegistryState {
  activeSubTab: 'WORKERS' | 'GROUPS';
  searchQuery: string;
}

export async function renderWorkerRegistryView(params: {
  container: HTMLElement;
  repo: AppRepository;
  toast: ToastController;
  yearId: number;
  state: WorkerRegistryState;
}): Promise<void> {
  const { container, repo, toast, yearId, state } = params;

  const [workersWithRate, allWorkers, groupsWithMembers] = await Promise.all([
    repo.getWorkersWithRateForYear(yearId),
    repo.getAllWorkers(),
    repo.getGroupsWithMembersForYear(yearId),
  ]);

  const duplicates = findDuplicateWorkerGroups(allWorkers);

  container.innerHTML = '';
  const screen = document.createElement('section');
  screen.className = 'screen worker-registry-screen';

  // Sub-tabs (Anagrafica / Gruppi)
  const subTabs = document.createElement('div');
  subTabs.className = 'subtabs-bar';
  subTabs.innerHTML = `
    <button type="button" class="subtab ${state.activeSubTab === 'WORKERS' ? 'active' : ''}" data-subtab="WORKERS">Anagrafica (${workersWithRate.length})</button>
    <button type="button" class="subtab ${state.activeSubTab === 'GROUPS' ? 'active' : ''}" data-subtab="GROUPS">Gruppi (${groupsWithMembers.length})</button>
  `;
  subTabs.querySelectorAll<HTMLButtonElement>('[data-subtab]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.activeSubTab = btn.dataset.subtab as 'WORKERS' | 'GROUPS';
      await renderWorkerRegistryView(params);
    });
  });
  screen.appendChild(subTabs);

  if (state.activeSubTab === 'WORKERS') {
    // Duplicate Profiles Alert (Rule R6)
    for (const dupGroup of duplicates) {
      const alertCard = document.createElement('div');
      alertCard.className = 'duplicate-alert-card';
      alertCard.innerHTML = `
        <div>
          <strong>Braccianti Duplicati Rilevati</strong>
          <p class="small-note">${escapeHtml(workerFullName(dupGroup[0]))} (${dupGroup.length} profili): vuoi unirli in un unico profilo preservando tutte le giornate lavorative?</p>
        </div>
        <button type="button" class="btn btn-danger btn-sm">Unisci Profili</button>
      `;
      alertCard.querySelector('button')?.addEventListener('click', async () => {
        await repo.mergeDuplicateGroup(dupGroup.map((w) => w.id));
        toast.show('Profili uniti correttamente.');
        await renderWorkerRegistryView(params);
      });
      screen.appendChild(alertCard);
    }

    // Toolbar: Search + Copy Prev Year + Add Worker
    const toolbar = document.createElement('div');
    toolbar.className = 'registry-toolbar';
    toolbar.innerHTML = `
      <div class="search-wrap">
        <input id="worker-search-input" type="search" value="${escapeHtml(state.searchQuery)}" placeholder="Cerca bracciante..." />
      </div>
      <div class="registry-actions">
        <button type="button" class="btn btn-secondary btn-sm" id="copy-workers-btn" title="Copia braccianti e tariffe da ${yearId - 1}">Copia da ${yearId - 1}</button>
        <button type="button" class="btn btn-primary" id="add-worker-btn">+ Aggiungi Bracciante</button>
      </div>
    `;
    screen.appendChild(toolbar);

    const searchInput = toolbar.querySelector<HTMLInputElement>('#worker-search-input')!;
    const listWrap = document.createElement('div');
    listWrap.className = 'card-list';

    const renderWorkerCards = () => {
      const q = state.searchQuery.trim().toLocaleLowerCase('it');
      const filtered = q
        ? workersWithRate.filter(
            (w) =>
              w.name.toLocaleLowerCase('it').includes(q) ||
              w.surname.toLocaleLowerCase('it').includes(q) ||
              w.phoneNumber.includes(q),
          )
        : workersWithRate;

      listWrap.innerHTML = '';

      if (workersWithRate.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-card';
        empty.innerHTML = `
          <p class="empty-title">Nessun bracciante registrato per il ${yearId}.</p>
          <p class="muted">Aggiungi un nuovo bracciante o copia l'anagrafica dall'anno precedente.</p>
          <button type="button" class="btn btn-secondary" id="empty-copy-workers">Copia da anno precedente (${yearId - 1})</button>
        `;
        empty.querySelector('#empty-copy-workers')?.addEventListener('click', async () => {
          const count = await repo.copyWorkersFromPreviousYear(yearId);
          toast.show(count > 0 ? `Copiati ${count} braccianti!` : `Nessun bracciante da copiare dal ${yearId - 1}.`);
          await renderWorkerRegistryView(params);
        });
        listWrap.appendChild(empty);
        return;
      }

      if (filtered.length === 0) {
        const noRes = document.createElement('div');
        noRes.className = 'empty-card';
        noRes.textContent = `Nessun risultato per "${state.searchQuery}"`;
        listWrap.appendChild(noRes);
        return;
      }

      filtered.forEach((worker, index) => {
        const card = document.createElement('article');
        card.className = `card worker-rate-card clickable ${index % 2 === 1 ? 'card-alt' : ''}`;
        card.innerHTML = `
          <div class="worker-rate-main">
            <div class="worker-name-row">
              <strong>${escapeHtml(workerFullName(worker))}</strong>
              ${worker.phoneNumber ? `<span class="muted small-note">• ${escapeHtml(worker.phoneNumber)}</span>` : ''}
            </div>
            <div class="rates-inline">
              <span>Ord: <strong>${escapeHtml(formatCurrencyIt(worker.hourlyRate))}</strong></span>
              <span>STR: <strong>${escapeHtml(formatCurrencyIt(worker.extraHourlyRate))}</strong></span>
              <span>fest: <strong>${escapeHtml(formatCurrencyIt(worker.holidayHourlyRate))}</strong></span>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" title="Modifica bracciante">Modifica</button>
        `;
        card.addEventListener('click', () => openAddEditWorkerDialog(worker));
        listWrap.appendChild(card);
      });
    };

    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value;
      renderWorkerCards();
    });

    toolbar.querySelector('#copy-workers-btn')?.addEventListener('click', async () => {
      const count = await repo.copyWorkersFromPreviousYear(yearId);
      toast.show(count > 0 ? `Copiati ${count} braccianti nuovi da ${yearId - 1}!` : `Nessun nuovo bracciante da copiare dal ${yearId - 1}.`);
      await renderWorkerRegistryView(params);
    });

    const openAddEditWorkerDialog = (editing: WorkerWithRate | null) => {
      const modal = openModal({
        title: editing ? 'Modifica Bracciante' : 'Nuovo Bracciante',
        headerActionHtml: editing
          ? '<button type="button" class="btn-icon-danger" title="Elimina bracciante">🗑</button>'
          : undefined,
        onHeaderAction: editing
          ? () => {
              modal.close();
              showConfirmDialog({
                title: 'Elimina Bracciante',
                message: `Sei sicuro di voler eliminare ${workerFullName(editing)}? Questa azione è irreversibile e cancellerà TUTTE le sue giornate lavorative e i compensi, inclusi quelli degli ANNI PRECEDENTI.`,
                confirmLabel: 'Conferma',
                danger: true,
                onConfirm: async () => {
                  await repo.deleteWorker(editing.id);
                  toast.show(`Bracciante ${workerFullName(editing)} eliminato.`);
                  await renderWorkerRegistryView(params);
                },
              });
            }
          : undefined,
      });

      modal.body.innerHTML = `
        <div class="form-stack">
          <label class="field">
            <span>Cognome (Obbligatorio) *</span>
            <input id="w-surname" type="text" value="${escapeHtml(editing?.surname ?? '')}" required />
          </label>
          <label class="field">
            <span>Nome</span>
            <input id="w-name" type="text" value="${escapeHtml(editing?.name ?? '')}" />
          </label>
          <label class="field">
            <span>Telefono</span>
            <input id="w-phone" type="tel" value="${escapeHtml(editing?.phoneNumber ?? '')}" />
          </label>
          <div class="rates-grid-3">
            <label class="field">
              <span>Paga Oraria Normale (€)</span>
              <input id="w-rate" type="number" step="0.01" min="0" value="${editing && editing.hourlyRate > 0 ? editing.hourlyRate : ''}" placeholder="0.00" />
            </label>
            <label class="field">
              <span>Paga Straordinario (€)</span>
              <input id="w-extra" type="number" step="0.01" min="0" value="${editing && editing.extraHourlyRate > 0 ? editing.extraHourlyRate : ''}" placeholder="0.00" />
            </label>
            <label class="field">
              <span>Paga Festivi (€)</span>
              <input id="w-holiday" type="number" step="0.01" min="0" value="${editing && editing.holidayHourlyRate > 0 ? editing.holidayHourlyRate : ''}" placeholder="0.00" />
            </label>
          </div>
          <p class="error-text" id="w-form-error"></p>
        </div>
      `;

      const surnameIn = modal.body.querySelector<HTMLInputElement>('#w-surname')!;
      const nameIn = modal.body.querySelector<HTMLInputElement>('#w-name')!;
      const phoneIn = modal.body.querySelector<HTMLInputElement>('#w-phone')!;
      const rateIn = modal.body.querySelector<HTMLInputElement>('#w-rate')!;
      const extraIn = modal.body.querySelector<HTMLInputElement>('#w-extra')!;
      const holidayIn = modal.body.querySelector<HTMLInputElement>('#w-holiday')!;
      const errOut = modal.body.querySelector<HTMLParagraphElement>('#w-form-error')!;

      // Automatic rate replication matching AddEditWorkerDialog.kt L733-744
      let prevRate = rateIn.value;
      rateIn.addEventListener('input', () => {
        if (extraIn.value === '' || extraIn.value === prevRate) {
          extraIn.value = rateIn.value;
        }
        if (holidayIn.value === '' || holidayIn.value === prevRate) {
          holidayIn.value = rateIn.value;
        }
        prevRate = rateIn.value;
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-ghost';
      cancelBtn.textContent = 'Annulla';
      cancelBtn.addEventListener('click', () => modal.close());

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn btn-primary';
      saveBtn.textContent = editing ? 'Salva' : 'Aggiungi';
      saveBtn.addEventListener('click', async () => {
        errOut.textContent = '';
        const surname = surnameIn.value.trim();
        if (!surname) {
          errOut.textContent = 'Il cognome è necessario per salvare.';
          return;
        }
        const parseRate = (val: string) => {
          const n = Number(val.trim().replace(',', '.'));
          return Number.isFinite(n) && n >= 0 ? n : 0;
        };

        saveBtn.disabled = true;
        try {
          await repo.addOrUpdateWorkerForYear({
            workerId: editing?.id,
            yearId,
            surname,
            name: nameIn.value,
            phoneNumber: phoneIn.value,
            hourlyRate: parseRate(rateIn.value),
            extraHourlyRate: parseRate(extraIn.value),
            holidayHourlyRate: parseRate(holidayIn.value),
          });
          modal.close();
          toast.show(editing ? 'Bracciante aggiornato.' : 'Bracciante aggiunto.');
          await renderWorkerRegistryView(params);
        } catch (err) {
          errOut.textContent = err instanceof Error ? err.message : 'Errore salvataggio bracciante.';
        } finally {
          saveBtn.disabled = false;
        }
      });

      modal.footer.append(cancelBtn, saveBtn);
    };

    toolbar.querySelector('#add-worker-btn')?.addEventListener('click', () => openAddEditWorkerDialog(null));
    renderWorkerCards();
    screen.appendChild(listWrap);
  } else {
    // Groups Tab
    const toolbar = document.createElement('div');
    toolbar.className = 'registry-toolbar';
    toolbar.innerHTML = `
      <span class="muted">Squadre dell'annata ${yearId}</span>
      <div class="registry-actions">
        <button type="button" class="btn btn-secondary btn-sm" id="copy-groups-btn">Copia da ${yearId - 1}</button>
        <button type="button" class="btn btn-primary" id="add-group-btn">+ Nuovo Gruppo</button>
      </div>
    `;
    screen.appendChild(toolbar);

    toolbar.querySelector('#copy-groups-btn')?.addEventListener('click', async () => {
      const count = await repo.copyGroupsFromPreviousYear(yearId);
      toast.show(count > 0 ? `Copiati ${count} nuovi gruppi!` : 'Nessun nuovo gruppo da copiare.');
      await renderWorkerRegistryView(params);
    });

    toolbar.querySelector('#add-group-btn')?.addEventListener('click', () => {
      const modal = openModal({ title: 'Nuovo Gruppo' });
      modal.body.innerHTML = `
        <div class="form-stack">
          <label class="field">
            <span>Nome Gruppo</span>
            <input id="g-name-input" type="text" placeholder="Es. Squadra Raccolta" />
          </label>
          <p class="error-text" id="g-form-error"></p>
        </div>
      `;
      const nameIn = modal.body.querySelector<HTMLInputElement>('#g-name-input')!;
      const errOut = modal.body.querySelector<HTMLParagraphElement>('#g-form-error')!;

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
        errOut.textContent = '';
        createBtn.disabled = true;
        try {
          await repo.createGroup(nameIn.value, yearId);
          modal.close();
          toast.show('Gruppo creato.');
          await renderWorkerRegistryView(params);
        } catch (err) {
          errOut.textContent = err instanceof Error ? err.message : 'Errore creazione gruppo.';
        } finally {
          createBtn.disabled = false;
        }
      });

      modal.footer.append(cancelBtn, createBtn);
    });

    if (groupsWithMembers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-card';
      empty.innerHTML = `
        <p class="empty-title">Nessun gruppo creato.</p>
        <p class="muted">Raggruppa i braccianti per inserirli in blocco sulle giornate lavorative.</p>
        <button type="button" class="btn btn-secondary" id="empty-copy-groups">Copia da anno precedente (${yearId - 1})</button>
      `;
      empty.querySelector('#empty-copy-groups')?.addEventListener('click', async () => {
        const count = await repo.copyGroupsFromPreviousYear(yearId);
        toast.show(count > 0 ? `Copiati ${count} gruppi!` : 'Nessun gruppo trovato nell\'anno precedente.');
        await renderWorkerRegistryView(params);
      });
      screen.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'card-list';

      const openMembersModal = (group: WorkerGroup, currentMembersIds: Set<number>) => {
        const modal = openModal({ title: `Componenti: ${group.name}` });
        if (workersWithRate.length === 0) {
          modal.body.innerHTML = '<p class="muted">Nessun bracciante presente in questa annata.</p>';
        } else {
          const checklist = document.createElement('div');
          checklist.className = 'checklist';
          for (const w of workersWithRate) {
            const row = document.createElement('label');
            row.className = 'check-row';
            const checked = currentMembersIds.has(w.id);
            row.innerHTML = `
              <input type="checkbox" ${checked ? 'checked' : ''} />
              <span>${escapeHtml(workerFullName(w))}</span>
            `;
            const cb = row.querySelector<HTMLInputElement>('input')!;
            cb.addEventListener('change', async () => {
              await repo.setGroupMember(group.id, w.id, cb.checked);
            });
            checklist.appendChild(row);
          }
          modal.body.appendChild(checklist);
        }
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn btn-primary';
        closeBtn.textContent = 'Chiudi';
        closeBtn.addEventListener('click', async () => {
          modal.close();
          await renderWorkerRegistryView(params);
        });
        modal.footer.appendChild(closeBtn);
      };

      groupsWithMembers.forEach(({ group, members }, index) => {
        const card = document.createElement('article');
        card.className = `card group-card clickable ${index % 2 === 1 ? 'card-alt' : ''}`;
        const membersHtml =
          members.length > 0
            ? `<div class="group-members-grid">${members
                .map((m) => `<span>${escapeHtml(workerFullName(m))}</span>`)
                .join('')}</div>`
            : '<p class="muted small-note">Clicca per aggiungere braccianti a questo gruppo.</p>';

        card.innerHTML = `
          <div class="group-card-head">
            <div>
              <strong>${escapeHtml(group.name)}</strong>
              <div class="group-count">${members.length} braccianti</div>
            </div>
            <div class="group-card-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-action="members">Componenti</button>
              <button type="button" class="btn-icon-danger" data-action="delete" title="Elimina gruppo">🗑</button>
            </div>
          </div>
          ${membersHtml}
        `;

        card.addEventListener('click', (event) => {
          if ((event.target as HTMLElement).closest('[data-action="delete"]')) {
            return;
          }
          openMembersModal(group, new Set(members.map((m) => m.id)));
        });

        card.querySelector('[data-action="delete"]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          showConfirmDialog({
            title: 'Elimina Gruppo',
            message: `Confermi l'eliminazione del gruppo "${group.name}"?`,
            confirmLabel: 'Elimina',
            danger: true,
            onConfirm: async () => {
              await repo.deleteGroup(group.id);
              toast.show(`Gruppo "${group.name}" eliminato.`);
              await renderWorkerRegistryView(params);
            },
          });
        });

        list.appendChild(card);
      });

      screen.appendChild(list);
    }
  }

  container.appendChild(screen);
}
