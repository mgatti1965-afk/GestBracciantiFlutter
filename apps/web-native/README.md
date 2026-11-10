# Web Native App

Client web nativo inizializzato con Vite + TypeScript + Vitest.

## Stack attuale

- TypeScript
- Vite
- Vitest
- UI vanilla (placeholder MVP)

## Comandi

1. npm install
2. npm run dev
3. npm run test
4. npm run build

## Stato corrente

- Scaffold applicativo pronto in src.
- Modulo dominio ore/compensi implementato in src/domain/calc.ts.
- Test base regole R1-R3 in src/domain/calc.test.ts.
- Gestione annate con persistenza IndexedDB in src/data/harvestYearRepository.ts.
- UI annate con creazione e selezione corrente in src/App.ts.
- Gestione annate estesa: duplicazione, eliminazione protetta e svuotamento guidato con conferma esplicita in src/App.ts.
- Test dominio annate in src/domain/harvestYear.test.ts.
- Modulo braccianti con persistenza IndexedDB in src/data/workerRepository.ts.
- UI braccianti legata all'annata corrente in src/App.ts.
- Gestione braccianti completa: modifica, archivia/riattiva ed eliminazione protetta da log associati in src/App.ts.
- Test dominio braccianti in src/domain/worker.test.ts.
- Modulo log giornalieri con persistenza IndexedDB in src/data/workLogRepository.ts.
- Calcolo compensi al salvataggio log in src/domain/workLog.ts.
- UI log con storico annata corrente in src/App.ts.
- Gestione log operativa: modifica, eliminazione e filtri (periodo + bracciante) in src/App.ts.
- Test dominio log in src/domain/workLog.test.ts.
- Modulo stampe con intervallo custom indipendente dai filtri registro, selezione bracciante, riepiloghi per periodo (mensile/settimanale) e layout multipagina per dettaglio per bracciante in src/App.ts.
- Import/export CSV compatibile (formato canonico versionato + parser legacy) in src/domain/csvCompat.ts e src/data/csvCompatRepository.ts.
- Parser esteso anche al backup storico multi-sezione (TIPO W/Y/C/L) con validazione su campione reale anonimizzato.
- Export CSV canonico esteso con colonna finale descrittiva della tipologia riga (Annata/Bracciante/Log giornaliero).
- Stabilizzazione CRUD web: guard anti-doppio submit, validazioni numeriche/data piu robuste e feedback utente piu chiaro in src/App.ts.
- Fixture CSV condivise validate in shared/test-fixtures/csv tramite test in src/domain/csvCompat.test.ts.
- Smoke test round-trip export/import su fixture canonica condivisa in src/domain/csvCompat.test.ts.
- Copertura CSV estesa con fixture quasi-produzione (note con caratteri speciali, header legacy alias, numeri con virgola) in shared/test-fixtures/csv.
- Snapshot di regressione parser CSV aggiunti su fixture quasi-produzione/legacy in src/domain/csvCompat.test.ts.
- Flusso pronto per campioni reali anonimizzati con discovery automatico in shared/test-fixtures/csv/real-anonymized.

## Prossimi step

1. Stabilizzazione gestionale web (flussi CRUD, validazioni e UX operativa).
2. Stampe aggiuntive (filtri periodo e layout multipagina).
3. Caricare uno o piu campioni reali anonimizzati in shared/test-fixtures/csv/real-anonymized e fissare gli snapshot con npm run test -- -u.
