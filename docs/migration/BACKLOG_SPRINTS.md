# Backlog Sprint Migrazione Native

## Epic A - Fondazioni condivise

- A1: Versionare schema dominio in JSON e changelog.
- A2: Definire fixtures CSV con casi realistici.
- A3: Implementare test golden comuni su regole ore/compensi.
- A4: Definire versione contratto e policy compatibilita.

## Epic B - Web nativo

- B1: Setup app TypeScript con lint/test/build.
- B2: Schermata annate con selezione annata corrente.
- B3: Registro giornaliero con calcoli live.
- B4: Riepilogo periodale con aggregazioni.
- B5: Export/import CSV compatibile con formato storico.

## Epic C - Android nativo

- C1: Setup modulo app Compose + architettura stato.
- C2: DB locale e repository.
- C3: Flusso inserimento giornata e dettaglio bracciante.
- C4: PDF/Share + permessi file.
- C5: Test UI smoke e regression pack.

## Epic D - iOS nativo

- D1: Setup app SwiftUI + data layer.
- D2: Flussi core (annata, giornate, braccianti, riepilogo).
- D3: Export/import e condivisione.
- D4: Test unit e snapshot/UI base.

## Epic E - Qualita e rilascio

- E1: Matrix CI per Android/iOS/Web.
- E2: Reporting parita funzionale rispetto a Flutter.
- E3: Piano rollout graduale e fallback.

## Definition of Done minima per feature

- Test unitari verdi.
- Casi golden coperti.
- Nessun warning critico di lint.
- Documentazione funzionale aggiornata.
