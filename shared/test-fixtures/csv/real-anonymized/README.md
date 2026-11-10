# Campioni Reali Anonimizzati CSV

Metti qui i file CSV reali anonimizzati da usare per test di regressione parser.

Regole minime:
- estensione: .csv
- rimuovere o sostituire dati personali diretti (nome/cognome/telefono) mantenendo struttura e cardinalita
- mantenere valori numerici e forma delle date utili alla validazione parser
- non inserire file con dati sensibili non anonimizzati

I test in apps/web-native/src/domain/csvCompat.test.ts scoprono automaticamente i file .csv in questa cartella e generano snapshot Vitest.

Comando:
- npm run test

Se aggiungi o modifichi campioni, aggiorna gli snapshot con:
- npm run test -- -u
