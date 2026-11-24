package com.gestbraccianti.androidnative.domain

enum class FestiveDaysType(val code: Int) {
  NONE(0),
  SATURDAY(1),
  SUNDAY(2),
  SATURDAY_AND_SUNDAY(3);

  companion object {
    fun fromCode(code: Int): FestiveDaysType =
      entries.firstOrNull { it.code == code } ?: SATURDAY_AND_SUNDAY
  }
}

data class HarvestYear(
  val id: Int,
  val isCurrent: Boolean,
  val notes: String,
)

data class Worker(
  val id: Int,
  val name: String,
  val surname: String,
  val phoneNumber: String,
  val isArchived: Boolean,
)

data class WorkerYearConfig(
  val workerId: Int,
  val harvestYearId: Int,
  val hourlyRate: Double,
  val extraHourlyRate: Double,
  val holidayHourlyRate: Double,
)

data class WorkerWithRate(
  val worker: Worker,
  val hourlyRate: Double,
  val extraHourlyRate: Double,
  val holidayHourlyRate: Double,
) {
  val id: Int get() = worker.id
  val name: String get() = worker.name
  val surname: String get() = worker.surname
  val phoneNumber: String get() = worker.phoneNumber
  val isArchived: Boolean get() = worker.isArchived
}

data class WorkerGroup(
  val id: Int,
  val name: String,
  val yearId: Int,
)

data class WorkerGroupMember(
  val groupId: Int,
  val workerId: Int,
)

data class WorkerGroupWithMembers(
  val group: WorkerGroup,
  val members: List<Worker>,
)

data class Plantation(
  val id: Int,
  val name: String,
  val isArchived: Boolean,
)

data class WorkLog(
  val id: Int,
  val workerId: Int,
  val harvestYearId: Int,
  val date: Long,
  val morningStart: String?,
  val morningEnd: String?,
  val afternoonStart: String?,
  val afternoonEnd: String?,
  val totalHours: Double,
  val ordinaryHours: Double,
  val extraHours: Double,
  val holidayHours: Double,
  val hourlyRate: Double,
  val extraHourlyRate: Double,
  val holidayHourlyRate: Double,
  val totalAmount: Double,
  val ordinaryAmount: Double,
  val extraAmount: Double,
  val holidayAmount: Double,
  val isManualHoliday: Boolean,
)

data class OwnerSettings(
  val ownerName: String = "",
  val ownerSurname: String = "",
  val extraHoursThreshold: Double = 8.0,
  val festiveDaysType: FestiveDaysType = FestiveDaysType.SATURDAY_AND_SUNDAY,
  val globalFestiveDates: List<Long> = emptyList(),
  val saveCountSinceBackup: Int = 0,
  val lastImportDate: String? = null,
  val lastMutationDate: Long = 0L,
  val lastExportDate: Long? = null,
)

data class BackupHistoryItem(
  val id: Int,
  val filename: String,
  val createdAt: Long,
  val csvContent: String,
)

data class CompensationInput(
  val totalHours: Double,
  val extraThreshold: Double,
  val isHoliday: Boolean,
  val hourlyRate: Double,
  val extraHourlyRate: Double,
  val holidayHourlyRate: Double,
)

data class CompensationOutput(
  val ordinaryHours: Double,
  val extraHours: Double,
  val holidayHours: Double,
  val ordinaryAmount: Double,
  val extraAmount: Double,
  val holidayAmount: Double,
  val totalAmount: Double,
)

data class SyncMetadata(
  val lastImportDate: String? = null,
  val lastMutationDate: Long = 0L,
  val lastExportDate: Long? = null,
)

data class FullBackupDataset(
  val settings: OwnerSettings,
  val years: List<HarvestYear>,
  val workers: List<Worker>,
  val configs: List<WorkerYearConfig>,
  val groups: List<WorkerGroup>,
  val groupMembers: List<WorkerGroupMember>,
  val plantations: List<Plantation>,
  val logs: List<WorkLog>,
)
