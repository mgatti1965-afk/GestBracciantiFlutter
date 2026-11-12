# GestBraccianti

Nuovo workspace pulito per la migrazione a client nativi:

- Android nativo (Kotlin + Jetpack Compose)
- iOS nativo (Swift + SwiftUI)
- Web nativo (TypeScript)

## Struttura

- apps/android-native
- apps/ios-native
- apps/web-native
- shared/contracts
- shared/test-fixtures
- docs/migration

## Rilascio Web (GitHub Pages)

L'app Web (`apps/web-native`) viene compilata e pubblicata automaticamente su GitHub Pages tramite il workflow `.github/workflows/deploy-web.yml` ad ogni push su `main`:

- URL pubblico: https://mgatti1965-afk.github.io/GestBracciantiFlutter/
- Configurazione iniziale su GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**

## Da dove partire

1. Apri il workspace: GestBraccianti-native.code-workspace
2. Leggi docs/migration/README.md
3. Esegui la Fase 0 in docs/migration/ROADMAP_NATIVE.md
