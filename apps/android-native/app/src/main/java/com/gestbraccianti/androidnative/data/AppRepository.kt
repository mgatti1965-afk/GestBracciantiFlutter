package com.gestbraccianti.androidnative.data

import androidx.room.withTransaction
import com.gestbraccianti.androidnative.data.local.AppDatabase
import com.gestbraccianti.androidnative.data.local.BackupHistoryEntity
import com.gestbraccianti.androidnative.data.local.HarvestYearEntity
import com.gestbraccianti.androidnative.data.local.WorkerEntity
import com.gestbraccianti.androidnative.data.local.WorkerGroupEntity
import com.gestbraccianti.androidnative.data.local.WorkerGroupMemberEntity
import com.gestbraccianti.androidnative.data.local.WorkerYearConfigEntity
import com.gestbraccianti.androidnative.data.local.toDomain
import com.gestbraccianti.androidnative.data.local.toEntity
import com.gestbraccianti.androidnative.domain.BackupCsvCodec
import com.gestbraccianti.androidnative.domain.BackupHistoryItem
import com.gestbraccianti.androidnative.domain.DomainCalculator
import com.gestbraccianti.androidnative.domain.DomainHelpers
import com.gestbraccianti.androidnative.domain.FullBackupDataset
import com.gestbraccianti.androidnative.domain.HarvestYear
import com.gestbraccianti.androidnative.domain.OwnerSettings
import com.gestbraccianti.androidnative.domain.WorkLog
import com.gestbraccianti.androidnative.domain.Worker
import com.gestbraccianti.androidnative.domain.WorkerGroup
import com.gestbraccianti.androidnative.domain.WorkerGroupMember
import com.gestbraccianti.androidnative.domain.WorkerGroupWithMembers
import com.gestbraccianti.androidnative.domain.WorkerWithRate
import com.gestbraccianti.androidnative.domain.WorkerYearConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import java.text.Collator
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.max

data class SaveWorkLogResult(
  val rateChangedFrom: Double? = null,
  val rateChangedTo: Double? = null,
)

data class GlobalHolidayToggleResult(
  val isOverridden: Boolean,
  val affectedCount: Int,
)

data class ExportBackupResult(
  val filename: String,
  val csvContent: String,
  val exportMillis: Long,
  val headerDate: String,
)

data class ImportBackupResult(
  val years: Int,
  val workers: Int,
  val logs: Int,
  val groups: Int,
  val importDate: String,
)

class AppRepository(private val db: AppDatabase) {
  private val yearDao = db.harvestYearDao()
  private val workerDao = db.workerDao()
  private val configDao = db.workerYearConfigDao()
  private val groupDao = db.workerGroupDao()
  private val plantationDao = db.plantationDao()
  private val logDao = db.workLogDao()
  private val settingsDao = db.ownerSettingsDao()
  private val backupDao = db.backupHistoryDao()

  private val itLocale = Locale.forLanguageTag("it-IT")
  private val itCollator = Collator.getInstance(itLocale).apply {
    strength = Collator.SECONDARY
  }

  // --- Settings & Mutation tracking ---

  fun observeSettings(): Flow<OwnerSettings> =
    settingsDao.observe().map { it?.toDomain() ?: OwnerSettings() }

  suspend fun getSettings(): OwnerSettings =
    settingsDao.get()?.toDomain() ?: OwnerSettings()

  suspend fun updateSettings(
    isInternalSyncUpdate: Boolean = false,
    transform: (OwnerSettings) -> OwnerSettings,
  ): OwnerSettings {
    return db.withTransaction {
      val current = getSettings()
      val updated = transform(current).let { s ->
        val normalizedThreshold = if (s.extraHoursThreshold.isFinite() && s.extraHoursThreshold >= 0.0) {
          s.extraHoursThreshold
        } else {
          8.0
        }
        val base = s.copy(
          extraHoursThreshold = normalizedThreshold,
          saveCountSinceBackup = max(0, s.saveCountSinceBackup),
        )
        if (isInternalSyncUpdate) base else base.copy(lastMutationDate = System.currentTimeMillis())
      }
      settingsDao.upsert(updated.toEntity())
      updated
    }
  }

