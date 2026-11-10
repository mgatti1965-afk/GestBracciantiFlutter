import { normalizeWorkerInput, sortWorkers, type Worker } from '../domain/worker';

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
        const store = db.createObjectStore(STORE_WORKERS, { keyPath: 'id', autoIncrement: true });
        store.createIndex('byYear', 'harvestYearId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_LOGS)) {
        const logs = db.createObjectStore(STORE_LOGS, { keyPath: 'id', autoIncrement: true });
        logs.createIndex('byYear', 'harvestYearId', { unique: false });
        logs.createIndex('byWorker', 'workerId', { unique: false });
        logs.createIndex('byYearDate', ['harvestYearId', 'date'], { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Errore apertura IndexedDB workers'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Errore operazione IndexedDB workers'));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  return openDb().then((db) => {
    const tx = db.transaction(STORE_WORKERS, mode);
    const store = tx.objectStore(STORE_WORKERS);

    return handler(store).finally(() => {
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
      tx.onabort = () => db.close();
    });
  });
}

export class WorkerRepository {
  async getForYear(yearId: number): Promise<Worker[]> {
    return withStore('readonly', async (store) => {
      const index = store.index('byYear');
      const list = (await requestToPromise(index.getAll(IDBKeyRange.only(yearId)))) as Worker[];
      return sortWorkers(list);
    });
  }

  async createForYear(params: {
    yearId: number;
    name: string;
    surname: string;
    phoneNumber?: string;
  }): Promise<void> {
    const worker = normalizeWorkerInput({
      harvestYearId: params.yearId,
      name: params.name,
      surname: params.surname,
      phoneNumber: params.phoneNumber,
    });

    await withStore('readwrite', async (store) => {
      const index = store.index('byYear');
      const current = (await requestToPromise(index.getAll(IDBKeyRange.only(worker.harvestYearId)))) as Worker[];
      const duplicate = current.find(
        (w) =>
          w.name.toLocaleLowerCase('it') === worker.name.toLocaleLowerCase('it') &&
          w.surname.toLocaleLowerCase('it') === worker.surname.toLocaleLowerCase('it'),
      );

      if (duplicate) {
        throw new Error(`Bracciante duplicato: ${worker.surname} ${worker.name}.`);
      }

      await requestToPromise(store.add(worker));
    });
  }

  async getById(workerId: number): Promise<Worker | undefined> {
    return withStore('readonly', async (store) => {
      const worker = (await requestToPromise(store.get(Math.trunc(workerId)))) as Worker | undefined;
      return worker;
    });
  }

  async update(params: {
    id: number;
    yearId: number;
    name: string;
    surname: string;
    phoneNumber?: string;
    isArchived: boolean;
  }): Promise<void> {
    const id = Math.trunc(params.id);
    const normalized = normalizeWorkerInput({
      harvestYearId: params.yearId,
      name: params.name,
      surname: params.surname,
      phoneNumber: params.phoneNumber,
    });

    await withStore('readwrite', async (store) => {
      const existing = (await requestToPromise(store.get(id))) as Worker | undefined;
      if (!existing) {
        throw new Error('Bracciante non trovato.');
      }

      const index = store.index('byYear');
      const current = (await requestToPromise(index.getAll(IDBKeyRange.only(normalized.harvestYearId)))) as Worker[];
      const duplicate = current.find(
        (w) =>
          w.id !== id &&
          w.name.toLocaleLowerCase('it') === normalized.name.toLocaleLowerCase('it') &&
          w.surname.toLocaleLowerCase('it') === normalized.surname.toLocaleLowerCase('it'),
      );

      if (duplicate) {
        throw new Error(`Bracciante duplicato: ${normalized.surname} ${normalized.name}.`);
      }

      await requestToPromise(
        store.put({
          id,
          ...normalized,
          isArchived: params.isArchived,
        }),
      );
    });
  }

  async remove(workerId: number): Promise<void> {
    await withStore('readwrite', async (store) => {
      const key = Math.trunc(workerId);
      const existing = (await requestToPromise(store.get(key))) as Worker | undefined;
      if (!existing) {
        throw new Error('Bracciante non trovato.');
      }

      await requestToPromise(store.delete(key));
    });
  }

  async removeAllForYear(yearId: number): Promise<number> {
    return withStore('readwrite', async (store) => {
      const index = store.index('byYear');
      const workers = (await requestToPromise(index.getAll(IDBKeyRange.only(Math.trunc(yearId))))) as Worker[];
      for (const worker of workers) {
        await requestToPromise(store.delete(worker.id));
      }
      return workers.length;
    });
  }

  async getActiveForYear(yearId: number): Promise<Worker[]> {
    const all = await this.getForYear(yearId);
    return all.filter((w) => !w.isArchived);
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

  async setArchived(workerId: number, archived: boolean): Promise<void> {
    await withStore('readwrite', async (store) => {
      const worker = (await requestToPromise(store.get(workerId))) as Worker | undefined;
      if (!worker) {
        throw new Error('Bracciante non trovato.');
      }
      worker.isArchived = archived;
      await requestToPromise(store.put(worker));
    });
  }
}
