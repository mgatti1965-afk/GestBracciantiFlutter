import {
  ensureSingleCurrent,
  normalizeYearInput,
  sortYearsDesc,
  type HarvestYear,
} from '../domain/harvestYear';

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
    request.onerror = () => reject(request.error ?? new Error('Errore apertura IndexedDB'));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  return openDb().then((db) => {
    const tx = db.transaction(STORE_YEARS, mode);
    const store = tx.objectStore(STORE_YEARS);

    return handler(store).finally(() => {
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
      tx.onabort = () => db.close();
    });
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Errore operazione IndexedDB'));
  });
}

export class HarvestYearRepository {
  async getAll(): Promise<HarvestYear[]> {
    return withStore('readonly', async (store) => {
      const list = (await requestToPromise(store.getAll())) as HarvestYear[];
      return sortYearsDesc(list);
    });
  }

  async createYear(id: number, notes = ''): Promise<void> {
    const year = normalizeYearInput({ id, notes });

    await withStore('readwrite', async (store) => {
      const existing = (await requestToPromise(store.get(year.id))) as HarvestYear | undefined;
      if (existing) {
        throw new Error(`L'annata ${year.id} esiste gia.`);
      }

      await requestToPromise(store.add(year));
    });

    const all = await this.getAll();
    if (all.length === 1) {
      await this.setCurrentYear(all[0].id);
    }
  }

  async getCurrentYear(): Promise<HarvestYear | undefined> {
    const years = await this.getAll();
    return years.find((y) => y.isCurrent);
  }

  async setCurrentYear(yearId: number): Promise<void> {
    const years = await this.getAll();
    if (!years.some((y) => y.id === yearId)) {
      throw new Error(`Annata ${yearId} non trovata.`);
    }

    const normalized = ensureSingleCurrent(years, yearId);

    await withStore('readwrite', async (store) => {
      for (const year of normalized) {
        await requestToPromise(store.put(year));
      }
    });
  }

  async removeYear(yearId: number): Promise<void> {
    await withStore('readwrite', async (store) => {
      const key = Math.trunc(yearId);
      const existing = (await requestToPromise(store.get(key))) as HarvestYear | undefined;
      if (!existing) {
        throw new Error(`Annata ${yearId} non trovata.`);
      }
      if (existing.isCurrent) {
        throw new Error('Non puoi eliminare l\'annata corrente. Seleziona prima un\'altra annata.');
      }

      await requestToPromise(store.delete(key));
    });
  }

  async seedIfEmpty(): Promise<void> {
    const years = await this.getAll();
    if (years.length > 0) {
      return;
    }

    const current = new Date().getFullYear();
    await this.createYear(current, 'Annata iniziale');
    await this.setCurrentYear(current);
  }
}