  suspend fun recordMutation() {
    updateSettings(isInternalSyncUpdate = true) { current ->
      current.copy(
        saveCountSinceBackup = current.saveCountSinceBackup + 1,
        lastMutationDate = System.currentTimeMillis(),
      )
    }
  }

  suspend fun hasUnexportedChanges(): Boolean {
    val settings = getSettings()
    if (settings.lastMutationDate <= 0L) return false
    val lastExport = settings.lastExportDate ?: return true
    return settings.lastMutationDate > lastExport
  }

  // --- Harvest Years ---

  fun observeYears(): Flow<List<HarvestYear>> =
    yearDao.observeAll().map { list -> list.map { it.toDomain() } }

  fun observeCurrentYear(): Flow<HarvestYear?> =
    yearDao.observeCurrent().map { it?.toDomain() }

  suspend fun getAllYears(): List<HarvestYear> =
    yearDao.getAll().map { it.toDomain() }

  suspend fun getCurrentYear(): HarvestYear? =
    yearDao.getCurrent()?.toDomain()

  suspend fun createYear(
    yearId: Int,
    notes: String = "",
    migrateFromYearId: Int? = null,
    migrateWorkers: Boolean = false,
    migrateGroups: Boolean = false,
  ) {
    val normalized = DomainHelpers.normalizeYearInput(yearId, notes).copy(isCurrent = true)
    db.withTransaction {
      if (yearDao.getById(normalized.id) != null) {
        throw IllegalStateException("L'anno ${normalized.id} esiste già nel database.")
      }
      yearDao.clearCurrent()
      yearDao.upsert(normalized.toEntity())

      if (migrateFromYearId != null) {
        if (migrateWorkers) {
          val prevConfigs = configDao.getForYear(migrateFromYearId)
          for (cfg in prevConfigs) {
            configDao.upsert(
              WorkerYearConfigEntity(
                workerId = cfg.workerId,
                harvestYearId = normalized.id,
                hourlyRate = cfg.hourlyRate,
                extraHourlyRate = cfg.extraHourlyRate,
                holidayHourlyRate = cfg.holidayHourlyRate,
              ),
            )
          }
        }
        if (migrateGroups) {
          val prevGroups = groupDao.getGroupsForYear(migrateFromYearId)
          for (grp in prevGroups) {
            val newGroupId = groupDao.insertGroup(
              WorkerGroupEntity(name = grp.name, yearId = normalized.id),
            ).toInt()
            val prevMembers = groupDao.getMembersForGroup(grp.id)
            for (member in prevMembers) {
              groupDao.upsertMember(
                WorkerGroupMemberEntity(groupId = newGroupId, workerId = member.workerId),
              )
            }
          }
        }
      }
    }
    recordMutation()
  }

  suspend fun selectYear(yearId: Int) {
    db.withTransaction {
      if (yearDao.getById(yearId) == null) {
        throw IllegalArgumentException("Annata $yearId non trovata.")
      }
      yearDao.setCurrent(yearId)
    }
  }

  suspend fun deselectYear() {
    yearDao.clearCurrent()
  }

  suspend fun deleteYear(yearId: Int) {
    db.withTransaction {
      logDao.deleteForYear(yearId)
      configDao.deleteForYear(yearId)
      val groups = groupDao.getGroupsForYear(yearId)
      for (g in groups) {
        groupDao.deleteMembersForGroup(g.id)
      }
      groupDao.deleteGroupsForYear(yearId)
      yearDao.deleteById(yearId)
    }
    recordMutation()
  }

  // --- Workers & Year Rates ---

  fun observeAllWorkers(): Flow<List<Worker>> =
    workerDao.observeAll().map { list -> DomainHelpers.sortWorkers(list.map { it.toDomain() }) }

  suspend fun getAllWorkers(): List<Worker> =
    DomainHelpers.sortWorkers(workerDao.getAll().map { it.toDomain() })

  fun observeWorkersWithRateForYear(yearId: Int): Flow<List<WorkerWithRate>> =
    combine(workerDao.observeAll(), configDao.observeForYear(yearId)) { workers, configs ->
      joinWorkersWithConfigs(workers.map { it.toDomain() }, configs.map { it.toDomain() })
    }

  suspend fun getWorkersWithRateForYear(yearId: Int): List<WorkerWithRate> =
    joinWorkersWithConfigs(
      workerDao.getAll().map { it.toDomain() },
      configDao.getForYear(yearId).map { it.toDomain() },
    )

