export const DB_NAME = 'gestbraccianti-web-native';
export const DB_VERSION = 4;

export const STORE_YEARS = 'harvestYears';
export const STORE_WORKERS = 'workers';
export const STORE_CONFIGS = 'workerYearConfigs';
export const STORE_GROUPS = 'workerGroups';
export const STORE_GROUP_MEMBERS = 'workerGroupMembers';
export const STORE_PLANTATIONS = 'plantations';
export const STORE_LOGS = 'workLogs';
export const STORE_SETTINGS = 'settings';
export const STORE_BACKUPS = 'backups';

/** Opens IndexedDB and creates/migrates stores up to DB_VERSION 4. */
export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;
      const oldVersion = event.oldVersion;

      if (!db.objectStoreNames.contains(STORE_YEARS)) {
        db.createObjectStore(STORE_YEARS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_WORKERS)) {
        db.createObjectStore(STORE_WORKERS, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_CONFIGS)) {
        const configs = db.createObjectStore(STORE_CONFIGS, { keyPath: ['workerId', 'harvestYearId'] });
        configs.createIndex('byYear', 'harvestYearId', { unique: false });
        configs.createIndex('byWorker', 'workerId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_GROUPS)) {
        const groups = db.createObjectStore(STORE_GROUPS, { keyPath: 'id', autoIncrement: true });
        groups.createIndex('byYear', 'yearId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_GROUP_MEMBERS)) {
        const members = db.createObjectStore(STORE_GROUP_MEMBERS, { keyPath: ['groupId', 'workerId'] });
        members.createIndex('byGroup', 'groupId', { unique: false });
        members.createIndex('byWorker', 'workerId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PLANTATIONS)) {
        db.createObjectStore(STORE_PLANTATIONS, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_LOGS)) {
        const logs = db.createObjectStore(STORE_LOGS, { keyPath: 'id', autoIncrement: true });
        logs.createIndex('byYear', 'harvestYearId', { unique: false });
        logs.createIndex('byWorker', 'workerId', { unique: false });
        logs.createIndex('byYearDate', ['harvestYearId', 'date'], { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_BACKUPS)) {
        db.createObjectStore(STORE_BACKUPS, { keyPath: 'id', autoIncrement: true });
      }

      // Migrate v1-v3 per-year workers into global workers + workerYearConfigs.
      if (oldVersion > 0 && oldVersion < 4 && tx) {
        const workersStore = tx.objectStore(STORE_WORKERS);
        if (workersStore.indexNames.contains('byYear')) {
          workersStore.deleteIndex('byYear');
        }
        const configsStore = tx.objectStore(STORE_CONFIGS);
        const logsStore = tx.objectStore(STORE_LOGS);

        const logsReq = logsStore.getAll();
        logsReq.onsuccess = () => {
          const allLogs = (logsReq.result ?? []) as Array<{
            workerId: number;
            harvestYearId: number;
            hourlyRate?: number;
            extraHourlyRate?: number;
            holidayHourlyRate?: number;
          }>;
          const cursorReq = workersStore.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor) {
              return;
            }
            const raw = cursor.value as {
              id: number;
              harvestYearId?: number;
              name: string;
              surname: string;
              phoneNumber: string;
              isArchived: boolean;
            };
            if (typeof raw.harvestYearId === 'number' && raw.harvestYearId >= 2000) {
              const matchingLog = allLogs.find(
                (l) => l.workerId === raw.id && l.harvestYearId === raw.harvestYearId,
              );
              configsStore.put({
                workerId: raw.id,
                harvestYearId: raw.harvestYearId,
                hourlyRate: matchingLog?.hourlyRate ?? 0,
                extraHourlyRate: matchingLog?.extraHourlyRate ?? 0,
                holidayHourlyRate: matchingLog?.holidayHourlyRate ?? 0,
              });
              cursor.update({
                id: raw.id,
                name: raw.name,
                surname: raw.surname,
                phoneNumber: raw.phoneNumber ?? '',
                isArchived: Boolean(raw.isArchived),
              });
            }
            cursor.continue();
          };
        };
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Errore apertura IndexedDB'));
  });
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Errore operazione IndexedDB'));
  });
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Transazione IndexedDB fallita'));
    tx.onabort = () => reject(tx.error ?? new Error('Transazione IndexedDB annullata'));
  });
}

export async function withTransaction<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  handler: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(storeNames, mode);
    const completion = txDone(tx);
    let result: T;
    try {
      result = await handler(tx);
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // Transaction may already be finished or aborted.
      }
      await completion.catch(() => {});
      throw error;
    }
    await completion;
    return result;
  } finally {
    db.close();
  }
}
