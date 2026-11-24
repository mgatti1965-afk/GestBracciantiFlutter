package com.gestbraccianti.androidnative.data

import com.gestbraccianti.androidnative.domain.DomainHelpers
import com.gestbraccianti.androidnative.domain.HarvestYear
import com.gestbraccianti.androidnative.domain.HarvestYearRepository
import com.gestbraccianti.androidnative.domain.OwnerSettings
import com.gestbraccianti.androidnative.domain.SyncMetadata
import com.gestbraccianti.androidnative.domain.WorkLog
import com.gestbraccianti.androidnative.domain.WorkLogRepository
import com.gestbraccianti.androidnative.domain.Worker
import com.gestbraccianti.androidnative.domain.WorkerRepository
import com.gestbraccianti.androidnative.domain.WorkerWithRate
import com.gestbraccianti.androidnative.domain.WorkerYearConfig
import java.time.LocalDate

class InMemoryAppData : HarvestYearRepository, WorkerRepository, WorkLogRepository {
  private var syncMetadata = SyncMetadata()
  private val settings = OwnerSettings()

  private val years = listOf(
    HarvestYear(id = 2026, isCurrent = true, notes = "Annata seed"),
  )

  private val workers = listOf(
    Worker(id = 1, name = "Mario", surname = "Rossi", phoneNumber = "", isArchived = false),
  )

  private val configs = listOf(
    WorkerYearConfig(
      workerId = 1,
      harvestYearId = 2026,
      hourlyRate = 10.0,
      extraHourlyRate = 12.0,
      holidayHourlyRate = 15.0,
    ),
  )

  private val logs = listOf(
    DomainHelpers.computeWorkLogFromShifts(
      id = 1,
      workerId = 1,
      harvestYearId = 2026,
      date = DomainHelpers.toLocalMidnightMillis(LocalDate.of(2026, 9, 10)),
      morningStart = "08:00",
      morningEnd = "12:00",
      afternoonStart = "13:00",
      afternoonEnd = "17:00",
      hourlyRate = 10.0,
      extraHourlyRate = 12.0,
      holidayHourlyRate = 15.0,
      isManualHoliday = false,
      settings = settings,
    ),
  )

  override fun all(): List<HarvestYear> = years

  override fun current(): HarvestYear? = years.firstOrNull { it.isCurrent }

  override fun allWorkers(): List<Worker> = workers

  override fun workersForYear(yearId: Int): List<WorkerWithRate> {
    val configsByWorker = configs
      .filter { it.harvestYearId == yearId }
      .associateBy { it.workerId }
    return workers.mapNotNull { worker ->
      val cfg = configsByWorker[worker.id] ?: return@mapNotNull null
      WorkerWithRate(
        worker = worker,
        hourlyRate = cfg.hourlyRate,
        extraHourlyRate = cfg.extraHourlyRate,
        holidayHourlyRate = cfg.holidayHourlyRate,
      )
    }
  }

  override fun logsForYear(yearId: Int): List<WorkLog> = logs.filter { it.harvestYearId == yearId }

  fun getSyncMetadata(): SyncMetadata = syncMetadata

  fun recordMutation() {
    syncMetadata = syncMetadata.copy(lastMutationDate = System.currentTimeMillis())
  }

  fun updateLastImportDate(dateStr: String?) {
    syncMetadata = syncMetadata.copy(lastImportDate = dateStr)
  }
}