  private fun joinWorkersWithConfigs(
    workers: List<Worker>,
    configs: List<WorkerYearConfig>,
  ): List<WorkerWithRate> {
    val workerMap = workers.associateBy { it.id }
    val joined = configs.mapNotNull { cfg ->
      val worker = workerMap[cfg.workerId] ?: return@mapNotNull null
      WorkerWithRate(
        worker = worker,
        hourlyRate = cfg.hourlyRate,
        extraHourlyRate = cfg.extraHourlyRate,
        holidayHourlyRate = cfg.holidayHourlyRate,
      )
    }
    return DomainHelpers.sortWorkersWithRate(joined)
  }

  suspend fun addOrUpdateWorkerForYear(
    workerId: Int? = null,
    yearId: Int,
    surname: String,
    name: String = "",
    phoneNumber: String = "",
    hourlyRate: Double,
    extraHourlyRate: Double,
    holidayHourlyRate: Double,
  ) {
    val normalized = DomainHelpers.normalizeWorkerFields(
      surname = surname,
      name = name,
      phoneNumber = phoneNumber,
    )
    val rate = DomainCalculator.round2(max(0.0, hourlyRate))
    val extraRate = DomainCalculator.round2(max(0.0, extraHourlyRate))
    val holidayRate = DomainCalculator.round2(max(0.0, holidayHourlyRate))

    db.withTransaction {
      val allWorkers = workerDao.getAll()
      val yearWorkerIds = configDao.getForYear(yearId).map { it.workerId }.toSet()

      val duplicateInYear = allWorkers.firstOrNull { w ->
        yearWorkerIds.contains(w.id) &&
          w.id != workerId &&
          w.surname.lowercase(itLocale) == normalized.surname.lowercase(itLocale) &&
          w.name.lowercase(itLocale) == normalized.name.lowercase(itLocale)
      }
      if (duplicateInYear != null) {
        throw IllegalStateException("Bracciante già presente (stesso nome e cognome).")
      }

      val targetWorkerId: Int = if (workerId != null) {
        val existing = workerDao.getById(workerId)
          ?: throw IllegalArgumentException("Bracciante non trovato.")
        workerDao.update(
          existing.copy(
            surname = normalized.surname,
            name = normalized.name,
            phoneNumber = normalized.phoneNumber,
          ),
        )
        workerId
      } else {
        val existingGlobal = allWorkers.firstOrNull { w ->
          w.surname.lowercase(itLocale) == normalized.surname.lowercase(itLocale) &&
            w.name.lowercase(itLocale) == normalized.name.lowercase(itLocale)
        }
        if (existingGlobal != null) {
          if (normalized.phoneNumber.isNotEmpty() && existingGlobal.phoneNumber != normalized.phoneNumber) {
            workerDao.update(existingGlobal.copy(phoneNumber = normalized.phoneNumber))
          }
          existingGlobal.id
        } else {
          workerDao.insert(
            WorkerEntity(
              name = normalized.name,
              surname = normalized.surname,
              phoneNumber = normalized.phoneNumber,
              isArchived = false,
            ),
          ).toInt()
        }
      }

      configDao.upsert(
        WorkerYearConfigEntity(
          workerId = targetWorkerId,
          harvestYearId = yearId,
          hourlyRate = rate,
          extraHourlyRate = extraRate,
          holidayHourlyRate = holidayRate,
        ),
      )
    }
    recordMutation()
  }

  suspend fun setWorkerArchived(workerId: Int, isArchived: Boolean) {
    db.withTransaction {
      val existing = workerDao.getById(workerId) ?: return@withTransaction
      workerDao.update(existing.copy(isArchived = isArchived))
    }
    recordMutation()
  }

  suspend fun deleteWorker(workerId: Int) {
    db.withTransaction {
      logDao.deleteForWorker(workerId)
      configDao.deleteForWorker(workerId)
      groupDao.deleteMembersForWorker(workerId)
      workerDao.deleteById(workerId)
    }
    recordMutation()
  }

