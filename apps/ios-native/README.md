# iOS Native App

Stack target:

- Swift
- SwiftUI
- Architecture: MVVM
- Concurrency: async/await
- Persistenza: Core Data o SQLite wrapper

Obiettivo MVP:

- Selezione annata
- Registro giornaliero ore
- Anagrafica braccianti
- Riepilogo compensi
- Export/import CSV compatibile

Note:

- Mantenere allineamento rigoroso alle regole in shared/contracts.

Stato attuale:

- Scaffold SwiftUI creato (sorgenti app + view root).
- Config `project.yml` presente per generare progetto Xcode con XcodeGen.
- `Makefile` con target `generate` e `open`.
- Dominio base creato (`HarvestYear`, `Worker`, `WorkLog`).
- Repository base e in-memory seed pronti per bootstrap feature.

Struttura avvio rapido:

- `project.yml`
- `Makefile`
- `GestBracciantiNative/Sources/App/GestBracciantiNativeApp.swift`
- `GestBracciantiNative/Sources/Features/RootView.swift`

Comandi consigliati (macOS):

1. `cd apps/ios-native`
2. `xcodegen generate`
3. Apri il progetto generato in Xcode e avvia su simulatore.
