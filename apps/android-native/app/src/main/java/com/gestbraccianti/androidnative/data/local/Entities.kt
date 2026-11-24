package com.gestbraccianti.androidnative.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.gestbraccianti.androidnative.domain.BackupHistoryItem
import com.gestbraccianti.androidnative.domain.FestiveDaysType
import com.gestbraccianti.androidnative.domain.HarvestYear
import com.gestbraccianti.androidnative.domain.OwnerSettings
import com.gestbraccianti.androidnative.domain.Plantation
import com.gestbraccianti.androidnative.domain.WorkLog
import com.gestbraccianti.androidnative.domain.Worker
import com.gestbraccianti.androidnative.domain.WorkerGroup
import com.gestbraccianti.androidnative.domain.WorkerGroupMember
import com.gestbraccianti.androidnative.domain.WorkerYearConfig

@Entity(tableName = "harvest_years")
data class HarvestYearEntity(
  @PrimaryKey val id: Int,
  val isCurrent: Boolean,
  val notes: String,
)

@Entity(tableName = "workers")
data class WorkerEntity(
  @PrimaryKey(autoGenerate = true) val id: Int = 0,
  val name: String,
  val surname: String,
  val phoneNumber: String,
  val isArchived: Boolean,
)

@Entity(
  tableName = "worker_year_configs",
  primaryKeys = ["workerId", "harvestYearId"],
  indices = [
    Index(value = ["harvestYearId"]),
    Index(value = ["workerId"]),
  ],
)
data class WorkerYearConfigEntity(
  val workerId: Int,
  val harvestYearId: Int,
  val hourlyRate: Double,
  val extraHourlyRate: Double,
  val holidayHourlyRate: Double,
)

@Entity(
  tableName = "worker_groups",
  indices = [Index(value = ["yearId"])],
)
data class WorkerGroupEntity(
  @PrimaryKey(autoGenerate = true) val id: Int = 0,
  val name: String,
  val yearId: Int,
)

@Entity(
  tableName = "worker_group_members",
  primaryKeys = ["groupId", "workerId"],
  indices = [
    Index(value = ["groupId"]),
    Index(value = ["workerId"]),
  ],
)
data class WorkerGroupMemberEntity(
  val groupId: Int,
  val workerId: Int,
)

@Entity(tableName = "plantations")
data class PlantationEntity(
  @PrimaryKey(autoGenerate = true) val id: Int = 0,
  val name: String,
  val isArchived: Boolean,
)

