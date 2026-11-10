# Android Native App

Stack target:

- Kotlin
- Jetpack Compose
- Architecture: ViewModel + Repository
- Coroutines + Flow
- Room o SQLDelight

Obiettivo MVP:

- Selezione annata
- Registro giornaliero ore
- Anagrafica braccianti
- Riepilogo compensi
- Export/import CSV compatibile

Dipendenze di riferimento da pianificare:

- androidx.compose
- androidx.lifecycle
- kotlinx.coroutines
- room-runtime o sqldelight

Stato attuale:

- Scaffold Gradle Kotlin DSL creato.
- Modulo `app` pronto con Jetpack Compose.
- `MainActivity` placeholder funzionante.
- Dominio base creato (`HarvestYear`, `Worker`, `WorkLog`).
- Repository base e in-memory seed pronti per bootstrap feature.

Struttura avvio rapido:

- `settings.gradle.kts`
- `build.gradle.kts`
- `app/build.gradle.kts`
- `app/src/main/AndroidManifest.xml`
- `app/src/main/java/com/gestbraccianti/androidnative/MainActivity.kt`

Prossimo comando consigliato:

1. Apri `apps/android-native` in Android Studio.
2. Lascia completare la sync Gradle.
3. Esegui app su emulatore/dispositivo.
