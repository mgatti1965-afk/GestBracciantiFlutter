package com.gestbraccianti.androidnative.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.gestbraccianti.androidnative.data.AppRepository
import com.gestbraccianti.androidnative.data.ExportBackupResult
import com.gestbraccianti.androidnative.data.local.AppDatabase
import com.gestbraccianti.androidnative.domain.BackupHistoryItem
import com.gestbraccianti.androidnative.domain.DomainHelpers
import com.gestbraccianti.androidnative.domain.FestiveDaysType
import com.gestbraccianti.androidnative.domain.HarvestYear
import com.gestbraccianti.androidnative.domain.OwnerSettings
import com.gestbraccianti.androidnative.domain.WorkLog
import com.gestbraccianti.androidnative.domain.Worker
import com.gestbraccianti.androidnative.domain.WorkerGroupWithMembers
import com.gestbraccianti.androidnative.domain.WorkerWithRate
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate

enum class MainTab(val label: String) {
  DAILY("Ore"),
  SUMMARY("Riepilogo"),
  WORKERS("Braccianti"),
  OTHERS("Varie"),
}

data class MainUiState(
  val years: List<HarvestYear> = emptyList(),
  val currentYear: HarvestYear? = null,
  val settings: OwnerSettings = OwnerSettings(),
  val allWorkers: List<Worker> = emptyList(),
  val workersWithRate: List<WorkerWithRate> = emptyList(),
  val groupsWithMembers: List<WorkerGroupWithMembers> = emptyList(),
  val logsForYear: List<WorkLog> = emptyList(),
  val backupHistory: List<BackupHistoryItem> = emptyList(),
  val activeTab: MainTab = MainTab.DAILY,
  val activeDayDetailDate: Long? = null,
)

@OptIn(ExperimentalCoroutinesApi::class)
class MainViewModel(application: Application) : AndroidViewModel(application) {
  private val repo = AppRepository(AppDatabase.getInstance(application))

  private val activeTab = MutableStateFlow(MainTab.DAILY)
  private val activeDayDetailDate = MutableStateFlow<Long?>(null)

  private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
  val messages = _messages.asSharedFlow()

  private val currentYearFlow = repo.observeCurrentYear()

  private val yearScopedWorkers = currentYearFlow.flatMapLatest { year ->
    if (year == null) flowOf(emptyList()) else repo.observeWorkersWithRateForYear(year.id)
  }

  private val yearScopedGroups = currentYearFlow.flatMapLatest { year ->
    if (year == null) flowOf(emptyList()) else repo.observeGroupsWithMembersForYear(year.id)
  }

  private val yearScopedLogs = currentYearFlow.flatMapLatest { year ->
    if (year == null) flowOf(emptyList()) else repo.observeLogsForYear(year.id)
  }

  private val baseDataFlow = combine(
    repo.observeYears(),
    currentYearFlow,
    repo.observeSettings(),
    repo.observeAllWorkers(),
    repo.observeBackupHistory(),
  ) { years, currentYear, settings, allWorkers, backups ->
    BaseData(years, currentYear, settings, allWorkers, backups)
  }

  private val yearScopedFlow = combine(
    yearScopedWorkers,
    yearScopedGroups,
    yearScopedLogs,
  ) { workers, groups, logs ->
    YearScopedData(workers, groups, logs)
  }

  val uiState: StateFlow<MainUiState> = combine(
    baseDataFlow,
    yearScopedFlow,
    activeTab,
    activeDayDetailDate,
  ) { base, scoped, tab, dayDetail ->
    MainUiState(
      years = base.years,
      currentYear = base.currentYear,
      settings = base.settings,
      allWorkers = base.allWorkers,
      workersWithRate = scoped.workers,
      groupsWithMembers = scoped.groups,
      logsForYear = scoped.logs,
      backupHistory = base.backups,
      activeTab = tab,
      activeDayDetailDate = dayDetail,
    )
  }.stateIn(
    scope = viewModelScope,
    started = SharingStarted.WhileSubscribed(5_000),
    initialValue = MainUiState(),
  )

  fun setActiveTab(tab: MainTab) {
    activeTab.value = tab
    if (tab != MainTab.DAILY) {
      activeDayDetailDate.value = null
    }
  }

