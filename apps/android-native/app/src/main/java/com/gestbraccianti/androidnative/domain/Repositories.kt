package com.gestbraccianti.androidnative.domain

interface HarvestYearRepository {
  fun all(): List<HarvestYear>
  fun current(): HarvestYear?
}

interface WorkerRepository {
  fun workersForYear(yearId: Int): List<Worker>
}

interface WorkLogRepository {
  fun logsForYear(yearId: Int): List<WorkLog>
}