  /** Merges duplicate worker profiles according to Rule R6 (lowest ID is target). */
  suspend fun mergeDuplicateGroup(workerIds: List<Int>) {
    if (workerIds.size < 2) return
    val sorted = workerIds.sorted()
    val targetId = sorted.first()
    val sourceIds = sorted.drop(1)

    db.withTransaction {
      val targetYears = configDao.getForWorker(targetId).map { it.harvestYearId }.toMutableSet()

      for (sourceId in sourceIds) {
        val sourceLogs = logDao.getForWorker(sourceId)
        for (log in sourceLogs) {
          logDao.upsert(log.copy(workerId = targetId))
        }

        val sourceMemberships = groupDao.getMembersForWorker(sourceId)
        for (m in sourceMemberships) {
          groupDao.deleteMember(m.groupId, m.workerId)
          groupDao.upsertMember(WorkerGroupMemberEntity(groupId = m.groupId, workerId = targetId))
        }

        val sourceConfigs = configDao.getForWorker(sourceId)
        configDao.deleteForWorker(sourceId)
        for (cfg in sourceConfigs) {
          if (targetYears.add(cfg.harvestYearId)) {
            configDao.upsert(cfg.copy(workerId = targetId))
          }
        }

        workerDao.deleteById(sourceId)
      }
    }
    recordMutation()
  }

  suspend fun copyWorkersFromPreviousYear(yearId: Int): Int {
    val prevYearId = yearId - 1
    val copied = db.withTransaction {
      val prevConfigs = configDao.getForYear(prevYearId)
      val existingWorkerIds = configDao.getForYear(yearId).map { it.workerId }.toSet()
      val missing = prevConfigs.filter { !existingWorkerIds.contains(it.workerId) }
      for (cfg in missing) {
        configDao.upsert(
          WorkerYearConfigEntity(
            workerId = cfg.workerId,
            harvestYearId = yearId,
            hourlyRate = cfg.hourlyRate,
            extraHourlyRate = cfg.extraHourlyRate,
            holidayHourlyRate = cfg.holidayHourlyRate,
          ),
        )
      }
      missing.size
    }
    if (copied > 0) {
      recordMutation()
    }
    return copied
  }

  // --- Worker Groups ---

  fun observeGroupsWithMembersForYear(yearId: Int): Flow<List<WorkerGroupWithMembers>> =
    combine(
      groupDao.observeGroupsForYear(yearId),
      groupDao.observeAllMembers(),
      workerDao.observeAll(),
    ) { groups, members, workers ->
      buildGroupsWithMembers(
        groups.map { it.toDomain() },
        members.map { it.toDomain() },
        workers.map { it.toDomain() },
      )
    }

  suspend fun getGroupsWithMembersForYear(yearId: Int): List<WorkerGroupWithMembers> =
    buildGroupsWithMembers(
      groupDao.getGroupsForYear(yearId).map { it.toDomain() },
      groupDao.getAllMembers().map { it.toDomain() },
      workerDao.getAll().map { it.toDomain() },
    )

  private fun buildGroupsWithMembers(
    groups: List<WorkerGroup>,
    allMembers: List<WorkerGroupMember>,
    workers: List<Worker>,
  ): List<WorkerGroupWithMembers> {
    val workerMap = workers.associateBy { it.id }
    return groups
      .sortedWith { a, b -> itCollator.compare(a.name, b.name) }
      .map { group ->
        val memberWorkers = allMembers
          .filter { it.groupId == group.id }
          .mapNotNull { workerMap[it.workerId] }
        WorkerGroupWithMembers(
          group = group,
          members = DomainHelpers.sortWorkers(memberWorkers),
        )
      }
  }

  suspend fun createGroup(name: String, yearId: Int) {
    val trimmed = name.trim()
    if (trimmed.isEmpty()) {
      throw IllegalArgumentException("Inserisci un nome per il gruppo.")
    }
    db.withTransaction {
      val existing = groupDao.getGroupsForYear(yearId)
      if (existing.any { it.name.lowercase(itLocale) == trimmed.lowercase(itLocale) }) {
        throw IllegalStateException("Esiste già un gruppo chiamato \"$trimmed\".")
      }
      groupDao.insertGroup(WorkerGroupEntity(name = trimmed, yearId = yearId))
    }
    recordMutation()
  }

