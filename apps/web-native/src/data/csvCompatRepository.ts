import { exportCsvDataset, importCsvDataset } from '../domain/csvCompat';
import { type HarvestYear } from '../domain/harvestYear';
import { type Worker } from '../domain/worker';
import { type WorkLog } from '../domain/workLog';

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
    request.onerror = () => reject(request.error ?? new Error('Errore apertura IndexedDB CSV'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Errore operazione IndexedDB CSV'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Transazione IndexedDB fallita'));
    tx.onabort = () => reject(tx.error ?? new Error('Transazione IndexedDB annullata'));
  });
}

export class CsvCompatRepository {
  async exportCsv(): Promise<string> {
    const db = await openDb();

    try {
      const tx = db.transaction([STORE_YEARS, STORE_WORKERS, STORE_LOGS], 'readonly');
      const yearsStore = tx.objectStore(STORE_YEARS);
      const workersStore = tx.objectStore(STORE_WORKERS);
      const logsStore = tx.objectStore(STORE_LOGS);

      const yearsPromise = requestToPromise(yearsStore.getAll()) as Promise<HarvestYear[]>;
      const workersPromise = requestToPromise(workersStore.getAll()) as Promise<Worker[]>;
      const logsPromise = requestToPromise(logsStore.getAll()) as Promise<WorkLog[]>;

      const [years, workers, logs] = await Promise.all([yearsPromise, workersPromise, logsPromise]);
      await txDone(tx);

      return exportCsvDataset({ years, workers, logs });
    } finally {
      db.close();
    }
  }

  async importCsv(text: string): Promise<{ years: number; workers: number; logs: number }> {
    const dataset = importCsvDataset(text);
    const db = await openDb();

    try {
      const tx = db.transaction([STORE_YEARS, STORE_WORKERS, STORE_LOGS], 'readwrite');
      const yearsStore = tx.objectStore(STORE_YEARS);
      const workersStore = tx.objectStore(STORE_WORKERS);
      const logsStore = tx.objectStore(STORE_LOGS);

      await requestToPromise(yearsStore.clear());
      await requestToPromise(workersStore.clear());
      await requestToPromise(logsStore.clear());

      for (const year of dataset.years) {
        await requestToPromise(yearsStore.put(year));
      }
      for (const worker of dataset.workers) {
        await requestToPromise(workersStore.put(worker));
      }
      for (const log of dataset.logs) {
        await requestToPromise(logsStore.put(log));
      }

      await txDone(tx);

      return {
        years: dataset.years.length,
        workers: dataset.workers.length,
        logs: dataset.logs.length,
      };
    } finally {
      db.close();
    }
  }
}
