# Migrazione a piattaforme native

Questo percorso mantiene il progetto Flutter attuale come baseline funzionante e introduce tre client nativi separati:

- Android nativo (Kotlin + Jetpack Compose)
- iOS nativo (Swift + SwiftUI)
- Web nativo (TypeScript)

Obiettivo: massima aderenza nativa per UX, prestazioni e integrazione con ogni piattaforma.

## Principi

1. Nessuna riscrittura big-bang.
2. Migrazione incrementale guidata da test di parita funzionale.
3. Contratti condivisi e versionati per evitare divergenze.
4. Flutter resta il riferimento funzionale fino al cutover.

## Struttura introdotta

- apps/android-native
- apps/ios-native
- apps/web-native
- shared/contracts
- shared/test-fixtures
- docs/migration

## Documenti principali

- ROADMAP_NATIVE.md: piano in fasi e milestone.
- BACKLOG_SPRINTS.md: backlog operativo per sprint.
- ../../shared/contracts/domain-schema.json: schema dati condiviso.
- ../../shared/contracts/business-rules.md: regole funzionali canoniche.
