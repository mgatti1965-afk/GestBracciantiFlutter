import {
  exportAndroidBackupCsv,
  extractBackupHeaderDate,
  formatBackupHeaderDate,
  importFullBackupCsv,
  parseBackupHeaderDate,
  type FullBackupDataset,
} from '../domain/backupCsv';
import {
  capitalizeWords,
  round2,
  type FestiveDaysType,
} from '../domain/calc';
import { normalizeYearInput, sortYearsDesc, type HarvestYear } from '../domain/harvestYear';
import {
  computeWorkLogFromShifts,
  DEFAULT_OWNER_SETTINGS,
  normalizeWorkerFields,
  recalculateWorkLog,
  sortAppWorkers,
  type AppWorker,
  type BackupHistoryItem,
  type OwnerSettings,
  type Plantation,
  type WorkerGroup,
  type WorkerGroupMember,
  type WorkerWithRate,
  type WorkerYearConfig,
} from '../domain/models';
import { sortLogsByDateDesc, type WorkLog } from '../domain/workLog';
import { DRIVE_BACKUP_FILE_NAME } from './driveConfig';
import {
  requestToPromise,
  STORE_BACKUPS,
  STORE_CONFIGS,
  STORE_GROUP_MEMBERS,
  STORE_GROUPS,
  STORE_LOGS,
  STORE_PLANTATIONS,
  STORE_SETTINGS,
  STORE_WORKERS,
  STORE_YEARS,
  withTransaction,
} from './db';

const SETTINGS_KEY = 'ownerSettings';

