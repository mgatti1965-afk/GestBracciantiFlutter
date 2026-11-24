package com.gestbraccianti.androidnative.ui.print

import com.gestbraccianti.androidnative.domain.DomainHelpers
import com.gestbraccianti.androidnative.domain.OwnerSettings
import com.gestbraccianti.androidnative.domain.Worker
import com.gestbraccianti.androidnative.domain.WorkerGroup
import com.gestbraccianti.androidnative.domain.WorkerGroupWithMembers
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class PrintReportHelperTest {
  @Test
  fun `buildSummaryHtml renders company name, worker rows and totals`() {
    val worker = Worker(id = 1, name = "Mario", surname = "Rossi", phoneNumber = "", isArchived = false)
    val settings = OwnerSettings(ownerName = "Azienda", ownerSurname = "Verde")
    val date = DomainHelpers.toLocalMidnightMillis(LocalDate.of(2026, 9, 10))
    val log = DomainHelpers.computeWorkLogFromShifts(
      id = 1,
      workerId = 1,
      harvestYearId = 2026,
      date = date,
      morningStart = "08:00",
      morningEnd = "12:00",
      afternoonStart = "13:00",
      afternoonEnd = "17:00",
      hourlyRate = 10.0,
      extraHourlyRate = 12.0,
      holidayHourlyRate = 15.0,
      isManualHoliday = false,
      settings = settings,
    )
    val html = PrintReportHelper.buildSummaryHtml(
      periodLabel = "Annata 2026",
      logs = listOf(log),
      allWorkers = listOf(worker),
      groups = listOf(WorkerGroupWithMembers(WorkerGroup(1, "Squadra A", 2026), listOf(worker))),
      settings = settings,
      groupingType = GroupingType.BY_WORKER,
      viewMode = SummaryViewMode.DETAIL,
    )

    assertTrue(html.contains("Verde Azienda - Riepilogo Compensi"))
    assertTrue(html.contains("Rossi Mario"))
    assertTrue(html.contains("TOTALE GENERALE"))
  }
}
