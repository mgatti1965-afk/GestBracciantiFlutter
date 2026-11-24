package com.gestbraccianti.androidnative.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.gestbraccianti.androidnative.domain.BackupHistoryItem
import com.gestbraccianti.androidnative.domain.FestiveDaysType
import com.gestbraccianti.androidnative.domain.OwnerSettings
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val BKP_DATE_FMT = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")

@Composable
fun OthersScreen(
  settings: OwnerSettings,
  backupHistory: List<BackupHistoryItem>,
  onSaveSettings: (ownerName: String, ownerSurname: String, extraThreshold: Double, festiveType: FestiveDaysType) -> Unit,
  onExportCsvClick: () -> Unit,
  onImportCsvClick: () -> Unit,
  onRestoreBackupItem: (BackupHistoryItem) -> Unit,
  onDeleteBackupItem: (Int) -> Unit,
  onClearDatabase: () -> Unit,
  modifier: Modifier = Modifier,
) {
  var ownerSurname by remember(settings.ownerSurname) { mutableStateOf(settings.ownerSurname) }
  var ownerName by remember(settings.ownerName) { mutableStateOf(settings.ownerName) }
  var thresholdText by remember(settings.extraHoursThreshold) {
    mutableStateOf(settings.extraHoursThreshold.toString())
  }
  var festiveType by remember(settings.festiveDaysType) { mutableStateOf(settings.festiveDaysType) }

  var confirmRestoreItem by remember { mutableStateOf<BackupHistoryItem?>(null) }
  var showConfirmReset by remember { mutableStateOf(false) }

  val hasUnexported = settings.lastMutationDate > (settings.lastExportDate ?: 0L)

  Column(
    modifier = modifier
      .fillMaxSize()
      .verticalScroll(rememberScrollState())
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(14.dp),
  ) {
    // Azienda e Impostazioni Calcolo
    Card(
      modifier = Modifier.fillMaxWidth(),
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
      Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Azienda e Impostazioni Calcolo", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          OutlinedTextField(
            value = ownerSurname,
            onValueChange = { ownerSurname = it },
            label = { Text("Cognome / Azienda") },
            singleLine = true,
            modifier = Modifier.weight(1f),
          )
          OutlinedTextField(
            value = ownerName,
            onValueChange = { ownerName = it },
            label = { Text("Nome") },
            singleLine = true,
            modifier = Modifier.weight(1f),
          )
        }
        OutlinedTextField(
          value = thresholdText,
          onValueChange = { thresholdText = it },
          label = { Text("Soglia straordinari (ore/giorno)") },
          keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
          singleLine = true,
          modifier = Modifier.fillMaxWidth(),
        )
        Text("Giorni festivi settimanali", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
          listOf(
            FestiveDaysType.NONE to "Nessuno",
            FestiveDaysType.SATURDAY to "Solo Sabato",
            FestiveDaysType.SUNDAY to "Solo Domenica",
            FestiveDaysType.SATURDAY_AND_SUNDAY to "Sabato e Domenica",
          ).forEach { (type, label) ->
            FilterChip(
              selected = festiveType == type,
              onClick = { festiveType = type },
              label = { Text(label) },
            )
          }
        }
        Button(
          onClick = {
            val threshold = thresholdText.replace(',', '.').toDoubleOrNull() ?: 8.0
            onSaveSettings(ownerName, ownerSurname, threshold, festiveType)
          },
          modifier = Modifier.fillMaxWidth(),
        ) {
          Text("Salva Impostazioni")
        }
      }
    }

    // Backup CSV
    Card(
      modifier = Modifier.fillMaxWidth(),
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
      Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Backup & Ripristino CSV", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(
          text = if (hasUnexported) {
            "Modifiche non ancora esportate (${settings.saveCountSinceBackup} salvataggi dal backup)."
          } else {
            "Tutti i dati risultano esportati."
          },
          style = MaterialTheme.typography.bodySmall,
          color = if (hasUnexported) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
        )
        if (!settings.lastImportDate.isNullOrBlank()) {
          Text(
            text = "Ultimo import/export: ${settings.lastImportDate}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
          )
        }
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
          Button(onClick = onExportCsvClick, modifier = Modifier.weight(1f)) {
            Text("Esporta CSV")
          }
          OutlinedButton(onClick = onImportCsvClick, modifier = Modifier.weight(1f)) {
            Text("Importa CSV")
          }
        }

        if (backupHistory.isNotEmpty()) {
          Spacer(Modifier.height(4.dp))
          Text("Storico Backup Locali (${backupHistory.size})", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
          backupHistory.take(10).forEach { item ->
            val dt = BKP_DATE_FMT.format(Instant.ofEpochMilli(item.createdAt).atZone(ZoneId.systemDefault()))
            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically,
            ) {
              Column(modifier = Modifier.weight(1f)) {
                Text(item.filename, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                Text(dt, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
              }
              Row {
                TextButton(onClick = { confirmRestoreItem = item }) {
                  Text("Ripristina")
                }
                IconButton(onClick = { onDeleteBackupItem(item.id) }) {
                  Icon(Icons.Default.Delete, contentDescription = "Elimina", tint = MaterialTheme.colorScheme.error)
                }
              }
            }
          }
        }
      }
    }

    // Danger zone
    Card(
      modifier = Modifier.fillMaxWidth(),
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
    ) {
      Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Zona Pericolosa", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        Button(
          onClick = { showConfirmReset = true },
          colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
          modifier = Modifier.fillMaxWidth(),
        ) {
          Text("Azzera Database Locale")
        }
      }
    }
  }

  confirmRestoreItem?.let { item ->
    AlertDialog(
      onDismissRequest = { confirmRestoreItem = null },
      title = { Text("Ripristina Backup") },
      text = { Text("Vuoi ripristinare \"${item.filename}\"? I dati attuali verranno sostituiti (verrà salvato un backup automatico).") },
      confirmButton = {
        Button(onClick = {
          onRestoreBackupItem(item)
          confirmRestoreItem = null
        }) { Text("Ripristina") }
      },
      dismissButton = {
        TextButton(onClick = { confirmRestoreItem = null }) { Text("Annulla") }
      },
    )
  }

  if (showConfirmReset) {
    AlertDialog(
      onDismissRequest = { showConfirmReset = false },
      title = { Text("Conferma Azzeramento") },
      text = { Text("Tutti i dati (annate, braccianti, gruppi e ore) verranno eliminati definitivamente. Confermi?") },
      confirmButton = {
        Button(
          onClick = {
            onClearDatabase()
            showConfirmReset = false
          },
          colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
        ) { Text("Azzera Tutto") }
      },
      dismissButton = {
        TextButton(onClick = { showConfirmReset = false }) { Text("Annulla") }
      },
    )
  }
}