  suspend fun deleteGroup(groupId: Int) {
    db.withTransaction {
      groupDao.deleteMembersForGroup(groupId)
      groupDao.deleteGroupById(groupId)
    }
    recordMutation()
  }

  suspend fun setGroupMember(groupId: Int, workerId: Int, isMember: Boolean) {
    if (isMember) {
      groupDao.upsertMember(WorkerGroupMemberEntity(groupId = groupId, workerId = workerId))
    } else {
      groupDao.deleteMember(groupId, workerId)
    }
    recordMutation()
  }

  suspend fun copyGroupsFromPreviousYear(yearId: Int): Int {
    val prevYearId = yearId - 1
    val copied = db.withTransaction {
      val prevGroups = groupDao.getGroupsForYear(prevYearId)
      val curNames = groupDao.getGroupsForYear(yearId)
        .map { it.name.lowercase(itLocale) }
        .toSet()

      var count = 0
      for (oldGroup in prevGroups) {
        if (!curNames.contains(oldGroup.name.lowercase(itLocale))) {
          val newGroupId = groupDao.insertGroup(
            WorkerGroupEntity(name = oldGroup.name, yearId = yearId),
          ).toInt()
          val oldMembers = groupDao.getMembersForGroup(oldGroup.id)
          for (member in oldMembers) {
            groupDao.upsertMember(
              WorkerGroupMemberEntity(groupId = newGroupId, workerId = member.workerId),
            )
          }
          count += 1
        }
      }
      count
    }
    if (copied > 0) {
      recordMutation()
    }
    return copied
  }

  // --- Work Logs ---

  fun observeLogsForYear(yearId: Int): Flow<List<WorkLog>> =
    logDao.observeForYear(yearId).map { list -> list.map { it.toDomain() } }

  suspend fun getLogsForYear(yearId: Int): List<WorkLog> =
    logDao.getForYear(yearId).map { it.toDomain() }

  suspend fun saveWorkLog(
    id: Int? = null,
    workerId: Int,
    yearId: Int,
    date: Long,
    morningStart: String?,
    morningEnd: String?,
    afternoonStart: String?,
    afternoonEnd: String?,
  ): SaveWorkLogResult {
    val settings = getSettings()
    val result = db.withTransaction {
      val config = configDao.get(workerId, yearId)
      val hourlyRate = config?.hourlyRate ?: 0.0
      val extraHourlyRate = config?.extraHourlyRate ?: 0.0
      val holidayHourlyRate = config?.holidayHourlyRate ?: 0.0

      val existing = if (id != null && id > 0) logDao.getById(id) else null
      var rateChangedFrom: Double? = null
      var rateChangedTo: Double? = null
      if (existing != null && existing.hourlyRate != 0.0 && existing.hourlyRate != hourlyRate) {
        rateChangedFrom = existing.hourlyRate
        rateChangedTo = hourlyRate
      }

      val draft = DomainHelpers.computeWorkLogFromShifts(
        id = existing?.id ?: 0,
        workerId = workerId,
        harvestYearId = yearId,
        date = date,
        morningStart = morningStart,
        morningEnd = morningEnd,
        afternoonStart = afternoonStart,
        afternoonEnd = afternoonEnd,
        hourlyRate = hourlyRate,
        extraHourlyRate = extraHourlyRate,
        holidayHourlyRate = holidayHourlyRate,
        isManualHoliday = existing?.isManualHoliday ?: false,
        settings = settings,
      )
      logDao.upsert(draft.toEntity())
      SaveWorkLogResult(rateChangedFrom = rateChangedFrom, rateChangedTo = rateChangedTo)
    }
    recordMutation()
    return result
  }

