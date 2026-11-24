package com.gestbraccianti.androidnative.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
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
import androidx.compose.ui.unit.dp
import com.gestbraccianti.androidnative.domain.DomainCalculator
import com.gestbraccianti.androidnative.domain.DomainHelpers
import com.gestbraccianti.androidnative.domain.WorkLog
import com.gestbraccianti.androidnative.domain.WorkerGroupWithMembers
import com.gestbraccianti.androidnative.domain.WorkerWithRate
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val IT_DAY_FMT = DateTimeFormatter.ofPattern("EEE dd MMM yyyy", Locale.forLanguageTag("it-IT"))

@Composable
fun WorkDayDetailScreen(
  yearId: Int,
  initialDateMillis: Long,
  workers: List<WorkerWithRate>,
  groups: List<WorkerGroupWithMembers>,
  logsForYear: List<WorkLog>,
  onBack: () -> Unit,
  onSaveSingleLog: (
    id: Int?,
    workerId: Int,
    date: Long,
    morningStart: String?,
    morningEnd: String?,
    afternoonStart: String?,
    afternoonEnd: String?,
  ) -> Unit,
  onSaveRangeLogs: (
    workerIds: List<Int>,
    startDate: Long,
    endDate: Long,
    morningStart: String?,
    morningEnd: String?,
    afternoonStart: String?,
    afternoonEnd: String?,
  ) -> Unit,
  onDeleteLog: (Int) -> Unit,
  onToggleManualHoliday: (Int) -> Unit,
  modifier: Modifier = Modifier,
) {
  var currentDate by remember(initialDateMillis) {
    mutableStateOf(DomainHelpers.millisToLocalDate(initialDateMillis))
  }
  var isRangeMode by remember { mutableStateOf(false) }
  var endDate by remember(initialDateMillis) {
    mutableStateOf(DomainHelpers.millisToLocalDate(initialDateMillis))
  }

  var editingLogId by remember { mutableStateOf<Int?>(null) }
  var selectedWorkerIds by remember { mutableStateOf(setOf<Int>()) }

  var morningStart by remember { mutableStateOf<String?>("08:00") }
  var morningEnd by remember { mutableStateOf<String?>("12:00") }
  var afternoonStart by remember { mutableStateOf<String?>("13:00") }
  var afternoonEnd by remember { mutableStateOf<String?>("17:00") }

  val currentDateMillis = DomainHelpers.toLocalMidnightMillis(currentDate)
  val dayLogs = remember(logsForYear, currentDateMillis) {
    logsForYear.filter { it.date == currentDateMillis }
  }
  val activeWorkers = remember(workers) { workers.filter { !it.isArchived } }
  val workerMap = remember(workers) { workers.associateBy { it.id } }

  val previewHours = DomainCalculator.calculateShiftHours(
    morningStart = morningStart,
    morningEnd = morningEnd,
    afternoonStart = afternoonStart,
    afternoonEnd = afternoonEnd,
  )

  Column(
    modifier = modifier
      .fillMaxSize()
      .verticalScroll(rememberScrollState())
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    // Top header with back & date navigation
    Row(
      modifier = Modifier.fillMaxWidth(),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.SpaceBetween,
    ) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) {
          Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Indietro")
        }
        Text(
          text = "Dettaglio Giornata",
          style = MaterialTheme.typography.titleMedium,
          fontWeight = FontWeight.Bold,
        )
      }
      Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(
          onClick = {
            val prev = currentDate.minusDays(1)
            if (prev.year == yearId) {
              currentDate = prev
              editingLogId = null
            }
          },
          enabled = currentDate.minusDays(1).year == yearId,
        ) {
          Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = "Giorno precedente")
        }
        Text(
          text = IT_DAY_FMT.format(currentDate),
          style = MaterialTheme.typography.bodyMedium,
          fontWeight = FontWeight.SemiBold,
        )
        IconButton(
          onClick = {
            val next = currentDate.plusDays(1)
            if (next.year == yearId) {
              currentDate = next
              editingLogId = null
            }
          },
          enabled = currentDate.plusDays(1).year == yearId,
        ) {
          Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Giorno successivo")
        }
      }
    }

    // Range mode toggle
    Card(
      modifier = Modifier.fillMaxWidth(),
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
      Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Text("Inserimento su più giorni (Range)", style = MaterialTheme.typography.bodyMedium)
          Switch(
            checked = isRangeMode,
            onCheckedChange = {
              isRangeMode = it
              if (it) {
                editingLogId = null
                if (endDate.isBefore(currentDate)) endDate = currentDate
              }
            },
          )
        }
        if (isRangeMode) {
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Text("Fine periodo: ${IT_DAY_FMT.format(endDate)}", style = MaterialTheme.typography.bodySmall)
            Row {
              OutlinedButton(
                onClick = { if (endDate.isAfter(currentDate)) endDate = endDate.minusDays(1) },
                enabled = endDate.isAfter(currentDate),
              ) { Text("-1g") }
              Spacer(Modifier.padding(horizontal = 4.dp))
              OutlinedButton(
                onClick = { if (endDate.plusDays(1).year == yearId) endDate = endDate.plusDays(1) },
                enabled = endDate.plusDays(1).year == yearId,
              ) { Text("+1g") }
            }
          }
        }
      }
    }

    // Shift controls
    Card(
      modifier = Modifier.fillMaxWidth(),
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
      Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Text("Orari Turni", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
          Text(
            text = "Totale: ${DomainCalculator.formatHoursLabel(previewHours)}",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
          )
        }
        ShiftTimeRow(
          label = "Mattina Inizio",
          value = morningStart,
          defaultValue = "08:00",
          onChange = { morningStart = it },
        )
        ShiftTimeRow(
          label = "Mattina Fine",
          value = morningEnd,
          defaultValue = "12:00",
          onChange = { morningEnd = it },
        )
        HorizontalDivider()
        ShiftTimeRow(
          label = "Pomeriggio Inizio",
          value = afternoonStart,
          defaultValue = "13:00",
          onChange = { afternoonStart = it },
        )
        ShiftTimeRow(
          label = "Pomeriggio Fine",
          value = afternoonEnd,
          defaultValue = "17:00",
          onChange = { afternoonEnd = it },
        )
      }
    }

    // Group quick select + Workers selection
    Card(
      modifier = Modifier.fillMaxWidth(),
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
      Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
          text = if (editingLogId != null) "Modifica Bracciante" else "Seleziona Braccianti (${selectedWorkerIds.size})",
          style = MaterialTheme.typography.titleSmall,
          fontWeight = FontWeight.Bold,
        )

        if (groups.isNotEmpty() && editingLogId == null) {
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
          ) {
            groups.forEach { gwm ->
              val groupMemberIds = gwm.members.map { it.id }.toSet()
              val allSelected = groupMemberIds.isNotEmpty() && groupMemberIds.all { selectedWorkerIds.contains(it) }
              FilterChip(
                selected = allSelected,
                onClick = {
                  selectedWorkerIds = if (allSelected) {
                    selectedWorkerIds - groupMemberIds
                  } else {
                    selectedWorkerIds + groupMemberIds
                  }
                },
                label = { Text("${gwm.group.name} (${gwm.members.size})") },
              )
            }
          }
        }

        if (activeWorkers.isEmpty()) {
          Text(
            text = "Nessun bracciante attivo per l'annata $yearId. Aggiungili nella scheda Braccianti.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
          )
        } else {
          activeWorkers.forEach { w ->
            val checked = selectedWorkerIds.contains(w.id)
            Row(
              modifier = Modifier
                .fillMaxWidth()
                .clickable {
                  selectedWorkerIds = if (editingLogId != null) {
                    setOf(w.id)
                  } else if (checked) {
                    selectedWorkerIds - w.id
                  } else {
                    selectedWorkerIds + w.id
                  }
                }
                .padding(vertical = 2.dp),
              verticalAlignment = Alignment.CenterVertically,
            ) {
              Checkbox(
                checked = checked,
                onCheckedChange = { isChecked ->
                  selectedWorkerIds = if (editingLogId != null) {
                    setOf(w.id)
                  } else if (isChecked) {
                    selectedWorkerIds + w.id
                  } else {
                    selectedWorkerIds - w.id
                  }
                },
              )
              Text(
                text = "${w.surname} ${w.name}".trim(),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
              )
              Text(
                text = "${DomainCalculator.formatCurrencyIt(w.hourlyRate)}/h",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
              )
            }
          }
        }

        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
          if (editingLogId != null) {
            OutlinedButton(
              onClick = { editingLogId = null },
              modifier = Modifier.weight(1f),
            ) {
              Text("Annulla Modifica")
            }
          }
          Button(
            onClick = {
              if (selectedWorkerIds.isEmpty()) return@Button
              if (isRangeMode) {
                onSaveRangeLogs(
                  selectedWorkerIds.toList(),
                  currentDateMillis,
                  DomainHelpers.toLocalMidnightMillis(endDate),
                  morningStart,
                  morningEnd,
                  afternoonStart,
                  afternoonEnd,
                )
              } else if (editingLogId != null) {
                onSaveSingleLog(
                  editingLogId,
                  selectedWorkerIds.first(),
                  currentDateMillis,
                  morningStart,
                  morningEnd,
                  afternoonStart,
                  afternoonEnd,
                )
                editingLogId = null
              } else {
                selectedWorkerIds.forEach { wId ->
                  onSaveSingleLog(
                    null,
                    wId,
                    currentDateMillis,
                    morningStart,
                    morningEnd,
                    afternoonStart,
                    afternoonEnd,
                  )
                }
              }
            },
            enabled = selectedWorkerIds.isNotEmpty() && previewHours > 0.0,
            modifier = Modifier.weight(1f),
          ) {
            Text(
              when {
                isRangeMode -> "Salva Periodo"
                editingLogId != null -> "Aggiorna Log"
                else -> "Salva (${selectedWorkerIds.size})"
              },
            )
          }
        }
      }
    }

    // Existing logs for this day
    Text(
      text = "Registrazioni del giorno (${dayLogs.size})",
      style = MaterialTheme.typography.titleSmall,
      fontWeight = FontWeight.Bold,
    )
    dayLogs.forEach { log ->
      val worker = workerMap[log.workerId]?.worker
      Card(
        modifier = Modifier
          .fillMaxWidth()
          .clickable {
            editingLogId = log.id
            selectedWorkerIds = setOf(log.workerId)
            morningStart = log.morningStart
            morningEnd = log.morningEnd
            afternoonStart = log.afternoonStart
            afternoonEnd = log.afternoonEnd
            isRangeMode = false
          },
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
              text = DomainHelpers.workerFullName(worker, log.workerId),
              style = MaterialTheme.typography.bodyMedium,
              fontWeight = FontWeight.Bold,
            )
            Text(
              text = "${DomainCalculator.formatHoursLabel(log.totalHours)} • ${DomainCalculator.formatCurrencyIt(log.totalAmount)}",
              style = MaterialTheme.typography.bodySmall,
            )
          }
          Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { onToggleManualHoliday(log.id) }) {
              Text(if (log.isManualHoliday) "Festivo ON" else "Festivo OFF")
            }
            IconButton(onClick = { onDeleteLog(log.id) }) {
              Icon(
                Icons.Default.Delete,
                contentDescription = "Elimina log",
                tint = MaterialTheme.colorScheme.error,
              )
            }
          }
        }
      }
    }
  }
}

@Composable
private fun ShiftTimeRow(
  label: String,
  value: String?,
  defaultValue: String,
  onChange: (String?) -> Unit,
) {
  Row(
    modifier = Modifier.fillMaxWidth(),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Column(modifier = Modifier.weight(1f)) {
      Text(text = label, style = MaterialTheme.typography.bodySmall)
      Text(
        text = value ?: "--:--",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
      )
    }
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
      OutlinedButton(onClick = { onChange(stepTime(value ?: defaultValue, -15)) }) {
        Text("-15'")
      }
      OutlinedButton(onClick = { onChange(stepTime(value ?: defaultValue, +15)) }) {
        Text("+15'")
      }
      TextButton(onClick = { onChange(null) }) {
        Text("Clear")
      }
    }
  }
}

private fun stepTime(current: String, deltaMinutes: Int): String {
  val minutes = DomainCalculator.parseTimeToMinutes(current) ?: (8 * 60)
  val next = (minutes + deltaMinutes).coerceIn(0, 23 * 60 + 45)
  val h = next / 60
  val m = next % 60
  return "%02d:%02d".format(h, m)
}