  fun openDayDetail(dateMillis: Long) {
    activeTab.value = MainTab.DAILY
    activeDayDetailDate.value = dateMillis
  }

  fun closeDayDetail() {
    activeDayDetailDate.value = null
  }

  fun defaultDateForYear(yearId: Int): Long {
    val today = LocalDate.now()
    return if (today.year == yearId) {
      DomainHelpers.toLocalMidnightMillis(today)
    } else {
      DomainHelpers.toLocalMidnightMillis(LocalDate.of(yearId, 1, 1))
    }
  }

  // --- Years ---

  fun createYear(
    yearId: Int,
    notes: String,
    migrateFromYearId: Int?,
    migrateWorkers: Boolean,
    migrateGroups: Boolean,
  ) = launchSafe("Annata $yearId creata") {
    repo.createYear(
      yearId = yearId,
      notes = notes,
      migrateFromYearId = migrateFromYearId,
      migrateWorkers = migrateWorkers,
      migrateGroups = migrateGroups,
    )
    activeDayDetailDate.value = null
    activeTab.value = MainTab.DAILY
  }

  fun selectYear(yearId: Int) = launchSafe {
    repo.selectYear(yearId)
    activeDayDetailDate.value = null
    activeTab.value = MainTab.DAILY
  }

  fun deselectYear() = launchSafe {
    repo.deselectYear()
    activeDayDetailDate.value = null
  }

  fun deleteYear(yearId: Int) = launchSafe("Annata $yearId eliminata") {
    repo.deleteYear(yearId)
  }

  // --- Workers & Groups ---

  fun saveWorkerForYear(
    workerId: Int?,
    yearId: Int,
    surname: String,
    name: String,
    phoneNumber: String,
    hourlyRate: Double,
    extraHourlyRate: Double,
    holidayHourlyRate: Double,
  ) = launchSafe(if (workerId == null) "Bracciante aggiunto" else "Bracciante aggiornato") {
    repo.addOrUpdateWorkerForYear(
      workerId = workerId,
      yearId = yearId,
      surname = surname,
      name = name,
      phoneNumber = phoneNumber,
      hourlyRate = hourlyRate,
      extraHourlyRate = extraHourlyRate,
      holidayHourlyRate = holidayHourlyRate,
    )
  }

  fun setWorkerArchived(workerId: Int, archived: Boolean) = launchSafe(
    if (archived) "Bracciante archiviato" else "Bracciante ripristinato",
  ) {
    repo.setWorkerArchived(workerId, archived)
  }

  fun deleteWorker(workerId: Int) = launchSafe("Bracciante eliminato") {
    repo.deleteWorker(workerId)
  }

  fun mergeDuplicateGroup(workerIds: List<Int>) = launchSafe("Profili duplicati uniti") {
    repo.mergeDuplicateGroup(workerIds)
  }

  fun copyWorkersFromPreviousYear(yearId: Int) = launchSafe {
    val count = repo.copyWorkersFromPreviousYear(yearId)
    _messages.tryEmit(
      if (count > 0) "Copiati $count braccianti dall'annata ${yearId - 1}"
      else "Nessun nuovo bracciante da copiare dall'annata ${yearId - 1}",
    )
  }

  fun createGroup(name: String, yearId: Int) = launchSafe("Gruppo creato") {
    repo.createGroup(name, yearId)
  }

  fun deleteGroup(groupId: Int) = launchSafe("Gruppo eliminato") {
    repo.deleteGroup(groupId)
  }

  fun setGroupMember(groupId: Int, workerId: Int, isMember: Boolean) = launchSafe {
    repo.setGroupMember(groupId, workerId, isMember)
  }

  fun copyGroupsFromPreviousYear(yearId: Int) = launchSafe {
    val count = repo.copyGroupsFromPreviousYear(yearId)
    _messages.tryEmit(
      if (count > 0) "Copiati $count gruppi dall'annata ${yearId - 1}"
      else "Nessun nuovo gruppo da copiare dall'annata ${yearId - 1}",
    )
  }

  // --- Work Logs ---