function formatBackupTimestamp(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${min}`;
}

function normalizeSettings(raw: Partial<OwnerSettings> | undefined): OwnerSettings {
  const festive = raw?.festiveDaysType;
  const festiveDaysType: FestiveDaysType =
    festive === 0 || festive === 1 || festive === 2 || festive === 3 ? festive : 3;
  const threshold = Number(raw?.extraHoursThreshold);
  return {
    ownerName: raw?.ownerName ?? '',
    ownerSurname: raw?.ownerSurname ?? '',
    extraHoursThreshold: Number.isFinite(threshold) && threshold >= 0 ? threshold : 8,
    festiveDaysType,
    globalFestiveDates: Array.isArray(raw?.globalFestiveDates)
      ? raw.globalFestiveDates.filter((x) => Number.isFinite(x))
      : [],
    saveCountSinceBackup: Number.isFinite(raw?.saveCountSinceBackup)
      ? Math.max(0, Math.trunc(raw!.saveCountSinceBackup!))
      : 0,
    lastImportDate: typeof raw?.lastImportDate === 'string' ? raw.lastImportDate : (raw?.lastImportDate ?? null),
    lastMutationDate: Number.isFinite(raw?.lastMutationDate) ? Number(raw!.lastMutationDate) : 0,
    lastExportDate: Number.isFinite(raw?.lastExportDate) ? Number(raw!.lastExportDate) : null,
    googleDriveClientId: typeof raw?.googleDriveClientId === 'string' ? raw.googleDriveClientId : '',
  };
}

export class AppRepository {
  async getSettings(): Promise<OwnerSettings> {
    return withTransaction(STORE_SETTINGS, 'readonly', async (tx) => {
      const stored = (await requestToPromise(tx.objectStore(STORE_SETTINGS).get(SETTINGS_KEY))) as
        | ({ key: string } & Partial<OwnerSettings>)
        | undefined;
      return normalizeSettings(stored);
    });
  }

  async saveSettings(partial: Partial<OwnerSettings>): Promise<OwnerSettings> {
    return withTransaction(STORE_SETTINGS, 'readwrite', async (tx) => {
      const store = tx.objectStore(STORE_SETTINGS);
      const current = (await requestToPromise(store.get(SETTINGS_KEY))) as
        | ({ key: string } & Partial<OwnerSettings>)
        | undefined;
      const isInternalSyncUpdate =
        'lastMutationDate' in partial || 'lastExportDate' in partial || 'lastImportDate' in partial;
      const merged = normalizeSettings({
        ...current,
        ...partial,
        ...(isInternalSyncUpdate ? {} : { lastMutationDate: Date.now() }),
      });
      await requestToPromise(store.put({ key: SETTINGS_KEY, ...merged }));
      return merged;
    });
  }

  async recordMutation(): Promise<void> {
    const settings = await this.getSettings();
    await this.saveSettings({
      saveCountSinceBackup: settings.saveCountSinceBackup + 1,
      lastMutationDate: Date.now(),
    });
  }

  async hasUnexportedChanges(): Promise<boolean> {
    const settings = await this.getSettings();
    if (!settings.lastMutationDate || settings.lastMutationDate === 0) {
      return false;
    }
    if (!settings.lastExportDate) {
      return settings.lastMutationDate > 0;
    }
    return settings.lastMutationDate > settings.lastExportDate;
  }

  async incrementSaveCount(): Promise<number> {
    const settings = await this.getSettings();
    const updated = await this.saveSettings({
      saveCountSinceBackup: settings.saveCountSinceBackup + 1,
      lastMutationDate: Date.now(),
    });
    return updated.saveCountSinceBackup;
  }

  async getAllYears(): Promise<HarvestYear[]> {
    return withTransaction(STORE_YEARS, 'readonly', async (tx) => {
      const list = (await requestToPromise(tx.objectStore(STORE_YEARS).getAll())) as HarvestYear[];
      return sortYearsDesc(list);
    });
  }

  async getCurrentYear(): Promise<HarvestYear | undefined> {
    const years = await this.getAllYears();
    return years.find((y) => y.isCurrent);
  }

  async createYear(params: {
    yearId: number;
    notes?: string;
    migrateFromYearId?: number | null;
    migrateWorkers?: boolean;
    migrateGroups?: boolean;
  }): Promise<void> {
    const normalized = normalizeYearInput({ id: params.yearId, notes: params.notes });
    normalized.isCurrent = true;

    await withTransaction(
      [STORE_YEARS, STORE_CONFIGS, STORE_GROUPS, STORE_GROUP_MEMBERS],
      'readwrite',
      async (tx) => {
        const yearsStore = tx.objectStore(STORE_YEARS);
        const configsStore = tx.objectStore(STORE_CONFIGS);
        const groupsStore = tx.objectStore(STORE_GROUPS);
        const membersStore = tx.objectStore(STORE_GROUP_MEMBERS);

        const existing = (await requestToPromise(yearsStore.get(normalized.id))) as HarvestYear | undefined;
        if (existing) {
          throw new Error(`L'anno ${normalized.id} esiste già nel database.`);
        }

        const allYears = (await requestToPromise(yearsStore.getAll())) as HarvestYear[];
        for (const y of allYears) {
          if (y.isCurrent) {
            await requestToPromise(yearsStore.put({ ...y, isCurrent: false }));
          }
        }
        await requestToPromise(yearsStore.add(normalized));

        if (params.migrateFromYearId != null) {
          if (params.migrateWorkers) {
            const prevConfigs = (await requestToPromise(
              configsStore.index('byYear').getAll(IDBKeyRange.only(params.migrateFromYearId)),
            )) as WorkerYearConfig[];
            for (const cfg of prevConfigs) {
              await requestToPromise(
                configsStore.put({
                  workerId: cfg.workerId,
                  harvestYearId: normalized.id,
                  hourlyRate: cfg.hourlyRate,
                  extraHourlyRate: cfg.extraHourlyRate,
                  holidayHourlyRate: cfg.holidayHourlyRate,
                }),
              );
            }
          }

          if (params.migrateGroups) {
            const prevGroups = (await requestToPromise(
              groupsStore.index('byYear').getAll(IDBKeyRange.only(params.migrateFromYearId)),
            )) as WorkerGroup[];
            for (const grp of prevGroups) {
              const newGroupId = (await requestToPromise(
                groupsStore.add({ name: grp.name, yearId: normalized.id }),
              )) as number;
              const prevMembers = (await requestToPromise(
                membersStore.index('byGroup').getAll(IDBKeyRange.only(grp.id)),
              )) as WorkerGroupMember[];
              for (const member of prevMembers) {
                await requestToPromise(
                  membersStore.put({ groupId: newGroupId, workerId: member.workerId }),
                );
              }
            }
          }
        }
      },
    );
    await this.recordMutation();
  }

  async selectYear(yearId: number): Promise<void> {
    await withTransaction(STORE_YEARS, 'readwrite', async (tx) => {
      const store = tx.objectStore(STORE_YEARS);
      const years = (await requestToPromise(store.getAll())) as HarvestYear[];
      if (!years.some((y) => y.id === yearId)) {
        throw new Error(`Annata ${yearId} non trovata.`);
      }
      for (const y of years) {
        const shouldBeCurrent = y.id === yearId;
        if (y.isCurrent !== shouldBeCurrent) {
          await requestToPromise(store.put({ ...y, isCurrent: shouldBeCurrent }));
        }
      }
    });
  }

  async deselectYear(): Promise<void> {
    await withTransaction(STORE_YEARS, 'readwrite', async (tx) => {
      const store = tx.objectStore(STORE_YEARS);
      const years = (await requestToPromise(store.getAll())) as HarvestYear[];
      for (const y of years) {
        if (y.isCurrent) {
          await requestToPromise(store.put({ ...y, isCurrent: false }));
        }
      }
    });
  }

  async deleteYear(yearId: number): Promise<void> {
    const key = Math.trunc(yearId);
    await withTransaction(
      [STORE_YEARS, STORE_CONFIGS, STORE_GROUPS, STORE_GROUP_MEMBERS, STORE_LOGS],
      'readwrite',
      async (tx) => {
        const yearsStore = tx.objectStore(STORE_YEARS);
        const configsStore = tx.objectStore(STORE_CONFIGS);
        const groupsStore = tx.objectStore(STORE_GROUPS);
        const membersStore = tx.objectStore(STORE_GROUP_MEMBERS);
        const logsStore = tx.objectStore(STORE_LOGS);

        const logs = (await requestToPromise(
          logsStore.index('byYear').getAll(IDBKeyRange.only(key)),
        )) as WorkLog[];
        for (const l of logs) {
          await requestToPromise(logsStore.delete(l.id));
        }

        const configs = (await requestToPromise(
          configsStore.index('byYear').getAll(IDBKeyRange.only(key)),
        )) as WorkerYearConfig[];
        for (const c of configs) {
          await requestToPromise(configsStore.delete([c.workerId, c.harvestYearId]));
        }

        const groups = (await requestToPromise(
          groupsStore.index('byYear').getAll(IDBKeyRange.only(key)),
        )) as WorkerGroup[];
        for (const g of groups) {
          const members = (await requestToPromise(
            membersStore.index('byGroup').getAll(IDBKeyRange.only(g.id)),
          )) as WorkerGroupMember[];
          for (const m of members) {
            await requestToPromise(membersStore.delete([m.groupId, m.workerId]));
          }
          await requestToPromise(groupsStore.delete(g.id));
        }

        await requestToPromise(yearsStore.delete(key));
      },
    );
    await this.recordMutation();
  }

  async getAllWorkers(): Promise<AppWorker[]> {
    return withTransaction(STORE_WORKERS, 'readonly', async (tx) => {
      const workers = (await requestToPromise(tx.objectStore(STORE_WORKERS).getAll())) as AppWorker[];
      return sortAppWorkers(workers);
    });
  }

  async getWorkersWithRateForYear(yearId: number): Promise<WorkerWithRate[]> {
    return withTransaction([STORE_WORKERS, STORE_CONFIGS], 'readonly', async (tx) => {
      const workers = (await requestToPromise(tx.objectStore(STORE_WORKERS).getAll())) as AppWorker[];
      const configs = (await requestToPromise(
        tx.objectStore(STORE_CONFIGS).index('byYear').getAll(IDBKeyRange.only(yearId)),
      )) as WorkerYearConfig[];

      const workerMap = new Map(workers.map((w) => [w.id, w]));
      const joined: WorkerWithRate[] = [];
      for (const cfg of configs) {
        const worker = workerMap.get(cfg.workerId);
        if (worker) {
          joined.push({
            ...worker,
            hourlyRate: cfg.hourlyRate,
            extraHourlyRate: cfg.extraHourlyRate,
            holidayHourlyRate: cfg.holidayHourlyRate,
          });
        }
      }
      return sortAppWorkers(joined);
    });
  }

  async addOrUpdateWorkerForYear(params: {
    workerId?: number;
    yearId: number;
    surname: string;
    name: string;
    phoneNumber: string;
    hourlyRate: number;
    extraHourlyRate: number;
    holidayHourlyRate: number;
  }): Promise<void> {
    const normalized = normalizeWorkerFields(params);
    const rate = round2(Math.max(0, params.hourlyRate));
    const extraRate = round2(Math.max(0, params.extraHourlyRate));
    const holidayRate = round2(Math.max(0, params.holidayHourlyRate));

    await withTransaction([STORE_WORKERS, STORE_CONFIGS], 'readwrite', async (tx) => {
      const workersStore = tx.objectStore(STORE_WORKERS);
      const configsStore = tx.objectStore(STORE_CONFIGS);

      const allWorkers = (await requestToPromise(workersStore.getAll())) as AppWorker[];
      const yearConfigs = (await requestToPromise(
        configsStore.index('byYear').getAll(IDBKeyRange.only(params.yearId)),
      )) as WorkerYearConfig[];
      const yearWorkerIds = new Set(yearConfigs.map((c) => c.workerId));

      const duplicateInYear = allWorkers.find(
        (w) =>
          yearWorkerIds.has(w.id) &&
          w.id !== params.workerId &&
          w.surname.toLocaleLowerCase('it') === normalized.surname.toLocaleLowerCase('it') &&
          w.name.toLocaleLowerCase('it') === normalized.name.toLocaleLowerCase('it'),
      );
      if (duplicateInYear) {
        throw new Error('Bracciante già presente (stesso nome e cognome).');
      }

      let targetWorkerId = params.workerId;

      if (targetWorkerId !== undefined) {
        const existing = (await requestToPromise(workersStore.get(targetWorkerId))) as AppWorker | undefined;
        if (!existing) {
          throw new Error('Bracciante non trovato.');
        }
        await requestToPromise(
          workersStore.put({
            ...existing,
            surname: normalized.surname,
            name: normalized.name,
            phoneNumber: normalized.phoneNumber,
          }),
        );
      } else {
        const existingGlobal = allWorkers.find(
          (w) =>
            w.surname.toLocaleLowerCase('it') === normalized.surname.toLocaleLowerCase('it') &&
            w.name.toLocaleLowerCase('it') === normalized.name.toLocaleLowerCase('it'),
        );
        if (existingGlobal) {
          targetWorkerId = existingGlobal.id;
          if (normalized.phoneNumber && existingGlobal.phoneNumber !== normalized.phoneNumber) {
            await requestToPromise(
              workersStore.put({ ...existingGlobal, phoneNumber: normalized.phoneNumber }),
            );
          }
        } else {
          targetWorkerId = (await requestToPromise(
            workersStore.add({
              name: normalized.name,
              surname: normalized.surname,
              phoneNumber: normalized.phoneNumber,
              isArchived: false,
            }),
          )) as number;
        }
      }

      await requestToPromise(
        configsStore.put({
          workerId: targetWorkerId,
          harvestYearId: params.yearId,
          hourlyRate: rate,
          extraHourlyRate: extraRate,
          holidayHourlyRate: holidayRate,
        }),
      );
    });
    await this.recordMutation();
  }

  async deleteWorker(workerId: number): Promise<void> {
    const key = Math.trunc(workerId);
    await withTransaction(
      [STORE_WORKERS, STORE_CONFIGS, STORE_GROUP_MEMBERS, STORE_LOGS],
      'readwrite',
      async (tx) => {
        const workersStore = tx.objectStore(STORE_WORKERS);
        const configsStore = tx.objectStore(STORE_CONFIGS);
        const membersStore = tx.objectStore(STORE_GROUP_MEMBERS);
        const logsStore = tx.objectStore(STORE_LOGS);

        const logs = (await requestToPromise(
          logsStore.index('byWorker').getAll(IDBKeyRange.only(key)),
        )) as WorkLog[];
        for (const log of logs) {
          await requestToPromise(logsStore.delete(log.id));
        }

        const configs = (await requestToPromise(
          configsStore.index('byWorker').getAll(IDBKeyRange.only(key)),
        )) as WorkerYearConfig[];
        for (const cfg of configs) {
          await requestToPromise(configsStore.delete([cfg.workerId, cfg.harvestYearId]));
        }

        const memberships = (await requestToPromise(
          membersStore.index('byWorker').getAll(IDBKeyRange.only(key)),
        )) as WorkerGroupMember[];
        for (const m of memberships) {
          await requestToPromise(membersStore.delete([m.groupId, m.workerId]));
        }

        await requestToPromise(workersStore.delete(key));
      },
    );
    await this.recordMutation();
  }

  /** Merges duplicate worker profiles according to Rule R6 (lowest ID is target). */
  async mergeDuplicateGroup(workerIds: number[]): Promise<void> {
    if (workerIds.length < 2) {
      return;
    }
    const sorted = [...workerIds].sort((a, b) => a - b);
    const targetId = sorted[0];
    const sourceIds = sorted.slice(1);

    await withTransaction(
      [STORE_WORKERS, STORE_CONFIGS, STORE_GROUP_MEMBERS, STORE_LOGS],
      'readwrite',
      async (tx) => {
        const workersStore = tx.objectStore(STORE_WORKERS);
        const configsStore = tx.objectStore(STORE_CONFIGS);
        const membersStore = tx.objectStore(STORE_GROUP_MEMBERS);
        const logsStore = tx.objectStore(STORE_LOGS);

        const targetConfigs = (await requestToPromise(
          configsStore.index('byWorker').getAll(IDBKeyRange.only(targetId)),
        )) as WorkerYearConfig[];
        const targetYears = new Set(targetConfigs.map((c) => c.harvestYearId));

        for (const sourceId of sourceIds) {
          const sourceLogs = (await requestToPromise(
            logsStore.index('byWorker').getAll(IDBKeyRange.only(sourceId)),
          )) as WorkLog[];
          for (const log of sourceLogs) {
            await requestToPromise(logsStore.put({ ...log, workerId: targetId }));
          }

          const sourceMemberships = (await requestToPromise(
            membersStore.index('byWorker').getAll(IDBKeyRange.only(sourceId)),
          )) as WorkerGroupMember[];
          for (const m of sourceMemberships) {
            await requestToPromise(membersStore.delete([m.groupId, m.workerId]));
            await requestToPromise(membersStore.put({ groupId: m.groupId, workerId: targetId }));
          }

          const sourceConfigs = (await requestToPromise(
            configsStore.index('byWorker').getAll(IDBKeyRange.only(sourceId)),
          )) as WorkerYearConfig[];
          for (const cfg of sourceConfigs) {
            await requestToPromise(configsStore.delete([cfg.workerId, cfg.harvestYearId]));
            if (!targetYears.has(cfg.harvestYearId)) {
              targetYears.add(cfg.harvestYearId);
              await requestToPromise(configsStore.put({ ...cfg, workerId: targetId }));
            }
          }

          await requestToPromise(workersStore.delete(sourceId));
        }
      },
    );
    await this.recordMutation();
  }

  async copyWorkersFromPreviousYear(yearId: number): Promise<number> {
    const prevYearId = yearId - 1;
    return withTransaction(STORE_CONFIGS, 'readwrite', async (tx) => {
      const store = tx.objectStore(STORE_CONFIGS);
      const prevConfigs = (await requestToPromise(
        store.index('byYear').getAll(IDBKeyRange.only(prevYearId)),
      )) as WorkerYearConfig[];
      const curConfigs = (await requestToPromise(
        store.index('byYear').getAll(IDBKeyRange.only(yearId)),
      )) as WorkerYearConfig[];
      const existingWorkerIds = new Set(curConfigs.map((c) => c.workerId));
      const missing = prevConfigs.filter((c) => !existingWorkerIds.has(c.workerId));

      for (const cfg of missing) {
        await requestToPromise(
          store.put({
            workerId: cfg.workerId,
            harvestYearId: yearId,
            hourlyRate: cfg.hourlyRate,
            extraHourlyRate: cfg.extraHourlyRate,
            holidayHourlyRate: cfg.holidayHourlyRate,
          }),
        );
      }
      return missing.length;
    });
  }

  async getGroupsWithMembersForYear(
    yearId: number,
  ): Promise<Array<{ group: WorkerGroup; members: AppWorker[] }>> {
    return withTransaction([STORE_GROUPS, STORE_GROUP_MEMBERS, STORE_WORKERS], 'readonly', async (tx) => {
      const groups = (await requestToPromise(
        tx.objectStore(STORE_GROUPS).index('byYear').getAll(IDBKeyRange.only(yearId)),
      )) as WorkerGroup[];
      const allMembers = (await requestToPromise(
        tx.objectStore(STORE_GROUP_MEMBERS).getAll(),
      )) as WorkerGroupMember[];
      const workers = (await requestToPromise(tx.objectStore(STORE_WORKERS).getAll())) as AppWorker[];
      const workerMap = new Map(workers.map((w) => [w.id, w]));

      return groups
        .sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }))
        .map((group) => {
          const memberWorkers = allMembers
            .filter((m) => m.groupId === group.id)
            .map((m) => workerMap.get(m.workerId))
            .filter((w): w is AppWorker => Boolean(w));
          return {
            group,
            members: sortAppWorkers(memberWorkers),
          };
        });
    });
  }

  async createGroup(name: string, yearId: number): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Inserisci un nome per il gruppo.');
    }
    await withTransaction(STORE_GROUPS, 'readwrite', async (tx) => {
      const store = tx.objectStore(STORE_GROUPS);
      const existing = (await requestToPromise(
        store.index('byYear').getAll(IDBKeyRange.only(yearId)),
      )) as WorkerGroup[];
      if (existing.some((g) => g.name.toLocaleLowerCase('it') === trimmed.toLocaleLowerCase('it'))) {
        throw new Error(`Esiste già un gruppo chiamato "${trimmed}".`);
      }
      await requestToPromise(store.add({ name: trimmed, yearId }));
    });
    await this.recordMutation();
  }

  async deleteGroup(groupId: number): Promise<void> {
    await withTransaction([STORE_GROUPS, STORE_GROUP_MEMBERS], 'readwrite', async (tx) => {
      const groupsStore = tx.objectStore(STORE_GROUPS);
      const membersStore = tx.objectStore(STORE_GROUP_MEMBERS);
      const members = (await requestToPromise(
        membersStore.index('byGroup').getAll(IDBKeyRange.only(groupId)),
      )) as WorkerGroupMember[];
      for (const m of members) {
        await requestToPromise(membersStore.delete([m.groupId, m.workerId]));
      }
      await requestToPromise(groupsStore.delete(groupId));
    });
    await this.recordMutation();
  }

  async setGroupMember(groupId: number, workerId: number, isMember: boolean): Promise<void> {
    await withTransaction(STORE_GROUP_MEMBERS, 'readwrite', async (tx) => {
      const store = tx.objectStore(STORE_GROUP_MEMBERS);
      if (isMember) {
        await requestToPromise(store.put({ groupId, workerId }));
      } else {
        await requestToPromise(store.delete([groupId, workerId]));
      }
    });
    await this.recordMutation();
  }

  async copyGroupsFromPreviousYear(yearId: number): Promise<number> {
    const prevYearId = yearId - 1;
    const copied = await withTransaction([STORE_GROUPS, STORE_GROUP_MEMBERS], 'readwrite', async (tx) => {
      const groupsStore = tx.objectStore(STORE_GROUPS);
      const membersStore = tx.objectStore(STORE_GROUP_MEMBERS);

      const prevGroups = (await requestToPromise(
        groupsStore.index('byYear').getAll(IDBKeyRange.only(prevYearId)),
      )) as WorkerGroup[];
      const curGroups = (await requestToPromise(
        groupsStore.index('byYear').getAll(IDBKeyRange.only(yearId)),
      )) as WorkerGroup[];
      const curNames = new Set(curGroups.map((g) => g.name.toLocaleLowerCase('it')));

      let count = 0;
      for (const oldGroup of prevGroups) {
        if (!curNames.has(oldGroup.name.toLocaleLowerCase('it'))) {
          const newGroupId = (await requestToPromise(
            groupsStore.add({ name: oldGroup.name, yearId }),
          )) as number;
          const oldMembers = (await requestToPromise(
            membersStore.index('byGroup').getAll(IDBKeyRange.only(oldGroup.id)),
          )) as WorkerGroupMember[];
          for (const member of oldMembers) {
            await requestToPromise(membersStore.put({ groupId: newGroupId, workerId: member.workerId }));
          }
          count += 1;
        }
      }
      return count;
    });
    if (copied > 0) {
      await this.recordMutation();
    }
    return copied;
  }

  async getLogsForYear(yearId: number): Promise<WorkLog[]> {
    return withTransaction(STORE_LOGS, 'readonly', async (tx) => {
      const list = (await requestToPromise(
        tx.objectStore(STORE_LOGS).index('byYear').getAll(IDBKeyRange.only(yearId)),
      )) as WorkLog[];
      return sortLogsByDateDesc(list);
    });
  }

  async saveWorkLog(params: {
    id?: number;
    workerId: number;
    yearId: number;
    date: number;
    morningStart: string | null;
    morningEnd: string | null;
    afternoonStart: string | null;
    afternoonEnd: string | null;
  }): Promise<{ rateChangedFrom?: number; rateChangedTo?: number }> {
    const settings = await this.getSettings();
    let rateChangedFrom: number | undefined;
    let rateChangedTo: number | undefined;

    await withTransaction([STORE_LOGS, STORE_CONFIGS], 'readwrite', async (tx) => {
      const logsStore = tx.objectStore(STORE_LOGS);
      const configsStore = tx.objectStore(STORE_CONFIGS);

      const config = (await requestToPromise(
        configsStore.get([params.workerId, params.yearId]),
      )) as WorkerYearConfig | undefined;

      const hourlyRate = config?.hourlyRate ?? 0;
      const extraHourlyRate = config?.extraHourlyRate ?? 0;
      const holidayHourlyRate = config?.holidayHourlyRate ?? 0;

      const existing = params.id
        ? ((await requestToPromise(logsStore.get(params.id))) as WorkLog | undefined)
        : undefined;

      if (existing && existing.hourlyRate !== 0 && existing.hourlyRate !== hourlyRate) {
        rateChangedFrom = existing.hourlyRate;
        rateChangedTo = hourlyRate;
      }

      const draft = computeWorkLogFromShifts({
        workerId: params.workerId,
        harvestYearId: params.yearId,
        date: params.date,
        morningStart: params.morningStart,
        morningEnd: params.morningEnd,
        afternoonStart: params.afternoonStart,
        afternoonEnd: params.afternoonEnd,
        hourlyRate,
        extraHourlyRate,
        holidayHourlyRate,
        isManualHoliday: existing?.isManualHoliday ?? false,
        settings,
      });

      if (existing) {
        await requestToPromise(logsStore.put({ ...draft, id: existing.id }));
      } else {
        await requestToPromise(logsStore.add(draft));
      }
    });

    await this.incrementSaveCount();
    return { rateChangedFrom, rateChangedTo };
  }

  async saveWorkLogRange(params: {
    workerIds: number[];
    yearId: number;
    startDate: number;
    endDate: number;
    morningStart: string | null;
    morningEnd: string | null;
    afternoonStart: string | null;
    afternoonEnd: string | null;
  }): Promise<number> {
    const settings = await this.getSettings();
    let count = 0;

    await withTransaction([STORE_LOGS, STORE_CONFIGS], 'readwrite', async (tx) => {
      const logsStore = tx.objectStore(STORE_LOGS);
      const configsStore = tx.objectStore(STORE_CONFIGS);

      const existingYearLogs = (await requestToPromise(
        logsStore.index('byYear').getAll(IDBKeyRange.only(params.yearId)),
      )) as WorkLog[];

      const configMap = new Map<number, WorkerYearConfig>();
      for (const workerId of params.workerIds) {
        const cfg = (await requestToPromise(
          configsStore.get([workerId, params.yearId]),
        )) as WorkerYearConfig | undefined;
        if (cfg) {
          configMap.set(workerId, cfg);
        }
      }

      const cur = new Date(params.startDate);
      const end = new Date(params.endDate);
      const cursor = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate());
      const endMillis = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();

      while (cursor.getTime() <= endMillis) {
        const cursorMillis = cursor.getTime();
        for (const workerId of params.workerIds) {
          const cfg = configMap.get(workerId);
          const existing = existingYearLogs.find(
            (l) => l.workerId === workerId && l.date === cursorMillis,
          );

          const draft = computeWorkLogFromShifts({
            workerId,
            harvestYearId: params.yearId,
            date: cursorMillis,
            morningStart: params.morningStart,
            morningEnd: params.morningEnd,
            afternoonStart: params.afternoonStart,
            afternoonEnd: params.afternoonEnd,
            hourlyRate: cfg?.hourlyRate ?? 0,
            extraHourlyRate: cfg?.extraHourlyRate ?? 0,
            holidayHourlyRate: cfg?.holidayHourlyRate ?? 0,
            isManualHoliday: existing?.isManualHoliday ?? false,
            settings,
          });

          if (existing) {
            await requestToPromise(logsStore.put({ ...draft, id: existing.id }));
          } else {
            await requestToPromise(logsStore.add(draft));
          }
          count += 1;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    await this.incrementSaveCount();
    return count;
  }

  async deleteWorkLog(logId: number): Promise<void> {
    await withTransaction(STORE_LOGS, 'readwrite', async (tx) => {
      await requestToPromise(tx.objectStore(STORE_LOGS).delete(logId));
    });
    await this.recordMutation();
  }

  async toggleManualHolidayForLog(logId: number): Promise<WorkLog> {
    const settings = await this.getSettings();
    const updated = await withTransaction(STORE_LOGS, 'readwrite', async (tx) => {
      const store = tx.objectStore(STORE_LOGS);
      const existing = (await requestToPromise(store.get(logId))) as WorkLog | undefined;
      if (!existing) {
        throw new Error('Registrazione non trovata.');
      }
      const recalculated = recalculateWorkLog(
        { ...existing, isManualHoliday: !existing.isManualHoliday },
        settings,
      );
      await requestToPromise(store.put(recalculated));
      return recalculated;
    });
    await this.recordMutation();
    return updated;
  }

  async toggleGlobalHolidayForDate(
    dateMillis: number,
    yearId: number,
  ): Promise<{ isOverridden: boolean; affectedCount: number }> {
    const settings = await this.getSettings();
    const globalSet = new Set(settings.globalFestiveDates);
    const wasOverridden = globalSet.has(dateMillis);

    if (wasOverridden) {
      globalSet.delete(dateMillis);
    } else {
      globalSet.add(dateMillis);
    }

    const updatedSettings = await this.saveSettings({
      globalFestiveDates: [...globalSet],
    });

    const targetManualState = !wasOverridden;
    const affectedCount = await withTransaction(STORE_LOGS, 'readwrite', async (tx) => {
      const store = tx.objectStore(STORE_LOGS);
      const logsForDay = (await requestToPromise(
        store.index('byYearDate').getAll(IDBKeyRange.only([yearId, dateMillis])),
      )) as WorkLog[];
      for (const log of logsForDay) {
        const updated = recalculateWorkLog(
          { ...log, isManualHoliday: targetManualState },
          updatedSettings,
        );
        await requestToPromise(store.put(updated));
      }
      return logsForDay.length;
    });

    return { isOverridden: targetManualState, affectedCount };
  }

  async exportFullBackup(saveInHistory = true): Promise<{
    filename: string;
    csvContent: string;
    exportDate: Date;
    headerDate: string;
  }> {
    const exportDate = new Date();
    const dataset = await this.readFullDataset();
    const csvContent = exportAndroidBackupCsv(dataset, exportDate);
    const headerDate = formatBackupHeaderDate(exportDate);
    const filename = DRIVE_BACKUP_FILE_NAME;

    if (saveInHistory) {
      await withTransaction([STORE_BACKUPS, STORE_SETTINGS], 'readwrite', async (tx) => {
        await requestToPromise(
          tx.objectStore(STORE_BACKUPS).add({
            filename,
            createdAt: exportDate.getTime(),
            csvContent,
          }),
        );
        const settingsStore = tx.objectStore(STORE_SETTINGS);
        const stored = (await requestToPromise(settingsStore.get(SETTINGS_KEY))) as
          | ({ key: string } & Partial<OwnerSettings>)
          | undefined;
        const merged = normalizeSettings({
          ...stored,
          saveCountSinceBackup: 0,
          lastExportDate: exportDate.getTime(),
          lastImportDate: headerDate,
          lastMutationDate: 0,
        });
        await requestToPromise(settingsStore.put({ key: SETTINGS_KEY, ...merged }));
      });
    }

    return { filename, csvContent, exportDate, headerDate };
  }

  async importFullBackup(
    csvText: string,
  ): Promise<{ years: number; workers: number; logs: number; groups: number; importDate: string }> {
    const parsed = importFullBackupCsv(csvText);
    const importDate = parsed.backupHeaderDate ?? formatBackupHeaderDate(new Date());

    // Create an automatic safety backup if existing data is present.
    const existingYears = await this.getAllYears();
    if (existingYears.length > 0) {
      const autoBkp = await this.readFullDataset();
      const autoCsv = exportAndroidBackupCsv(autoBkp);
      await withTransaction(STORE_BACKUPS, 'readwrite', async (tx) => {
        await requestToPromise(
          tx.objectStore(STORE_BACKUPS).add({
            filename: `GestBraccianti_AutoBkp_${formatBackupTimestamp(new Date())}.csv`,
            createdAt: Date.now(),
            csvContent: autoCsv,
          }),
        );
      });
    }

    const currentSettings = await this.getSettings();

    await withTransaction(
      [
        STORE_SETTINGS,
        STORE_YEARS,
        STORE_WORKERS,
        STORE_CONFIGS,
        STORE_GROUPS,
        STORE_GROUP_MEMBERS,
        STORE_PLANTATIONS,
        STORE_LOGS,
      ],
      'readwrite',
      async (tx) => {
        const stores = [
          STORE_YEARS,
          STORE_WORKERS,
          STORE_CONFIGS,
          STORE_GROUPS,
          STORE_GROUP_MEMBERS,
          STORE_PLANTATIONS,
          STORE_LOGS,
        ];
        for (const name of stores) {
          await requestToPromise(tx.objectStore(name).clear());
        }

        const settingsStore = tx.objectStore(STORE_SETTINGS);
        await requestToPromise(
          settingsStore.put({
            key: SETTINGS_KEY,
            ...normalizeSettings({
              ...parsed.settings,
              googleDriveClientId: currentSettings.googleDriveClientId,
              saveCountSinceBackup: 0,
              lastImportDate: importDate,
              lastExportDate: Date.now(),
              lastMutationDate: 0,
            }),
          }),
        );

        for (const y of parsed.years) {
          await requestToPromise(tx.objectStore(STORE_YEARS).put(y));
        }
        for (const w of parsed.workers) {
          await requestToPromise(
            tx.objectStore(STORE_WORKERS).put({
              ...w,
              name: capitalizeWords(w.name),
              surname: capitalizeWords(w.surname),
            }),
          );
        }
        for (const c of parsed.configs) {
          await requestToPromise(tx.objectStore(STORE_CONFIGS).put(c));
        }
        for (const g of parsed.groups) {
          await requestToPromise(tx.objectStore(STORE_GROUPS).put(g));
        }
        for (const m of parsed.groupMembers) {
          await requestToPromise(tx.objectStore(STORE_GROUP_MEMBERS).put(m));
        }
        for (const p of parsed.plantations) {
          await requestToPromise(tx.objectStore(STORE_PLANTATIONS).put(p));
        }
        for (const l of parsed.logs) {
          await requestToPromise(tx.objectStore(STORE_LOGS).put(l));
        }
      },
    );

    return {
      years: parsed.years.length,
      workers: parsed.workers.length,
      logs: parsed.logs.length,
      groups: parsed.groups.length,
      importDate,
    };
  }

  async getBackupHistory(): Promise<BackupHistoryItem[]> {
    return withTransaction(STORE_BACKUPS, 'readonly', async (tx) => {
      const items = (await requestToPromise(tx.objectStore(STORE_BACKUPS).getAll())) as BackupHistoryItem[];
      return [...items].sort((a, b) => b.createdAt - a.createdAt);
    });
  }

  async deleteBackupHistoryItem(id: number): Promise<void> {
    await withTransaction(STORE_BACKUPS, 'readwrite', async (tx) => {
      await requestToPromise(tx.objectStore(STORE_BACKUPS).delete(id));
    });
  }

  async clearAllDatabase(): Promise<void> {
    await withTransaction(
      [
        STORE_YEARS,
        STORE_WORKERS,
        STORE_CONFIGS,
        STORE_GROUPS,
        STORE_GROUP_MEMBERS,
        STORE_PLANTATIONS,
        STORE_LOGS,
        STORE_SETTINGS,
      ],
      'readwrite',
      async (tx) => {
        for (const name of [
          STORE_YEARS,
          STORE_WORKERS,
          STORE_CONFIGS,
          STORE_GROUPS,
          STORE_GROUP_MEMBERS,
          STORE_PLANTATIONS,
          STORE_LOGS,
        ]) {
          await requestToPromise(tx.objectStore(name).clear());
        }
        await requestToPromise(
          tx.objectStore(STORE_SETTINGS).put({ key: SETTINGS_KEY, ...DEFAULT_OWNER_SETTINGS }),
        );
      },
    );
  }

  private async readFullDataset(): Promise<FullBackupDataset> {
    return withTransaction(
      [
        STORE_SETTINGS,
        STORE_YEARS,
        STORE_WORKERS,
        STORE_CONFIGS,
        STORE_GROUPS,
        STORE_GROUP_MEMBERS,
        STORE_PLANTATIONS,
        STORE_LOGS,
      ],
      'readonly',
      async (tx) => {
        const [
          rawSettings,
          years,
          workers,
          configs,
          groups,
          groupMembers,
          plantations,
          logs,
        ] = await Promise.all([
          requestToPromise(tx.objectStore(STORE_SETTINGS).get(SETTINGS_KEY)) as Promise<
            ({ key: string } & Partial<OwnerSettings>) | undefined
          >,
          requestToPromise(tx.objectStore(STORE_YEARS).getAll()) as Promise<HarvestYear[]>,
          requestToPromise(tx.objectStore(STORE_WORKERS).getAll()) as Promise<AppWorker[]>,
          requestToPromise(tx.objectStore(STORE_CONFIGS).getAll()) as Promise<WorkerYearConfig[]>,
          requestToPromise(tx.objectStore(STORE_GROUPS).getAll()) as Promise<WorkerGroup[]>,
          requestToPromise(tx.objectStore(STORE_GROUP_MEMBERS).getAll()) as Promise<WorkerGroupMember[]>,
          requestToPromise(tx.objectStore(STORE_PLANTATIONS).getAll()) as Promise<Plantation[]>,
          requestToPromise(tx.objectStore(STORE_LOGS).getAll()) as Promise<WorkLog[]>,
        ]);

        return {
          settings: normalizeSettings(rawSettings),
          years: sortYearsDesc(years),
          workers: sortAppWorkers(workers),
          configs,
          groups,
          groupMembers,
          plantations,
          logs: sortLogsByDateDesc(logs),
        };
      },
    );
  }
}
