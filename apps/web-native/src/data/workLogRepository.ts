import { createWorkLogDraft, sortLogsByDateDesc, type WorkLog } from '../domain/workLog';

const DB_NAME = 'gestbraccianti-web-native';
const DB_VERSION = 3;
const STORE_YEARS = 'harvestYears';
const STORE_WORKERS = 'workers';
const STORE_LOGS = 'workLogs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_YEARS)) {
        db.createObjectStore(STORE_YEARS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_WORKERS)) {
        const workers = db.createObjectStore(STORE_WORKERS, { keyPath: 'id', autoIncrement: true });
        workers.createIndex('byYear', 'harvestYearId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_LOGS)) {
        const logs = db.createObjectStore(STORE_LOGS, { keyPath: 'id', autoIncrement: true });
        logs.createIndex('byYear', 'harvestYearId', { unique: false });
        logs.createIndex('byWorker', 'workerId', { unique: false });
        logs.createIndex('byYearDate', ['harvestYearId', 'date'], { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Errore apertura IndexedDB work logs'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Errore operazione IndexedDB work logs'));
  });
}

function withStore<T>(mode: IDBTransactionMode, handler: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  return openDb().then((db) => {
    const tx = db.transaction(STORE_LOGS, mode);
    const store = tx.objectStore(STORE_LOGS);

    return handler(store).finally(() => {
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
      tx.onabort = () => db.close();
    });
  });
}

export class WorkLogRepository {
  async getForYear(yearId: number): Promise<WorkLog[]> {
    return withStore('readonly', async (store) => {
      const index = store.index('byYear');
      const list = (await requestToPromise(index.getAll(IDBKeyRange.only(yearId)))) as WorkLog[];
      return sortLogsByDateDesc(list);
    });
  }

  async create(params: {
    workerId: number;
    harvestYearId: number;
    dateIso: string;
    totalHours: number;
    isManualHoliday: boolean;
    extraThreshold: number;
    hourlyRate: number;
    extraHourlyRate: number;
    holidayHourlyRate: number;
  }): Promise<void> {
    const draft = createWorkLogDraft(params);

    await withStore('readwrite', async (store) => {
      await requestToPromise(store.add(draft));
    });
  }

  async getById(id: number): Promise<WorkLog | undefined> {
    return withStore('readonly', async (store) => {
      const record = (await requestToPromise(store.get(Math.trunc(id)))) as WorkLog | undefined;
      return record;
    });
  }

  async hasAnyForWorker(workerId: number): Promise<boolean> {
    return withStore('readonly', async (store) => {
      const index = store.index('byWorker');
      const count = (await requestToPromise(index.count(IDBKeyRange.only(Math.trunc(workerId))))) as number;
      return count > 0;
    });
  }

  async hasAnyForYear(yearId: number): Promise<boolean> {
    const count = await this.countForYear(yearId);
    return count > 0;
  }

  async countForYear(yearId: number): Promise<number> {
    return withStore('readonly', async (store) => {
      const index = store.index('byYear');
      const count = (await requestToPromise(index.count(IDBKeyRange.only(Math.trunc(yearId))))) as number;
      return count;
    });
  }

  async update(params: {
    id: number;
    workerId: number;
    harvestYearId: number;
    dateIso: string;
    totalHours: number;
    isManualHoliday: boolean;
    extraThreshold: number;
    hourlyRate: number;
    extraHourlyRate: number;
    holidayHourlyRate: number;
  }): Promise<void> {
    const id = Math.trunc(params.id);
    const draft = createWorkLogDraft(params);

    await withStore('readwrite', async (store) => {
      const existing = (await requestToPromise(store.get(id))) as WorkLog | undefined;
      if (!existing) {
        throw new Error('Log non trovato.');
      }

      await requestToPromise(
        store.put({
          ...draft,
          id,
        }),
      );
    });
  }

  async remove(id: number): Promise<void> {
    await withStore('readwrite', async (store) => {
      const key = Math.trunc(id);
      const existing = (await requestToPromise(store.get(key))) as WorkLog | undefined;
      if (!existing) {
        throw new Error('Log non trovato.');
      }
      await requestToPromise(store.delete(key));
    });
  }

  async removeAllForYear(yearId: number): Promise<number> {
    return withStore('readwrite', async (store) => {
      const index = store.index('byYear');
      const logs = (await requestToPromise(index.getAll(IDBKeyRange.only(Math.trunc(yearId))))) as WorkLog[];
      for (const log of logs) {
        await requestToPromise(store.delete(log.id));
      }
      return logs.length;
    });
  }
}
