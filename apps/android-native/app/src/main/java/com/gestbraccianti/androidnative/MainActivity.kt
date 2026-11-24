package com.gestbraccianti.androidnative

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import com.gestbraccianti.androidnative.domain.BackupCsvCodec
import com.gestbraccianti.androidnative.ui.MainTab
import com.gestbraccianti.androidnative.ui.MainViewModel
import com.gestbraccianti.androidnative.ui.screens.DailyLoggingScreen
import com.gestbraccianti.androidnative.ui.screens.FinancialSummaryScreen
import com.gestbraccianti.androidnative.ui.screens.HelpDialog
import com.gestbraccianti.androidnative.ui.screens.HelpTopic
import com.gestbraccianti.androidnative.ui.screens.OthersScreen
import com.gestbraccianti.androidnative.ui.screens.WorkDayDetailScreen
import com.gestbraccianti.androidnative.ui.screens.WorkerRegistryScreen
import com.gestbraccianti.androidnative.ui.screens.YearSelectionScreen
import com.gestbraccianti.androidnative.ui.theme.GestBracciantiTheme
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      GestBracciantiTheme {
        GestBracciantiApp()
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GestBracciantiApp(vm: MainViewModel = viewModel()) {
  val state by vm.uiState.collectAsState()
  val snackbarHostState = remember { SnackbarHostState() }
  val scope = rememberCoroutineScope()
  val context = LocalContext.current

  var showHelpDialog by remember { mutableStateOf(false) }
  var backupReminderShown by remember { mutableStateOf(false) }
  var showBackupReminderDialog by remember { mutableStateOf(false) }
  var pendingExportCsv by remember { mutableStateOf<String?>(null) }

  val importCsvLauncher = rememberLauncherForActivityResult(
    contract = ActivityResultContracts.OpenDocument(),
  ) { uri: Uri? ->
    if (uri != null) {
      val text = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
      if (text != null) {
        vm.importCsvBackup(text)
      }
    }
  }

  val exportCsvLauncher = rememberLauncherForActivityResult(
    contract = ActivityResultContracts.CreateDocument("text/csv"),
  ) { uri: Uri? ->
    val csv = pendingExportCsv
    pendingExportCsv = null
    if (uri != null && csv != null) {
      context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use { it.write(csv) }
      scope.launch {
        snackbarHostState.showSnackbar("Backup CSV esportato correttamente")
      }
    }
  }

  LaunchedEffect(Unit) {
    vm.messages.collect { msg ->
      snackbarHostState.showSnackbar(msg)
    }
  }

  LaunchedEffect(state.currentYear?.id, state.settings.saveCountSinceBackup) {
    if (!backupReminderShown && state.currentYear != null && state.settings.saveCountSinceBackup > 30) {
      backupReminderShown = true
      showBackupReminderDialog = true
    }
  }

  val currentYear = state.currentYear
  val helpTopic = when {
    currentYear == null -> HelpTopic.YEAR_SELECTION
    state.activeTab == MainTab.DAILY && state.activeDayDetailDate != null -> HelpTopic.WORK_DAY_DETAIL
    state.activeTab == MainTab.DAILY -> HelpTopic.DAILY_LOGGING
    state.activeTab == MainTab.SUMMARY -> HelpTopic.FINANCIAL_SUMMARY
    state.activeTab == MainTab.WORKERS -> HelpTopic.WORKER_REGISTRY
    else -> HelpTopic.OTHERS
  }

  Scaffold(
    snackbarHost = { SnackbarHost(snackbarHostState) },
    topBar = {
      if (currentYear != null && state.activeDayDetailDate == null) {
        val title = when (state.activeTab) {
          MainTab.DAILY -> "Ore Lavorate - ${currentYear.id}"
          MainTab.SUMMARY -> "Riepilogo - ${currentYear.id}"
          MainTab.WORKERS -> "Registro Braccianti"
          MainTab.OTHERS -> "Altre Funzioni"
        }
        TopAppBar(
          title = { Text(title) },
          actions = {
            IconButton(onClick = { showHelpDialog = true }) {
              Icon(Icons.Default.Info, contentDescription = "Guida")
            }
            IconButton(onClick = { vm.deselectYear() }) {
              Icon(Icons.Default.Home, contentDescription = "Cambia annata")
            }
          },
        )
      }
    },
    bottomBar = {
      if (currentYear != null && state.activeDayDetailDate == null) {
        NavigationBar {
          NavigationBarItem(
            selected = state.activeTab == MainTab.DAILY,
            onClick = { vm.setActiveTab(MainTab.DAILY) },
            icon = { Icon(Icons.Default.DateRange, contentDescription = null) },
            label = { Text(MainTab.DAILY.label) },
          )
          NavigationBarItem(
            selected = state.activeTab == MainTab.SUMMARY,
            onClick = { vm.setActiveTab(MainTab.SUMMARY) },
            icon = { Icon(Icons.AutoMirrored.Filled.List, contentDescription = null) },
            label = { Text(MainTab.SUMMARY.label) },
          )
          NavigationBarItem(
            selected = state.activeTab == MainTab.WORKERS,
            onClick = { vm.setActiveTab(MainTab.WORKERS) },
            icon = { Icon(Icons.Default.Person, contentDescription = null) },
            label = { Text(MainTab.WORKERS.label) },
          )
          NavigationBarItem(
            selected = state.activeTab == MainTab.OTHERS,
            onClick = { vm.setActiveTab(MainTab.OTHERS) },
            icon = { Icon(Icons.Default.Settings, contentDescription = null) },
            label = { Text(MainTab.OTHERS.label) },
          )
        }
      }
    },
  ) { innerPadding ->
    if (currentYear == null) {
      YearSelectionScreen(
        years = state.years,
        onSelectYear = vm::selectYear,
        onCreateYear = vm::createYear,
        onDeleteYear = vm::deleteYear,
        onImportCsvClick = { importCsvLauncher.launch(arrayOf("text/*", "text/csv", "*/*")) },
        modifier = Modifier.padding(innerPadding),
      )
    } else if (state.activeTab == MainTab.DAILY && state.activeDayDetailDate != null) {
      WorkDayDetailScreen(
        yearId = currentYear.id,
        initialDateMillis = state.activeDayDetailDate!!,
        workers = state.workersWithRate,
        groups = state.groupsWithMembers,
        logsForYear = state.logsForYear,
        onBack = vm::closeDayDetail,
        onSaveSingleLog = { id, workerId, date, mStart, mEnd, aStart, aEnd ->
          vm.saveWorkLog(id, workerId, currentYear.id, date, mStart, mEnd, aStart, aEnd)
        },
        onSaveRangeLogs = { workerIds, start, end, mStart, mEnd, aStart, aEnd ->
          vm.saveWorkLogRange(workerIds, currentYear.id, start, end, mStart, mEnd, aStart, aEnd)
        },
        onDeleteLog = vm::deleteWorkLog,
        onToggleManualHoliday = vm::toggleManualHolidayForLog,
        modifier = Modifier.padding(innerPadding),
      )
    } else {
      when (state.activeTab) {
        MainTab.DAILY -> DailyLoggingScreen(
          yearId = currentYear.id,
          logs = state.logsForYear,
          allWorkers = state.allWorkers,
          settings = state.settings,
          defaultDateMillis = vm.defaultDateForYear(currentYear.id),
          onOpenDayDetail = vm::openDayDetail,
          onToggleGlobalHoliday = { date -> vm.toggleGlobalHolidayForDate(date, currentYear.id) },
          modifier = Modifier.padding(innerPadding),
        )
        MainTab.SUMMARY -> FinancialSummaryScreen(
          yearId = currentYear.id,
          logs = state.logsForYear,
          allWorkers = state.allWorkers,
          groups = state.groupsWithMembers,
          settings = state.settings,
          defaultDateMillis = vm.defaultDateForYear(currentYear.id),
          modifier = Modifier.padding(innerPadding),
        )
        MainTab.WORKERS -> WorkerRegistryScreen(
          yearId = currentYear.id,
          allWorkers = state.allWorkers,
          workersWithRate = state.workersWithRate,
          groupsWithMembers = state.groupsWithMembers,
          onSaveWorker = { id, surname, name, phone, rate, extra, holiday ->
            vm.saveWorkerForYear(id, currentYear.id, surname, name, phone, rate, extra, holiday)
          },
          onSetArchived = vm::setWorkerArchived,
          onDeleteWorker = vm::deleteWorker,
          onMergeDuplicates = vm::mergeDuplicateGroup,
          onCopyWorkersFromPrevYear = { vm.copyWorkersFromPreviousYear(currentYear.id) },
          onCreateGroup = { name -> vm.createGroup(name, currentYear.id) },
          onDeleteGroup = vm::deleteGroup,
          onSetGroupMember = vm::setGroupMember,
          onCopyGroupsFromPrevYear = { vm.copyGroupsFromPreviousYear(currentYear.id) },
          modifier = Modifier.padding(innerPadding),
        )
        MainTab.OTHERS -> OthersScreen(
          settings = state.settings,
          backupHistory = state.backupHistory,
          onSaveSettings = vm::saveOwnerSettings,
          onExportCsvClick = {
            vm.exportCsvBackup { res ->
              pendingExportCsv = res.csvContent
              exportCsvLauncher.launch(BackupCsvCodec.DEFAULT_BACKUP_FILENAME)
            }
          },
          onImportCsvClick = { importCsvLauncher.launch(arrayOf("text/*", "text/csv", "*/*")) },
          onRestoreBackupItem = { item -> vm.importCsvBackup(item.csvContent) },
          onDeleteBackupItem = vm::deleteBackupHistoryItem,
          onClearDatabase = vm::clearAllDatabase,
          modifier = Modifier.padding(innerPadding),
        )
      }
    }
  }

  if (showHelpDialog) {
    HelpDialog(
      topic = helpTopic,
      onDismiss = { showHelpDialog = false },
    )
  }

  if (showBackupReminderDialog) {
    AlertDialog(
      onDismissRequest = { showBackupReminderDialog = false },
      title = { Text("Promemoria Backup") },
      text = {
        Text("Hai effettuato più di 30 salvataggi dall'ultimo backup CSV. Ti consigliamo di esportare un backup nella scheda Varie.")
      },
      confirmButton = {
        Button(onClick = {
          showBackupReminderDialog = false
          vm.setActiveTab(MainTab.OTHERS)
        }) {
          Text("Vai a Varie")
        }
      },
      dismissButton = {
        TextButton(onClick = { showBackupReminderDialog = false }) {
          Text("Più tardi")
        }
      },
    )
  }
}
