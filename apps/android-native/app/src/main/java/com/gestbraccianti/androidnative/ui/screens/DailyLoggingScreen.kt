package com.gestbraccianti.androidnative.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.gestbraccianti.androidnative.domain.DomainCalculator
import com.gestbraccianti.androidnative.domain.DomainHelpers
import com.gestbraccianti.androidnative.domain.OwnerSettings
import com.gestbraccianti.androidnative.domain.WorkLog
import com.gestbraccianti.androidnative.domain.Worker
import com.gestbraccianti.androidnative.ui.theme.HolidayBg
import com.gestbraccianti.androidnative.ui.theme.HolidayRed
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

private val IT_MONTH_YEAR = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.forLanguageTag("it-IT"))
private val IT_FULL_DATE = DateTimeFormatter.ofPattern("EEE dd MMM yyyy", Locale.forLanguageTag("it-IT"))

@Composable
fun DailyLoggingScreen(
  yearId: Int,
  logs: List<WorkLog>,
  allWorkers: List<Worker>,
  settings: OwnerSettings,
  defaultDateMillis: Long,
  onOpenDayDetail: (Long) -> Unit,
  onToggleGlobalHoliday: (Long) -> Unit,
  modifier: Modifier = Modifier,
) {
  val initialDate = remember(yearId, defaultDateMillis) {
    val d = DomainHelpers.millisToLocalDate(defaultDateMillis)
    if (d.year == yearId) d else LocalDate.of(yearId, 1, 1)
  }
  var currentMonth by remember(yearId) { mutableIntStateOf(initialDate.monthValue) }
  var selectedDate by remember(yearId) { mutableStateOf<LocalDate?>(initialDate) }
  var isCalendarExpanded by remember { mutableStateOf(true) }

  val workerMap = remember(allWorkers) { allWorkers.associateBy { it.id } }
  val globalFestiveSet = remember(settings.globalFestiveDates) { settings.globalFestiveDates.toSet() }
  val logsByDate = remember(logs) { logs.groupBy { it.date } }

  val yearMonth = YearMonth.of(yearId, currentMonth)
  val firstDayOfMonth = yearMonth.atDay(1)
  val leadingEmptyDays = (firstDayOfMonth.dayOfWeek.value - 1) // Monday = 0
  val daysInMonth = yearMonth.lengthOfMonth()

  val monthLogs = remember(logs, yearId, currentMonth) {
    logs.filter {
      val d = DomainHelpers.millisToLocalDate(it.date)
      d.year == yearId && d.monthValue == currentMonth
    }
  }
  val displayedLogs = remember(selectedDate, monthLogs, logsByDate) {
    val sel = selectedDate
    if (sel != null && sel.monthValue == currentMonth) {
      logsByDate[DomainHelpers.toLocalMidnightMillis(sel)].orEmpty()
    } else {
      monthLogs
    }
  }

  Scaffold(
    modifier = modifier.fillMaxSize(),
    floatingActionButton = {
      FloatingActionButton(
        onClick = {
          val target = selectedDate ?: firstDayOfMonth
          onOpenDayDetail(DomainHelpers.toLocalMidnightMillis(target))
        },
      ) {
        Icon(Icons.Default.Add, contentDescription = "Registra giornata")
      }
    },
  ) { innerPadding ->
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(innerPadding)
        .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
      // Month navigation header
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
      ) {
        IconButton(
          onClick = { if (currentMonth > 1) currentMonth -= 1 },
          enabled = currentMonth > 1,
        ) {
          Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = "Mese precedente")
        }
        Text(
          text = DomainCalculator.capitalizeWords(IT_MONTH_YEAR.format(firstDayOfMonth)),
          style = MaterialTheme.typography.titleMedium,
          fontWeight = FontWeight.Bold,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
          TextButton(onClick = { isCalendarExpanded = !isCalendarExpanded }) {
            Text(if (isCalendarExpanded) "Comprimi" else "Espandi")
          }
          IconButton(
            onClick = { if (currentMonth < 12) currentMonth += 1 },
            enabled = currentMonth < 12,
          ) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Mese successivo")
          }
        }
      }

      if (isCalendarExpanded) {
        Row(modifier = Modifier.fillMaxWidth()) {
          listOf("Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom").forEach { dayName ->
            Text(
              text = dayName,
              modifier = Modifier.weight(1f),
              textAlign = TextAlign.Center,
              style = MaterialTheme.typography.labelSmall,
              fontWeight = FontWeight.SemiBold,
            )
          }
        }
        Spacer(Modifier.height(4.dp))

        val totalCells = leadingEmptyDays + daysInMonth
        val rowsCount = (totalCells + 6) / 7
        for (rowIdx in 0 until rowsCount) {
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
          ) {
            for (colIdx in 0 until 7) {
              val cellIndex = rowIdx * 7 + colIdx
              val dayNumber = cellIndex - leadingEmptyDays + 1
              if (dayNumber in 1..daysInMonth) {
                val cellDate = yearMonth.atDay(dayNumber)
                val cellMillis = DomainHelpers.toLocalMidnightMillis(cellDate)
                val dayLogs = logsByDate[cellMillis].orEmpty()
                val isSelected = selectedDate == cellDate
                val isManual = dayLogs.any { it.isManualHoliday }
                val isFestive = DomainCalculator.isDateFestive(
                  dateMillis = cellMillis,
                  isManual = isManual,
                  festiveType = settings.festiveDaysType,
                  globalFestiveDates = globalFestiveSet,
                )

                Card(
                  modifier = Modifier
                    .weight(1f)
                    .aspectRatio(1f)
                    .padding(vertical = 2.dp)
                    .clip(MaterialTheme.shapes.small)
                    .clickable {
                      selectedDate = if (isSelected) null else cellDate
                    },
                  border = if (isSelected) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
                  colors = CardDefaults.cardColors(
                    containerColor = when {
                      isFestive -> HolidayBg
                      dayLogs.isNotEmpty() -> MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
                      else -> MaterialTheme.colorScheme.surface
                    },
                  ),
                ) {
                  Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                  ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                      Text(
                        text = dayNumber.toString(),
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = if (isSelected || dayLogs.isNotEmpty()) FontWeight.Bold else FontWeight.Normal,
                        color = if (isFestive) HolidayRed else MaterialTheme.colorScheme.onSurface,
                      )
                      if (dayLogs.isNotEmpty()) {
                        Text(
                          text = "${dayLogs.size}x",
                          style = MaterialTheme.typography.labelSmall,
                          color = MaterialTheme.colorScheme.primary,
                        )
                      }
                    }
                  }
                }
              } else {
                Spacer(modifier = Modifier.weight(1f))
              }
            }
          }
        }
      }

      Spacer(Modifier.height(8.dp))

      // Selected day action bar
      selectedDate?.let { sel ->
        val selMillis = DomainHelpers.toLocalMidnightMillis(sel)
        val isFestive = DomainCalculator.isDateFestive(
          dateMillis = selMillis,
          isManual = false,
          festiveType = settings.festiveDaysType,
          globalFestiveDates = globalFestiveSet,
        )
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.spacedBy(8.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          OutlinedButton(
            onClick = { onToggleGlobalHoliday(selMillis) },
            modifier = Modifier.weight(1f),
          ) {
            Text(if (isFestive) "Rimuovi Festivo" else "Segna Festivo")
          }
          Button(
            onClick = { onOpenDayDetail(selMillis) },
            modifier = Modifier.weight(1f),
          ) {
            Text("Modifica Giorno")
          }
        }
        Spacer(Modifier.height(8.dp))
      }

      Text(
        text = selectedDate?.let {
          "Movimenti del ${IT_FULL_DATE.format(it)} (${displayedLogs.size})"
        } ?: "Movimenti del mese (${displayedLogs.size})",
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
      )
      Spacer(Modifier.height(6.dp))

      if (displayedLogs.isEmpty()) {
        Box(
          modifier = Modifier
            .fillMaxWidth()
            .weight(1f),
          contentAlignment = Alignment.Center,
        ) {
          Text(
            text = "Nessuna registrazione trovata.\nTocca + per inserire ore.",
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
          )
        }
      } else {
        LazyColumn(
          modifier = Modifier.weight(1f),
          verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
          items(displayedLogs, key = { it.id }) { log ->
            val worker = workerMap[log.workerId]
            val logDate = DomainHelpers.millisToLocalDate(log.date)
            Card(
              modifier = Modifier
                .fillMaxWidth()
                .clickable { onOpenDayDetail(log.date) },
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
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                  )
                  Text(
                    text = "${IT_FULL_DATE.format(logDate)} • ${DomainCalculator.formatHoursLabel(log.totalHours)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                  )
                  val shiftText = buildString {
                    if (log.morningStart != null && log.morningEnd != null) {
                      append("M: ${log.morningStart}-${log.morningEnd}")
                    }
                    if (log.afternoonStart != null && log.afternoonEnd != null) {
                      if (isNotEmpty()) append(" | ")
                      append("P: ${log.afternoonStart}-${log.afternoonEnd}")
                    }
                  }
                  if (shiftText.isNotEmpty()) {
                    Text(
                      text = shiftText,
                      style = MaterialTheme.typography.labelSmall,
                      color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                  }
                }
                Column(horizontalAlignment = Alignment.End) {
                  Text(
                    text = DomainCalculator.formatCurrencyIt(log.totalAmount),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                  )
                  if (log.holidayHours > 0) {
                    Text(
                      text = "Festivo",
                      style = MaterialTheme.typography.labelSmall,
                      color = HolidayRed,
                      modifier = Modifier
                        .background(HolidayBg, MaterialTheme.shapes.extraSmall)
                        .padding(horizontal = 6.dp, vertical = 1.dp),
                    )
                  } else if (log.extraHours > 0) {
                    Text(
                      text = "Extra: ${DomainCalculator.formatHoursLabel(log.extraHours)}",
                      style = MaterialTheme.typography.labelSmall,
                      color = MaterialTheme.colorScheme.secondary,
                    )
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