  suspend fun saveWorkLogRange(
    workerIds: List<Int>,
    yearId: Int,
    startDate: Long,
    endDate: Long,
    morningStart: String?,
    morningEnd: String?,
    afternoonStart: String?,
    afternoonEnd: String?,
  ): Int {
    val settings = getSettings()
    val startLocal = DomainHelpers.millisToLocalDate(startDate)
    val endLocal = DomainHelpers.millisToLocalDate(endDate)
    if (endLocal.isBefore(startLocal)) return 0

    val count = db.withTransaction {
      val existingYearLogs = logDao.getForYear(yearId)
      val configMap = workerIds.mapNotNull { wId ->
        configDao.get(wId, yearId)?.let { wId to it }
      }.toMap()

      var saved = 0
      var cursor = startLocal
      while (!cursor.isAfter(endLocal)) {
        val cursorMillis = DomainHelpers.toLocalMidnightMillis(cursor)
        for (workerId in workerIds) {
          val cfg = configMap[workerId]
          val existing = existingYearLogs.firstOrNull {
            it.workerId == workerId && it.date == cursorMillis
          }
          val draft = DomainHelpers.computeWorkLogFromShifts(
            id = existing?.id ?: 0,
            workerId = workerId,
            harvestYearId = yearId,
            date = cursorMillis,
            morningStart = morningStart,
            morningEnd = morningEnd,
            afternoonStart = afternoonStart,
            afternoonEnd = afternoonEnd,
            hourlyRate = cfg?.hourlyRate ?: 0.0,
            extraHourlyRate = cfg?.extraHourlyRate ?: 0.0,
            holidayHourlyRate = cfg?.holidayHourlyRate ?: 0.0,
            isManualHoliday = existing?.isManualHoliday ?: false,
            settings = settings,
          )
          logDao.upsert(draft.toEntity())
          saved += 1
        }
        cursor = cursor.plusDays(1)
      }
      saved
    }
    if (count > 0) {
      recordMutation()
    }
    return count
  }

  suspend fun deleteWorkLog(logId: Int) {
    logDao.deleteById(logId)
    recordMutation()
  }

  suspend fun toggleManualHolidayForLog(logId: Int): WorkLog {
    val settings = getSettings()
    val updated = db.withTransaction {
      val existing = logDao.getById(logId)?.toDomain()
        ?: throw IllegalArgumentException("Registrazione non trovata.")
      val recalculated = DomainHelpers.recalculateWorkLog(
        existing.copy(isManualHoliday = !existing.isManualHoliday),
        settings,
      )
      logDao.upsert(recalculated.toEntity())
      recalculated
    }
    recordMutation()
    return updated
  }

  suspend fun toggleGlobalHolidayForDate(dateMillis: Long, yearId: Int): GlobalHolidayToggleResult {
    val current = getSettings()
    val globalSet = current.globalFestiveDates.toMutableSet()
    val wasOverridden = globalSet.contains(dateMillis)
    if (wasOverridden) {
      globalSet.remove(dateMillis)
    } else {
      globalSet.add(dateMillis)
    }

    val updatedSettings = updateSettings { s ->
      s.copy(globalFestiveDates = globalSet.toList())
    }

    val targetManualState = !wasOverridden
    val affectedCount = db.withTransaction {
      val logsForDay = logDao.getForYearAndDate(yearId, dateMillis)
      for (entity in logsForDay) {
        val recalculated = DomainHelpers.recalculateWorkLog(
          entity.toDomain().copy(isManualHoliday = targetManualState),
          updatedSettings,
        )
        logDao.upsert(recalculated.toEntity())
      }
      logsForDay.size
    }

    return GlobalHolidayToggleResult(
      isOverridden = targetManualState,
      affectedCount = affectedCount,
    )
  }

  // --- Backup History & Dataset Replace/Reset (used by Fase 3 CSV) ---

  fun observeBackupHistory(): Flow<List<BackupHistoryItem>> =
    backupDao.observeAll().map { list -> list.map { it.toDomain() } }

  suspend fun getBackupHistory(): List<BackupHistoryItem> =
    backupDao.getAll().map { it.toDomain() }

  suspend fun addBackupHistoryItem(filename: String, createdAt: Long, csvContent: String): Int =
    backupDao.insert(
      BackupHistoryEntity(filename = filename, createdAt = createdAt, csvContent = csvContent),
    ).toInt()

  suspend fun deleteBackupHistoryItem(id: Int) {
    backupDao.deleteById(id)
  }

