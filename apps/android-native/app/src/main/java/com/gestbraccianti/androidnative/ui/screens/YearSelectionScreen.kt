package com.gestbraccianti.androidnative.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import com.gestbraccianti.androidnative.domain.HarvestYear
import java.time.LocalDate

@Composable
fun YearSelectionScreen(
  years: List<HarvestYear>,
  onSelectYear: (Int) -> Unit,
  onCreateYear: (yearId: Int, notes: String, migrateFromYearId: Int?, migrateWorkers: Boolean, migrateGroups: Boolean) -> Unit,
  onDeleteYear: (Int) -> Unit,
  onImportCsvClick: () -> Unit,
  modifier: Modifier = Modifier,
) {
  var showCreateDialog by remember { mutableStateOf(false) }
  var yearToDelete by remember { mutableStateOf<HarvestYear?>(null) }

  Column(
    modifier = modifier
      .fillMaxSize()
      .padding(16.dp),
  ) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Text(
        text = "Seleziona Annata",
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.Bold,
      )
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = onImportCsvClick) {
          Text("Importa CSV")
        }
        Button(onClick = { showCreateDialog = true }) {
          Icon(Icons.Default.Add, contentDescription = null)
          Text("Nuova", modifier = Modifier.padding(start = 4.dp))
        }
      }
    }

    Spacer(Modifier.height(16.dp))

    if (years.isEmpty()) {
      Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
      ) {
        Column(
          modifier = Modifier.padding(24.dp),
          horizontalAlignment = Alignment.CenterHorizontally,
        ) {
          Text(
            text = "Nessuna annata presente",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
          )
          Text(
            text = "Crea una nuova annata oppure importa un backup CSV esistente.",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 8.dp),
          )
        }
      }
    } else {
      LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items(years, key = { it.id }) { year ->
          Card(
            modifier = Modifier
              .fillMaxWidth()
              .clickable { onSelectYear(year.id) },
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
          ) {
            Row(
              modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically,
            ) {
              Column(modifier = Modifier.weight(1f)) {
                Row(
                  verticalAlignment = Alignment.CenterVertically,
                  horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                  Text(
                    text = "Annata ${year.id}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                  )
                  if (year.isCurrent) {
                    Surface(
                      color = MaterialTheme.colorScheme.primaryContainer,
                      shape = MaterialTheme.shapes.small,
                    ) {
                      Text(
                        text = "Corrente",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                      )
                    }
                  }
                }
                if (year.notes.isNotBlank()) {
                  Text(
                    text = year.notes,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                  )
                }
              }
              IconButton(onClick = { yearToDelete = year }) {
                Icon(
                  Icons.Default.Delete,
                  contentDescription = "Elimina annata",
                  tint = MaterialTheme.colorScheme.error,
                )
              }
            }
          }
        }
      }
    }
  }

  if (showCreateDialog) {
    val latestYear = years.maxByOrNull { it.id }
    val suggestedYear = ((latestYear?.id ?: (LocalDate.now().year - 1)) + 1).coerceIn(2000, 2100)
    var yearInput by remember { mutableStateOf(suggestedYear.toString()) }
    var notesInput by remember { mutableStateOf("") }
    var migrateWorkers by remember { mutableStateOf(latestYear != null) }
    var migrateGroups by remember { mutableStateOf(latestYear != null) }

    AlertDialog(
      onDismissRequest = { showCreateDialog = false },
      title = { Text("Nuova Annata") },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          OutlinedTextField(
            value = yearInput,
            onValueChange = { yearInput = it.filter { ch -> ch.isDigit() }.take(4) },
            label = { Text("Anno (es. 2026)") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
          )
          OutlinedTextField(
            value = notesInput,
            onValueChange = { notesInput = it },
            label = { Text("Note (opzionale)") },
            modifier = Modifier.fillMaxWidth(),
          )
          if (latestYear != null) {
            Row(
              verticalAlignment = Alignment.CenterVertically,
              modifier = Modifier
                .fillMaxWidth()
                .clickable { migrateWorkers = !migrateWorkers },
            ) {
              Checkbox(checked = migrateWorkers, onCheckedChange = { migrateWorkers = it })
              Text("Importa braccianti e tariffe dal ${latestYear.id}")
            }
            Row(
              verticalAlignment = Alignment.CenterVertically,
              modifier = Modifier
                .fillMaxWidth()
                .clickable { migrateGroups = !migrateGroups },
            ) {
              Checkbox(checked = migrateGroups, onCheckedChange = { migrateGroups = it })
              Text("Importa gruppi dal ${latestYear.id}")
            }
          }
        }
      },
      confirmButton = {
        Button(
          onClick = {
            val id = yearInput.toIntOrNull()
            if (id != null) {
              onCreateYear(id, notesInput, latestYear?.id, migrateWorkers, migrateGroups)
              showCreateDialog = false
            }
          },
        ) {
          Text("Crea")
        }
      },
      dismissButton = {
        TextButton(onClick = { showCreateDialog = false }) {
          Text("Annulla")
        }
      },
    )
  }

  yearToDelete?.let { target ->
    AlertDialog(
      onDismissRequest = { yearToDelete = null },
      title = { Text("Elimina Annata ${target.id}") },
      text = { Text("Verranno eliminati tutti i log, le tariffe annuali e i gruppi dell'annata ${target.id}. Confermi?") },
      confirmButton = {
        Button(
          onClick = {
            onDeleteYear(target.id)
            yearToDelete = null
          },
        ) {
          Text("Elimina")
        }
      },
      dismissButton = {
        TextButton(onClick = { yearToDelete = null }) {
          Text("Annulla")
        }
      },
    )
  }
}