@Entity(
  tableName = "work_logs",
  indices = [
    Index(value = ["harvestYearId"]),
    Index(value = ["workerId"]),
    Index(value = ["harvestYearId", "date"]),
  ],
)
data class WorkLogEntity(
  @PrimaryKey(autoGenerate = true) val id: Int = 0,
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

@Entity(tableName = "owner_settings")
data class OwnerSettingsEntity(
  @PrimaryKey val key: String = SETTINGS_KEY,
  val ownerName: String,
  val ownerSurname: String,
  val extraHoursThreshold: Double,
  val festiveDaysTypeCode: Int,
  val globalFestiveDates: List<Long>,
  val saveCountSinceBackup: Int,
  val lastImportDate: String?,
  val lastMutationDate: Long,
  val lastExportDate: Long?,
) {
  companion object {
    const val SETTINGS_KEY = "ownerSettings"
  }
}

@Entity(tableName = "backup_history")
data class BackupHistoryEntity(
  @PrimaryKey(autoGenerate = true) val id: Int = 0,
  val filename: String,
  val createdAt: Long,
  val csvContent: String,
)

fun HarvestYearEntity.toDomain() = HarvestYear(id = id, isCurrent = isCurrent, notes = notes)
fun HarvestYear.toEntity() = HarvestYearEntity(id = id, isCurrent = isCurrent, notes = notes)

fun WorkerEntity.toDomain() = Worker(
  id = id,
  name = name,
  surname = surname,
  phoneNumber = phoneNumber,
  isArchived = isArchived,
)

fun Worker.toEntity() = WorkerEntity(
  id = id,
  name = name,
  surname = surname,
  phoneNumber = phoneNumber,
  isArchived = isArchived,
)

fun WorkerYearConfigEntity.toDomain() = WorkerYearConfig(
  workerId = workerId,
  harvestYearId = harvestYearId,
  hourlyRate = hourlyRate,
  extraHourlyRate = extraHourlyRate,
  holidayHourlyRate = holidayHourlyRate,
)

fun WorkerYearConfig.toEntity() = WorkerYearConfigEntity(
  workerId = workerId,
  harvestYearId = harvestYearId,
  hourlyRate = hourlyRate,
  extraHourlyRate = extraHourlyRate,
  holidayHourlyRate = holidayHourlyRate,
)

fun WorkerGroupEntity.toDomain() = WorkerGroup(id = id, name = name, yearId = yearId)
fun WorkerGroup.toEntity() = WorkerGroupEntity(id = id, name = name, yearId = yearId)

fun WorkerGroupMemberEntity.toDomain() = WorkerGroupMember(groupId = groupId, workerId = workerId)
fun WorkerGroupMember.toEntity() = WorkerGroupMemberEntity(groupId = groupId, workerId = workerId)

fun PlantationEntity.toDomain() = Plantation(id = id, name = name, isArchived = isArchived)
fun Plantation.toEntity() = PlantationEntity(id = id, name = name, isArchived = isArchived)

fun WorkLogEntity.toDomain() = WorkLog(
  id = id,
  workerId = workerId,
  harvestYearId = harvestYearId,
  date = date,
  morningStart = morningStart,
  morningEnd = morningEnd,
  afternoonStart = afternoonStart,
  afternoonEnd = afternoonEnd,
  totalHours = totalHours,
  ordinaryHours = ordinaryHours,
  extraHours = extraHours,
  holidayHours = holidayHours,
  hourlyRate = hourlyRate,
  extraHourlyRate = extraHourlyRate,
  holidayHourlyRate = holidayHourlyRate,
  totalAmount = totalAmount,
  ordinaryAmount = ordinaryAmount,
  extraAmount = extraAmount,
  holidayAmount = holidayAmount,
  isManualHoliday = isManualHoliday,
)

fun WorkLog.toEntity() = WorkLogEntity(
  id = id,
  workerId = workerId,
  harvestYearId = harvestYearId,
  date = date,
  morningStart = morningStart,
  morningEnd = morningEnd,
  afternoonStart = afternoonStart,
  afternoonEnd = afternoonEnd,
  totalHours = totalHours,
  ordinaryHours = ordinaryHours,
  extraHours = extraHours,
  holidayHours = holidayHours,
  hourlyRate = hourlyRate,
  extraHourlyRate = extraHourlyRate,
  holidayHourlyRate = holidayHourlyRate,
  totalAmount = totalAmount,
  ordinaryAmount = ordinaryAmount,
  extraAmount = extraAmount,
  holidayAmount = holidayAmount,
  isManualHoliday = isManualHoliday,
)

fun OwnerSettingsEntity.toDomain() = OwnerSettings(
  ownerName = ownerName,
  ownerSurname = ownerSurname,
  extraHoursThreshold = extraHoursThreshold,
  festiveDaysType = FestiveDaysType.fromCode(festiveDaysTypeCode),
  globalFestiveDates = globalFestiveDates,
  saveCountSinceBackup = saveCountSinceBackup,
  lastImportDate = lastImportDate,
  lastMutationDate = lastMutationDate,
  lastExportDate = lastExportDate,
)

fun OwnerSettings.toEntity() = OwnerSettingsEntity(
  key = OwnerSettingsEntity.SETTINGS_KEY,
  ownerName = ownerName,
  ownerSurname = ownerSurname,
  extraHoursThreshold = extraHoursThreshold,
  festiveDaysTypeCode = festiveDaysType.code,
  globalFestiveDates = globalFestiveDates,
  saveCountSinceBackup = saveCountSinceBackup,
  lastImportDate = lastImportDate,
  lastMutationDate = lastMutationDate,
  lastExportDate = lastExportDate,
)

fun BackupHistoryEntity.toDomain() = BackupHistoryItem(
  id = id,
  filename = filename,
  createdAt = createdAt,
  csvContent = csvContent,
)

fun BackupHistoryItem.toEntity() = BackupHistoryEntity(
  id = id,
  filename = filename,
  createdAt = createdAt,
  csvContent = csvContent,
)