  suspend fun exportFullBackup(saveInHistory: Boolean = true): ExportBackupResult {
    val exportMillis = System.currentTimeMillis()
    val dataset = readFullDataset()
    val csvContent = BackupCsvCodec.exportBackupCsv(dataset, exportMillis)
    val headerDate = BackupCsvCodec.formatBackupHeaderDate(exportMillis)
    val filename = BackupCsvCodec.DEFAULT_BACKUP_FILENAME

    if (saveInHistory) {
      db.withTransaction {
        backupDao.insert(
          BackupHistoryEntity(
            filename = filename,
            createdAt = exportMillis,
            csvContent = csvContent,
          ),
        )
        val current = getSettings()
        settingsDao.upsert(
          current.copy(
            saveCountSinceBackup = 0,
            lastExportDate = exportMillis,
            lastImportDate = headerDate,
            lastMutationDate = 0L,
          ).toEntity(),
        )
      }
    }

    return ExportBackupResult(
      filename = filename,
      csvContent = csvContent,
      exportMillis = exportMillis,
      headerDate = headerDate,
    )
  }

  suspend fun importFullBackup(csvText: String): ImportBackupResult {
    val parsed = BackupCsvCodec.importFullBackupCsv(csvText)
    val importDate = parsed.backupHeaderDate ?: BackupCsvCodec.formatBackupHeaderDate()

    val existingYears = getAllYears()
    if (existingYears.isNotEmpty()) {
      val autoBkp = readFullDataset()
      val now = System.currentTimeMillis()
      val stamp = DateTimeFormatter.ofPattern("yyyyMMdd_HHmm")
        .format(Instant.ofEpochMilli(now).atZone(ZoneId.systemDefault()))
      backupDao.insert(
        BackupHistoryEntity(
          filename = "GestBraccianti_AutoBkp_$stamp.csv",
          createdAt = now,
          csvContent = BackupCsvCodec.exportBackupCsv(autoBkp, now),
        ),
      )
    }

    replaceAllData(parsed.dataset, importDate)

    return ImportBackupResult(
      years = parsed.dataset.years.size,
      workers = parsed.dataset.workers.size,
      logs = parsed.dataset.logs.size,
      groups = parsed.dataset.groups.size,
      importDate = importDate,
    )
  }

  suspend fun readFullDataset(): FullBackupDataset = db.withTransaction {
    FullBackupDataset(
      settings = getSettings(),
      years = DomainHelpers.sortYearsDesc(yearDao.getAll().map { it.toDomain() }),
      workers = DomainHelpers.sortWorkers(workerDao.getAll().map { it.toDomain() }),
      configs = configDao.getAll().map { it.toDomain() },
      groups = groupDao.getAllGroups().map { it.toDomain() },
      groupMembers = groupDao.getAllMembers().map { it.toDomain() },
      plantations = plantationDao.getAll().map { it.toDomain() },
      logs = DomainHelpers.sortLogsByDateDesc(logDao.getAll().map { it.toDomain() }),
    )
  }

  suspend fun replaceAllData(dataset: FullBackupDataset, importDate: String) {
    db.withTransaction {
      logDao.deleteAll()
      groupDao.deleteAllMembers()
      groupDao.deleteAllGroups()
      configDao.deleteAll()
      workerDao.deleteAll()
      plantationDao.deleteAll()
      yearDao.deleteAll()

      settingsDao.upsert(
        dataset.settings.copy(
          saveCountSinceBackup = 0,
          lastImportDate = importDate,
          lastExportDate = System.currentTimeMillis(),
          lastMutationDate = 0L,
        ).toEntity(),
      )
      yearDao.upsertAll(dataset.years.map { it.toEntity() })
      workerDao.upsertAll(
        dataset.workers.map { w ->
          w.copy(
            name = DomainCalculator.capitalizeWords(w.name),
            surname = DomainCalculator.capitalizeWords(w.surname),
          ).toEntity()
        },
      )
      configDao.upsertAll(dataset.configs.map { it.toEntity() })
      groupDao.upsertAllGroups(dataset.groups.map { it.toEntity() })
      groupDao.upsertAllMembers(dataset.groupMembers.map { it.toEntity() })
      plantationDao.upsertAll(dataset.plantations.map { it.toEntity() })
      logDao.upsertAll(dataset.logs.map { it.toEntity() })
    }
  }

  suspend fun clearAllDatabase() {
    db.withTransaction {
      logDao.deleteAll()
      groupDao.deleteAllMembers()
      groupDao.deleteAllGroups()
      configDao.deleteAll()
      workerDao.deleteAll()
      plantationDao.deleteAll()
      yearDao.deleteAll()
      settingsDao.upsert(OwnerSettings().toEntity())
    }
  }
}
