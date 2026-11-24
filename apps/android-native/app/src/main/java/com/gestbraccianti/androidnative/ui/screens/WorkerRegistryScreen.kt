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
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
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
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.gestbraccianti.androidnative.domain.DomainCalculator
import com.gestbraccianti.androidnative.domain.DomainHelpers
import com.gestbraccianti.androidnative.domain.Worker
import com.gestbraccianti.androidnative.domain.WorkerGroupWithMembers
import com.gestbraccianti.androidnative.domain.WorkerWithRate

@Composable
fun WorkerRegistryScreen(
  yearId: Int,
  allWorkers: List<Worker>,
  workersWithRate: List<WorkerWithRate>,
  groupsWithMembers: List<WorkerGroupWithMembers>,
  onSaveWorker: (
    workerId: Int?,
    surname: String,
    name: String,
    phone: String,
    hourlyRate: Double,
    extraRate: Double,
    holidayRate: Double,
  ) -> Unit,
  onSetArchived: (workerId: Int, archived: Boolean) -> Unit,
  onDeleteWorker: (Int) -> Unit,
  onMergeDuplicates: (List<Int>) -> Unit,
  onCopyWorkersFromPrevYear: () -> Unit,
  onCreateGroup: (String) -> Unit,
  onDeleteGroup: (Int) -> Unit,
  onSetGroupMember: (groupId: Int, workerId: Int, isMember: Boolean) -> Unit,
  onCopyGroupsFromPrevYear: () -> Unit,
  modifier: Modifier = Modifier,
) {
  var subTabIndex by remember { mutableIntStateOf(0) }
  var searchQuery by remember { mutableStateOf("") }
  var showArchived by remember { mutableStateOf(false) }

  var editingWorker by remember { mutableStateOf<WorkerWithRate?>(null) }
  var showNewWorkerDialog by remember { mutableStateOf(false) }
  var workerToDelete by remember { mutableStateOf<WorkerWithRate?>(null) }

  var showNewGroupDialog by remember { mutableStateOf(false) }
  var editingGroupMembers by remember { mutableStateOf<WorkerGroupWithMembers?>(null) }
  var groupToDelete by remember { mutableStateOf<WorkerGroupWithMembers?>(null) }

  val duplicateGroups = remember(allWorkers) {
    DomainHelpers.findDuplicateWorkerGroups(allWorkers)
  }

  Column(modifier = modifier.fillMaxSize()) {
    TabRow(selectedTabIndex = subTabIndex) {
      Tab(
        selected = subTabIndex == 0,
        onClick = { subTabIndex = 0 },
        text = { Text("Anagrafica (${workersWithRate.size})") },
      )
      Tab(
        selected = subTabIndex == 1,
        onClick = { subTabIndex = 1 },
        text = { Text("Gruppi (${groupsWithMembers.size})") },
      )
    }

    if (duplicateGroups.isNotEmpty()) {
      Card(
        modifier = Modifier
          .fillMaxWidth()
          .padding(horizontal = 12.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
      ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
          Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Default.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error)
            Text(
              text = "Rilevati ${duplicateGroups.size} gruppi di profili duplicati",
              style = MaterialTheme.typography.titleSmall,
              fontWeight = FontWeight.Bold,
            )
          }
          duplicateGroups.forEach { dupGroup ->
            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically,
            ) {
              Text(
                text = "${DomainHelpers.workerFullName(dupGroup.first())} (${dupGroup.size}x)",
                style = MaterialTheme.typography.bodySmall,
              )
              Button(onClick = { onMergeDuplicates(dupGroup.map { it.id }) }) {
                Text("Unisci Profili")
              }
            }
          }
        }
      }
    }

    if (subTabIndex == 0) {
      val filtered = remember(workersWithRate, searchQuery, showArchived) {
        val q = searchQuery.trim().lowercase()
        workersWithRate.filter { w ->
          (showArchived || !w.isArchived) &&
            (q.isEmpty() || "${w.surname} ${w.name} ${w.phoneNumber}".lowercase().contains(q))
        }
      }

      Column(
        modifier = Modifier
          .fillMaxSize()
          .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
      ) {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.spacedBy(8.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            placeholder = { Text("Cerca bracciante...") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            singleLine = true,
            modifier = Modifier.weight(1f),
          )
          Button(onClick = { showNewWorkerDialog = true }) {
            Icon(Icons.Default.Add, contentDescription = null)
            Text("Nuovo", modifier = Modifier.padding(start = 4.dp))
          }
        }

        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.clickable { showArchived = !showArchived },
          ) {
            Checkbox(checked = showArchived, onCheckedChange = { showArchived = it })
            Text("Mostra archiviati", style = MaterialTheme.typography.bodySmall)
          }
          OutlinedButton(onClick = onCopyWorkersFromPrevYear) {
            Text("Copia dal ${yearId - 1}")
          }
        }

        LazyColumn(
          modifier = Modifier.weight(1f),
          verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
          items(filtered, key = { it.id }) { w ->
            Card(
              modifier = Modifier
                .fillMaxWidth()
                .clickable { editingWorker = w },
              colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
              Row(
                modifier = Modifier
                  .fillMaxWidth()
                  .padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
              ) {
                Column(modifier = Modifier.weight(1f)) {
                  Text(
                    text = "${w.surname} ${w.name}".trim() + if (w.isArchived) " (Archiviato)" else "",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                  )
                  Text(
                    text = "Ord: ${DomainCalculator.formatCurrencyIt(w.hourlyRate)} | " +
                      "Extra: ${DomainCalculator.formatCurrencyIt(w.extraHourlyRate)} | " +
                      "Fest: ${DomainCalculator.formatCurrencyIt(w.holidayHourlyRate)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                  )
                  if (w.phoneNumber.isNotBlank()) {
                    Text(text = "Tel: ${w.phoneNumber}", style = MaterialTheme.typography.labelSmall)
                  }
                }
                Row {
                  TextButton(onClick = { onSetArchived(w.id, !w.isArchived) }) {
                    Text(if (w.isArchived) "Ripristina" else "Archivia")
                  }
                  IconButton(onClick = { workerToDelete = w }) {
                    Icon(
                      Icons.Default.Delete,
                      contentDescription = "Elimina",
                      tint = MaterialTheme.colorScheme.error,
                    )
                  }
                }
              }
            }
          }
        }
      }
    } else {
      Column(
        modifier = Modifier
          .fillMaxSize()
          .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
      ) {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
          OutlinedButton(
            onClick = onCopyGroupsFromPrevYear,
            modifier = Modifier.weight(1f),
          ) {
            Text("Copia dal ${yearId - 1}")
          }
          Button(
            onClick = { showNewGroupDialog = true },
            modifier = Modifier.weight(1f),
          ) {
            Icon(Icons.Default.Add, contentDescription = null)
            Text("Nuovo Gruppo", modifier = Modifier.padding(start = 4.dp))
          }
        }

        LazyColumn(
          modifier = Modifier.weight(1f),
          verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
          items(groupsWithMembers, key = { it.group.id }) { gwm ->
            Card(
              modifier = Modifier
                .fillMaxWidth()
                .clickable { editingGroupMembers = gwm },
              colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
              Row(
                modifier = Modifier
                  .fillMaxWidth()
                  .padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
              ) {
                Column(modifier = Modifier.weight(1f)) {
                  Text(
                    text = gwm.group.name,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                  )
                  Text(
                    text = "${gwm.members.size} membri: " +
                      gwm.members.joinToString(", ") { DomainHelpers.workerFullName(it) }.ifEmpty { "nessuno" },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                  )
                }
                IconButton(onClick = { groupToDelete = gwm }) {
                  Icon(
                    Icons.Default.Delete,
                    contentDescription = "Elimina gruppo",
                    tint = MaterialTheme.colorScheme.error,
                  )
                }
              }
            }
          }
        }
      }
    }
  }

  if (showNewWorkerDialog || editingWorker != null) {
    WorkerFormDialog(
      initial = editingWorker,
      onDismiss = {
        showNewWorkerDialog = false
        editingWorker = null
      },
      onSave = { surname, name, phone, rate, extra, holiday ->
        onSaveWorker(editingWorker?.id, surname, name, phone, rate, extra, holiday)
        showNewWorkerDialog = false
        editingWorker = null
      },
    )
  }

  workerToDelete?.let { target ->
    AlertDialog(
      onDismissRequest = { workerToDelete = null },
      title = { Text("Elimina Bracciante") },
      text = { Text("Eliminare ${target.surname} ${target.name} e tutti i suoi log?") },
      confirmButton = {
        Button(onClick = {
          onDeleteWorker(target.id)
          workerToDelete = null
        }) { Text("Elimina") }
      },
      dismissButton = {
        TextButton(onClick = { workerToDelete = null }) { Text("Annulla") }
      },
    )
  }

  if (showNewGroupDialog) {
    var groupName by remember { mutableStateOf("") }
    AlertDialog(
      onDismissRequest = { showNewGroupDialog = false },
      title = { Text("Nuovo Gruppo") },
      text = {
        OutlinedTextField(
          value = groupName,
          onValueChange = { groupName = it },
          label = { Text("Nome gruppo") },
          singleLine = true,
          modifier = Modifier.fillMaxWidth(),
        )
      },
      confirmButton = {
        Button(onClick = {
          onCreateGroup(groupName)
          showNewGroupDialog = false
        }) { Text("Crea") }
      },
      dismissButton = {
        TextButton(onClick = { showNewGroupDialog = false }) { Text("Annulla") }
      },
    )
  }

  editingGroupMembers?.let { currentGroup ->
    val liveGroup = groupsWithMembers.firstOrNull { it.group.id == currentGroup.group.id } ?: currentGroup
    val memberIds = liveGroup.members.map { it.id }.toSet()
    AlertDialog(
      onDismissRequest = { editingGroupMembers = null },
      title = { Text("Membri: ${liveGroup.group.name}") },
      text = {
        LazyColumn(modifier = Modifier.height(300.dp)) {
          items(workersWithRate, key = { it.id }) { w ->
            val isMember = memberIds.contains(w.id)
            Row(
              modifier = Modifier
                .fillMaxWidth()
                .clickable { onSetGroupMember(liveGroup.group.id, w.id, !isMember) }
                .padding(vertical = 4.dp),
              verticalAlignment = Alignment.CenterVertically,
            ) {
              Checkbox(
                checked = isMember,
                onCheckedChange = { onSetGroupMember(liveGroup.group.id, w.id, it) },
              )
              Text("${w.surname} ${w.name}".trim())
            }
          }
        }
      },
      confirmButton = {
        Button(onClick = { editingGroupMembers = null }) { Text("Chiudi") }
      },
    )
  }

  groupToDelete?.let { target ->
    AlertDialog(
      onDismissRequest = { groupToDelete = null },
      title = { Text("Elimina Gruppo") },
      text = { Text("Eliminare il gruppo \"${target.group.name}\"?") },
      confirmButton = {
        Button(onClick = {
          onDeleteGroup(target.group.id)
          groupToDelete = null
        }) { Text("Elimina") }
      },
      dismissButton = {
        TextButton(onClick = { groupToDelete = null }) { Text("Annulla") }
      },
    )
  }
}

