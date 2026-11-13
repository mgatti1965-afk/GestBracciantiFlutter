package com.gestbraccianti.androidnative.data

import com.gestbraccianti.androidnative.domain.HarvestYear
import com.gestbraccianti.androidnative.domain.HarvestYearRepository
import com.gestbraccianti.androidnative.domain.SyncMetadata
import com.gestbraccianti.androidnative.domain.WorkLog
import com.gestbraccianti.androidnative.domain.WorkLogRepository
import com.gestbraccianti.androidnative.domain.Worker
import com.gestbraccianti.androidnative.domain.WorkerRepository
import java.time.LocalDate

class InMemoryAppData : HarvestYearRepository, WorkerRepository, WorkLogRepository {
  private var syncMetadata = SyncMetadata()

  private val years = listOf(
    HarvestYear(id = 2026, isCurrent = true, notes = "Annata seed"),
  )

  private val workers = listOf(
    Worker(id = 1, harvestYearId = 2026, name = "Mario", surname = "Rossi", phoneNumber = "", isArchived = false),
  )

  private val logs = listOf(
    WorkLog(
      id = 1,
      workerId = 1,
      harvestYearId = 2026,
      date = LocalDate.of(2026, 9, 10),
      totalHours = 8.0,
      ordinaryHours = 8.0,
      extraHours = 0.0,
      holidayHours = 0.0,
      totalAmount = 80.0,
      isManualHoliday = false,
    ),
  )

  override fun all(): List<HarvestYear> = years

  override fun current(): HarvestYear? = years.firstOrNull { it.isCurrent }

  override fun workersForYear(yearId: Int): List<Worker> = workers.filter { it.harvestYearId == yearId }

  override fun logsForYear(yearId: Int): List<WorkLog> = logs.filter { it.harvestYearId == yearId }

  fun getSyncMetadata(): SyncMetadata = syncMetadata

  fun recordMutation() {
    syncMetadata = syncMetadata.copy(lastMutationDate = System.currentTimeMillis())
  }

  fun updateLastImportDate(dateStr: String?) {
    syncMetadata = syncMetadata.copy(lastImportDate = dateStr)
  }
}
