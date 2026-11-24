package com.gestbraccianti.androidnative.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp

enum class HelpTopic(val title: String, val bullets: List<String>) {
  YEAR_SELECTION(
    title = "Guida: Selezione Annata",
    bullets = listOf(
      "Con \"+ Nuova\" puoi creare una nuova annata importando automaticamente braccianti, tariffe e gruppi dall'ultima annata.",
      "Con \"Importa CSV\" puoi caricare subito un backup esportato da Android o dal Web.",
      "Tocca un'annata per aprirla e impostarla come corrente.",
    ),
  ),
  DAILY_LOGGING(
    title = "Guida: Ore Lavorate",
    bullets = listOf(
      "Seleziona un giorno sul calendario per vedere le registrazioni o segnare/rimuovere il giorno come festivo globale.",
      "Tocca il pulsante \"+\" o \"Modifica Giorno\" per inserire o modificare i turni.",
    ),
  ),
  WORK_DAY_DETAIL(
    title = "Guida: Dettaglio Giornata",
    bullets = listOf(
      "Imposta gli orari Mattina e Pomeriggio usando i tasti rapidi ±15'.",
      "Puoi selezionare più braccianti o un intero gruppo in una volta sola.",
      "Attiva \"Inserimento su più giorni (Range)\" per registrare lo stesso turno su un intervallo di date.",
    ),
  ),
  FINANCIAL_SUMMARY(
    title = "Guida: Riepilogo Compensi",
    bullets = listOf(
      "Filtra per Anno, Mese, Settimana o Giorno e scegli se raggruppare per Bracciante o per Gruppo.",
      "Usa \"Stampa / PDF\" per generare il report completo o il singolo PDF per bracciante.",
    ),
  ),
  WORKER_REGISTRY(
    title = "Guida: Registro Braccianti",
    bullets = listOf(
      "Gestisci l'anagrafica globale e le tariffe annuali (ordinaria, straordinaria, festiva).",
      "Se dopo un import CSV compaiono profili duplicati, usa \"Unisci Profili\" in cima alla lista.",
      "Nella scheda Gruppi puoi creare squadre per velocizzare l'inserimento giornaliero.",
    ),
  ),
  OTHERS(
    title = "Guida: Altre Funzioni",
    bullets = listOf(
      "Configura nome azienda, soglia straordinari e giorni festivi settimanali.",
      "Esporta regolarmente un backup CSV compatibile con l'app Web e gestisci lo storico locale.",
    ),
  ),
}

@Composable
fun HelpDialog(
  topic: HelpTopic,
  onDismiss: () -> Unit,
) {
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(topic.title) },
    text = {
      Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        topic.bullets.forEach { bullet ->
          Text("• $bullet", style = MaterialTheme.typography.bodyMedium)
        }
      }
    },
    confirmButton = {
      Button(onClick = onDismiss) {
        Text("Chiudi")
      }
    },
  )
}