@Composable
private fun WorkerFormDialog(
  initial: WorkerWithRate?,
  onDismiss: () -> Unit,
  onSave: (surname: String, name: String, phone: String, rate: Double, extra: Double, holiday: Double) -> Unit,
) {
  var surname by remember { mutableStateOf(initial?.surname ?: "") }
  var name by remember { mutableStateOf(initial?.name ?: "") }
  var phone by remember { mutableStateOf(initial?.phoneNumber ?: "") }
  var rate by remember { mutableStateOf(initial?.hourlyRate?.toString() ?: "10.0") }
  var extra by remember { mutableStateOf(initial?.extraHourlyRate?.toString() ?: "12.0") }
  var holiday by remember { mutableStateOf(initial?.holidayHourlyRate?.toString() ?: "15.0") }

  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(if (initial == null) "Nuovo Bracciante" else "Modifica Bracciante") },
    text = {
      Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
          value = surname,
          onValueChange = { surname = it },
          label = { Text("Cognome *") },
          singleLine = true,
          modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
          value = name,
          onValueChange = { name = it },
          label = { Text("Nome") },
          singleLine = true,
          modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
          value = phone,
          onValueChange = { phone = it },
          label = { Text("Telefono") },
          keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
          singleLine = true,
          modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
          OutlinedTextField(
            value = rate,
            onValueChange = { rate = it },
            label = { Text("Ord €/h") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            singleLine = true,
            modifier = Modifier.weight(1f),
          )
          OutlinedTextField(
            value = extra,
            onValueChange = { extra = it },
            label = { Text("Extra €/h") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            singleLine = true,
            modifier = Modifier.weight(1f),
          )
          OutlinedTextField(
            value = holiday,
            onValueChange = { holiday = it },
            label = { Text("Fest €/h") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            singleLine = true,
            modifier = Modifier.weight(1f),
          )
        }
      }
    },
    confirmButton = {
      Button(onClick = {
        onSave(
          surname,
          name,
          phone,
          rate.replace(',', '.').toDoubleOrNull() ?: 0.0,
          extra.replace(',', '.').toDoubleOrNull() ?: 0.0,
          holiday.replace(',', '.').toDoubleOrNull() ?: 0.0,
        )
      }) {
        Text("Salva")
      }
    },
    dismissButton = {
      TextButton(onClick = onDismiss) { Text("Annulla") }
    },
  )
}
