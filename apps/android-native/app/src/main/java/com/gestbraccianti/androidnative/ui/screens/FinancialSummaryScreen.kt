package com.gestbraccianti.androidnative.ui.screens

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.gestbraccianti.androidnative.domain.DomainCalculator
import com.gestbraccianti.androidnative.domain.DomainHelpers
import com.gestbraccianti.androidnative.domain.OwnerSettings
import com.gestbraccianti.androidnative.domain.WorkLog
import com.gestbraccianti.androidnative.domain.Worker
import com.gestbraccianti.androidnative.domain.WorkerGroupWithMembers
import com.gestbraccianti.androidnative.ui.print.GroupingType
import com.gestbraccianti.androidnative.ui.print.PrintReportHelper
import com.gestbraccianti.androidnative.ui.print.SummaryFilterPeriod
import com.gestbraccianti.androidnative.ui.print.SummaryViewMode
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.WeekFields
import java.util.Locale

private val IT_MONTH_FMT = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.forLanguageTag("it-IT"))
private val IT_DATE_FMT = DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.forLanguageTag("it-IT"))

@Composable
fun FinancialSummaryScreen(
  yearId: Int,
  logs: List<WorkLog>,
  allWorkers: List<Worker>,
  groups: List<WorkerGroupWithMembers>,
  settings: OwnerSettings,
  defaultDateMillis: Long,
  modifier: Modifier = Modifier,
) {
  val context = LocalContext.current
  var filterPeriod by remember(yearId) { mutableStateOf(SummaryFilterPeriod.YEAR) }
  var referenceDate by remember(yearId) {
    mutableStateOf(
      DomainHelpers.millisToLocalDate(defaultDateMillis).let {
        if (it.year == yearId) it else LocalDate.of(yearId, 1, 1)
      },
    )
  }
  var groupingType by remember { mutableStateOf(GroupingType.BY_WORKER) }
  var viewMode by remember { mutableStateOf(SummaryViewMode.DETAIL) }

  val workerMap = remember(allWorkers) { allWorkers.associateBy { it.id } }

  val filteredLogs = remember(logs, filterPeriod, referenceDate) {
    when (filterPeriod) {
      SummaryFilterPeriod.YEAR -> logs
      SummaryFilterPeriod.MONTH -> logs.filter {
        val d = DomainHelpers.millisToLocalDate(it.date)
        d.year == referenceDate.year && d.monthValue == referenceDate.monthValue
      }
      SummaryFilterPeriod.WEEK -> {
        val weekStart = referenceDate.with(DayOfWeek.MONDAY)
        val weekEnd = weekStart.plusDays(6)
        logs.filter {
          val d = DomainHelpers.millisToLocalDate(it.date)
          !d.isBefore(weekStart) && !d.isAfter(weekEnd)
        }
      }
      SummaryFilterPeriod.DAY -> {
        val targetMillis = DomainHelpers.toLocalMidnightMillis(referenceDate)
        logs.filter { it.date == targetMillis }
      }
    }
  }

  val periodLabel = remember(filterPeriod, referenceDate, yearId) {
    when (filterPeriod) {
      SummaryFilterPeriod.YEAR -> "Annata $yearId"
      SummaryFilterPeriod.MONTH -> DomainCalculator.capitalizeWords(IT_MONTH_FMT.format(referenceDate))
      SummaryFilterPeriod.WEEK -> {
        val weekNo = referenceDate.get(WeekFields.ISO.weekOfWeekBasedYear())
        "Settimana $weekNo, ${referenceDate.year}"
      }
      SummaryFilterPeriod.DAY -> IT_DATE_FMT.format(referenceDate)
    }
  }

  val totalAmount = filteredLogs.sumOf { it.totalAmount }
  val totalHours = filteredLogs.sumOf { it.totalHours }
  val totalOrd = filteredLogs.sumOf { it.ordinaryHours }
  val totalExt = filteredLogs.sumOf { it.extraHours }
  val totalHol = filteredLogs.sumOf { it.holidayHours }

  Column(
    modifier = modifier
      .fillMaxSize()
      .padding(12.dp),
    verticalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    // Period chips
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .horizontalScroll(rememberScrollState()),
      horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
      SummaryFilterPeriod.entries.forEach { p ->
        FilterChip(
          selected = filterPeriod == p,
          onClick = { filterPeriod = p },
          label = { Text(p.label) },
        )
      }
    }

    // Period navigation + print button
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        if (filterPeriod != SummaryFilterPeriod.YEAR) {
          IconButton(onClick = {
            referenceDate = when (filterPeriod) {
              SummaryFilterPeriod.MONTH -> referenceDate.minusMonths(1)
              SummaryFilterPeriod.WEEK -> referenceDate.minusWeeks(1)
              SummaryFilterPeriod.DAY -> referenceDate.minusDays(1)
              SummaryFilterPeriod.YEAR -> referenceDate
            }
          }) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = "Precedente")
          }
        }
        Text(
          text = periodLabel,
          style = MaterialTheme.typography.titleMedium,
          fontWeight = FontWeight.Bold,
        )
        if (filterPeriod != SummaryFilterPeriod.YEAR) {
          IconButton(onClick = {
            referenceDate = when (filterPeriod) {
              SummaryFilterPeriod.MONTH -> referenceDate.plusMonths(1)
              SummaryFilterPeriod.WEEK -> referenceDate.plusWeeks(1)
              SummaryFilterPeriod.DAY -> referenceDate.plusDays(1)
              SummaryFilterPeriod.YEAR -> referenceDate
            }
          }) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Successivo")
          }
        }
      }

      Button(
        onClick = {
          PrintReportHelper.printSummaryReport(
            context = context,
            jobName = "GestBraccianti_${periodLabel.replace(" ", "_")}",
            periodLabel = periodLabel,
            logs = filteredLogs,
            allWorkers = allWorkers,
            groups = groups,
            settings = settings,
            groupingType = groupingType,
            viewMode = viewMode,
          )
        },
        enabled = filteredLogs.isNotEmpty(),
      ) {
        Text("Stampa / PDF")
      }
    }

    // Grouping & view mode chips
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      GroupingType.entries.forEach { g ->
        FilterChip(
          selected = groupingType == g,
          onClick = { groupingType = g },
          label = { Text(g.label) },
        )
      }
      if (groupingType == GroupingType.BY_WORKER) {
        SummaryViewMode.entries.forEach { v ->
          FilterChip(
            selected = viewMode == v,
            onClick = { viewMode = v },
            label = { Text(v.label) },
          )
        }
      }
    }

    // Grand total summary card
    Card(
      modifier = Modifier.fillMaxWidth(),
      colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
    ) {
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .padding(12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Column {
          Text(
            text = "Totale Ore: ${DomainCalculator.formatHoursLabel(totalHours)}",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
          )
          Text(
            text = "Ord: ${DomainCalculator.formatHoursLabel(totalOrd)} | " +
              "Extra: ${DomainCalculator.formatHoursLabel(totalExt)} | " +
              "Fest: ${DomainCalculator.formatHoursLabel(totalHol)}",
            style = MaterialTheme.typography.bodySmall,
          )
        }
        Text(
          text = DomainCalculator.formatCurrencyIt(totalAmount),
          style = MaterialTheme.typography.titleLarge,
          fontWeight = FontWeight.Bold,
          color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
      }
    }

    if (filteredLogs.isEmpty()) {
      Box(
        modifier = Modifier
          .fillMaxWidth()
          .weight(1f),
        contentAlignment = Alignment.Center,
      ) {
        Text(
          text = "Nessun movimento nel periodo selezionato.",
          style = MaterialTheme.typography.bodyMedium,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
    } else if (groupingType == GroupingType.BY_GROUP) {
      val nonEmptyGroups = remember(groups, filteredLogs) {
        groups.mapNotNull { gwm ->
          val ids = gwm.members.map { it.id }.toSet()
          val gLogs = filteredLogs.filter { ids.contains(it.workerId) }
          if (gLogs.isEmpty()) null else gwm to gLogs
        }
      }
      LazyColumn(
        modifier = Modifier.weight(1f),
        verticalArrangement = Arrangement.spacedBy(8.dp),
      ) {
        items(nonEmptyGroups, key = { it.first.group.id }) { (gwm, gLogs) ->
          Card(
            modifier = Modifier.fillMaxWidth(),
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
                Text(gwm.group.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(
                  text = "${gLogs.size} giornate • ${DomainCalculator.formatHoursLabel(gLogs.sumOf { it.totalHours })}",
                  style = MaterialTheme.typography.bodySmall,
                )
              }
              Text(
                text = DomainCalculator.formatCurrencyIt(gLogs.sumOf { it.totalAmount }),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
              )
            }
          }
        }
      }
    } else {
      val groupedByWorker = remember(filteredLogs, workerMap) {
        filteredLogs.groupBy { it.workerId }
          .entries
          .sortedBy { DomainHelpers.workerFullName(workerMap[it.key], it.key) }
          .map { it.key to it.value.sortedByDescending { l -> l.date } }
      }
      LazyColumn(
        modifier = Modifier.weight(1f),
        verticalArrangement = Arrangement.spacedBy(8.dp),
      ) {
        items(groupedByWorker, key = { it.first }) { (workerId, wLogs) ->
          val workerName = DomainHelpers.workerFullName(workerMap[workerId], workerId)
          Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
          ) {
            Column(modifier = Modifier.padding(12.dp)) {
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
              ) {
                Column(modifier = Modifier.weight(1f)) {
                  Text(workerName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                  Text(
                    text = "${wLogs.size} gg • ${DomainCalculator.formatHoursLabel(wLogs.sumOf { it.totalHours })}",
                    style = MaterialTheme.typography.bodySmall,
                  )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                  Text(
                    text = DomainCalculator.formatCurrencyIt(wLogs.sumOf { it.totalAmount }),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                  )
                  TextButton(
                    onClick = {
                      PrintReportHelper.printSummaryReport(
                        context = context,
                        jobName = "GestBraccianti_${workerName.replace(" ", "_")}",
                        periodLabel = periodLabel,
                        logs = filteredLogs,
                        allWorkers = allWorkers,
                        groups = groups,
                        settings = settings,
                        groupingType = GroupingType.BY_WORKER,
                        viewMode = SummaryViewMode.DETAIL,
                        selectedWorkerId = workerId,
                      )
                    },
                  ) {
                    Text("PDF")
                  }
                }
              }
              if (viewMode == SummaryViewMode.DETAIL) {
                Spacer(Modifier.height(6.dp))
                HorizontalDivider()
                Spacer(Modifier.height(4.dp))
                wLogs.forEach { log ->
                  val dStr = IT_DATE_FMT.format(DomainHelpers.millisToLocalDate(log.date))
                  Row(
                    modifier = Modifier
                      .fillMaxWidth()
                      .padding(vertical = 2.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                  ) {
                    Text(
                      text = "$dStr (${DomainCalculator.formatHoursLabel(log.totalHours)})",
                      style = MaterialTheme.typography.bodySmall,
                    )
                    Text(
                      text = DomainCalculator.formatCurrencyIt(log.totalAmount),
                      style = MaterialTheme.typography.bodySmall,
                      fontWeight = FontWeight.SemiBold,
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