  fun saveWorkLog(
    id: Int?,
    workerId: Int,
    yearId: Int,
    date: Long,
    morningStart: String?,
    morningEnd: String?,
    afternoonStart: String?,
    afternoonEnd: String?,
  ) = launchSafe {
    val res = repo.saveWorkLog(
      id = id,
      workerId = workerId,
      yearId = yearId,
      date = date,
      morningStart = morningStart,
      morningEnd = morningEnd,
      afternoonStart = afternoonStart,
      afternoonEnd = afternoonEnd,
    )
    if (res.rateChangedFrom != null && res.rateChangedTo != null) {
      _messages.tryEmit("Salvato (tariffa aggiornata da ${res.rateChangedFrom}€ a ${res.rateChangedTo}€)")
    } else {
      _messages.tryEmit("Giornata salvata")
    }
  }

  fun saveWorkLogRange(
    workerIds: List<Int>,
    yearId: Int,
    startDate: Long,
    endDate: Long,
    morningStart: String?,
    morningEnd: String?,
    afternoonStart: String?,
    afternoonEnd: String?,
  ) = launchSafe {
    val count = repo.saveWorkLogRange(
      workerIds = workerIds,
      yearId = yearId,
      startDate = startDate,
      endDate = endDate,
      morningStart = morningStart,
      morningEnd = morningEnd,
      afternoonStart = afternoonStart,
      afternoonEnd = afternoonEnd,
    )
    _messages.tryEmit("Salvate $count registrazioni nel periodo selezionato")
  }

  fun deleteWorkLog(logId: Int) = launchSafe("Registrazione eliminata") {
    repo.deleteWorkLog(logId)
  }

  fun toggleManualHolidayForLog(logId: Int) = launchSafe("Stato festivo aggiornato") {
    repo.toggleManualHolidayForLog(logId)
  }

  fun toggleGlobalHolidayForDate(dateMillis: Long, yearId: Int) = launchSafe {
    val res = repo.toggleGlobalHolidayForDate(dateMillis, yearId)
    val label = if (res.isOverridden) "Giorno impostato come festivo/invertito" else "Ripristinato calendario standard"
    _messages.tryEmit("$label (${res.affectedCount} log aggiornati)")
  }

  // --- Settings & Backups ---

  fun saveOwnerSettings(
    ownerName: String,
    ownerSurname: String,
    extraHoursThreshold: Double,
    festiveDaysType: FestiveDaysType,
  ) = launchSafe("Impostazioni salvate") {
    repo.updateSettings { current ->
      current.copy(
        ownerName = ownerName.trim(),
        ownerSurname = ownerSurname.trim(),
        extraHoursThreshold = extraHoursThreshold,
        festiveDaysType = festiveDaysType,
      )
    }
  }

  fun importCsvBackup(csvText: String) = launchSafe {
    val res = repo.importFullBackup(csvText)
    activeDayDetailDate.value = null
    activeTab.value = MainTab.DAILY
    _messages.tryEmit(
      "Import completato: ${res.years} annate, ${res.workers} braccianti, ${res.logs} log",
    )
  }

  fun exportCsvBackup(onReady: (ExportBackupResult) -> Unit) = launchSafe {
    val res = repo.exportFullBackup(saveInHistory = true)
    onReady(res)
  }

  fun deleteBackupHistoryItem(id: Int) = launchSafe("Backup rimosso dallo storico") {
    repo.deleteBackupHistoryItem(id)
  }

  fun clearAllDatabase() = launchSafe("Database azzerato") {
    repo.clearAllDatabase()
    activeDayDetailDate.value = null
  }

  private fun launchSafe(successMessage: String? = null, block: suspend () -> Unit) {
    viewModelScope.launch {
      try {
        block()
        if (successMessage != null) {
          _messages.tryEmit(successMessage)
        }
      } catch (e: Exception) {
        _messages.tryEmit(e.message ?: "Errore imprevisto")
      }
    }
  }

  private data class BaseData(
    val years: List<HarvestYear>,
    val currentYear: HarvestYear?,
    val settings: OwnerSettings,
    val allWorkers: List<Worker>,
    val backups: List<BackupHistoryItem>,
  )

  private data class YearScopedData(
    val workers: List<WorkerWithRate>,
    val groups: List<WorkerGroupWithMembers>,
    val logs: List<WorkLog>,
  )
}
