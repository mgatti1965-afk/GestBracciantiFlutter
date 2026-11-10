# Roadmap Migrazione Native

## Fase 0 - Baseline e contratti (1-2 settimane)

Deliverable:

- Contratti dati condivisi iniziali in shared/contracts.
- Regole business formalizzate (ore, straordinari, festivi, compensi).
- Set casi golden per validazione cross-platform.
- Definizione KPI: tempi avvio, fluidita UI, parity funzionale.

Criteri di uscita:

- Regole approvate e congelate versione 0.1.
- 20+ casi golden pronti per test automatici.

## Fase 1 - Web nativo MVP (3-5 settimane)

Deliverable:

- Moduli: annate, anagrafica braccianti, log giornaliero, riepilogo base.
- Persistenza locale browser con export/import CSV compatibile.
- Test unitari su regole di calcolo.

Criteri di uscita:

- Parita funzionale minima con il percorso principale Flutter.
- Nessuna regressione sui casi golden.

## Fase 2 - Android nativo MVP (4-6 settimane)

Deliverable:

- App Compose con flussi principali e DB locale.
- Integrazione stampa/condivisione report.
- Suite test unit + test UI smoke.

Criteri di uscita:

- Parita funzionale su almeno 80% use case core.
- KPI prestazioni in linea con obiettivi.

## Fase 3 - iOS nativo MVP (4-7 settimane)

Deliverable:

- App SwiftUI con funzionalita core equivalenti.
- Integrazione file sharing e reportistica.
- Test unitari e test UI baseline.

Criteri di uscita:

- Parita use case core mobile Android/iOS.
- Nessuna divergenza nel calcolo compensi.

## Fase 4 - Hardening e cutover (2-4 settimane)

Deliverable:

- Test regressione funzionale allargata.
- Migrazione utenti assistita (backup/import).
- Piano rilascio, monitoraggio e rollback.

Criteri di uscita:

- Approccio go-live approvato.
- Piano supporto post-rilascio pronto.
