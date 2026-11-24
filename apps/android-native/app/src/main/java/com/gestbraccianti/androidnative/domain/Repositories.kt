package com.gestbraccianti.androidnative.domain

interface HarvestYearRepository {
  fun all(): List<HarvestYear>
  fun current(): HarvestYear?
}

interface WorkerRepository {
  fun allWorkers(): List<Worker>
  fun workersForYear(yearId: Int): List<WorkerWithRate>
}

interface WorkLogRepository {
  fun logsForYear(yearId: Int): List<WorkLog>
}
