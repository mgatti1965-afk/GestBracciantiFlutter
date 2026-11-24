package com.gestbraccianti.androidnative.data

import androidx.room.Room
import androidx.test.platform.app.InstrumentationRegistry
import com.gestbraccianti.androidnative.data.local.AppDatabase
import com.gestbraccianti.androidnative.data.local.WorkerEntity
import com.gestbraccianti.androidnative.data.local.WorkerYearConfigEntity
import com.gestbraccianti.androidnative.domain.DomainHelpers
import com.gestbraccianti.androidnative.domain.FestiveDaysType
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.LocalDate

class AppRepositoryTest {
  private lateinit var db: AppDatabase
  private lateinit var repo: AppRepository

  @Before
  fun setUp() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
      .allowMainThreadQueries()
      .build()
    repo = AppRepository(db)
  }

  @After
  fun tearDown() {
    db.close()
  }

  @Test
  fun createYearWithMigrationCopiesWorkersAndGroups() = runTest {
    repo.createYear(yearId = 2025, notes = "Prima annata")
    repo.addOrUpdateWorkerForYear(
      yearId = 2025,
      surname = "rossi",
      name = "mario",
      phoneNumber = "333111222",
      hourlyRate = 10.0,
      extraHourlyRate = 12.0,
      holidayHourlyRate = 15.0,
    )
    val workers2025 = repo.getWorkersWithRateForYear(2025)
    assertEquals(1, workers2025.size)

    repo.createGroup("Squadra A", 2025)
    val groups2025 = repo.getGroupsWithMembersForYear(2025)
    assertEquals(1, groups2025.size)
    repo.setGroupMember(groups2025[0].group.id, workers2025[0].id, true)

    repo.createYear(
      yearId = 2026,
      notes = "Seconda annata",
      migrateFromYearId = 2025,
      migrateWorkers = true,
      migrateGroups = true,
    )

    val years = repo.getAllYears()
    assertEquals(listOf(2026, 2025), years.map { it.id })
    assertEquals(2026, repo.getCurrentYear()?.id)
    assertFalse(years.first { it.id == 2025 }.isCurrent)

    val workers2026 = repo.getWorkersWithRateForYear(2026)
    assertEquals(1, workers2026.size)
    assertEquals(10.0, workers2026[0].hourlyRate, 0.001)

    val groups2026 = repo.getGroupsWithMembersForYear(2026)
    assertEquals(1, groups2026.size)
    assertEquals("Squadra A", groups2026[0].group.name)
    assertEquals(listOf(workers2025[0].id), groups2026[0].members.map { it.id })
  }

  @Test
  fun saveWorkLogRangeAndToggleGlobalHolidayRecalculateLogs() = runTest {
    repo.createYear(yearId = 2026)
    repo.addOrUpdateWorkerForYear(
      yearId = 2026,
      surname = "Bianchi",
      name = "Luca",
      hourlyRate = 10.0,
      extraHourlyRate = 12.0,
      holidayHourlyRate = 15.0,
    )
    val workerId = repo.getWorkersWithRateForYear(2026).first().id

    val start = DomainHelpers.toLocalMidnightMillis(LocalDate.of(2026, 9, 7))
    val end = DomainHelpers.toLocalMidnightMillis(LocalDate.of(2026, 9, 9))

    val savedCount = repo.saveWorkLogRange(
      workerIds = listOf(workerId),
      yearId = 2026,
      startDate = start,
      endDate = end,
      morningStart = "08:00",
      morningEnd = "12:00",
      afternoonStart = "13:00",
      afternoonEnd = "17:00",
    )
    assertEquals(3, savedCount)

    val logsBefore = repo.getLogsForYear(2026)
    assertEquals(3, logsBefore.size)
    assertTrue(logsBefore.all { it.ordinaryHours == 8.0 && it.totalAmount == 80.0 })

    val toggleRes = repo.toggleGlobalHolidayForDate(start, 2026)
    assertTrue(toggleRes.isOverridden)
    assertEquals(1, toggleRes.affectedCount)

    val logsAfter = repo.getLogsForYear(2026)
    val toggledDay = logsAfter.first { it.date == start }
    assertEquals(8.0, toggledDay.holidayHours, 0.001)
    assertEquals(120.0, toggledDay.totalAmount, 0.001)
  }

  @Test
  fun mergeDuplicateGroupTransfersLogsMembershipsAndConfigs() = runTest {
    repo.createYear(yearId = 2025)
    repo.createYear(yearId = 2026)

    repo.addOrUpdateWorkerForYear(
      yearId = 2025,
      surname = "Verdi",
      name = "Paolo",
      hourlyRate = 9.0,
      extraHourlyRate = 11.0,
      holidayHourlyRate = 13.0,
    )
    val w1 = repo.getAllWorkers().first().id

    val w2Id = db.workerDao().insert(
      WorkerEntity(
        name = "Paolo",
        surname = "Verdi",
        phoneNumber = "999",
        isArchived = false,
      ),
    ).toInt()
    db.workerYearConfigDao().upsert(
      WorkerYearConfigEntity(
        workerId = w2Id,
        harvestYearId = 2026,
        hourlyRate = 10.0,
        extraHourlyRate = 12.0,
        holidayHourlyRate = 15.0,
      ),
    )

    val date2026 = DomainHelpers.toLocalMidnightMillis(LocalDate.of(2026, 9, 10))
    repo.saveWorkLog(
      workerId = w2Id,
      yearId = 2026,
      date = date2026,
      morningStart = "08:00",
      morningEnd = "12:00",
      afternoonStart = null,
      afternoonEnd = null,
    )

    repo.mergeDuplicateGroup(listOf(w2Id, w1))

    val remaining = repo.getAllWorkers()
    assertEquals(1, remaining.size)
    assertEquals(w1, remaining.first().id)

    val logs2026 = repo.getLogsForYear(2026)
    assertEquals(1, logs2026.size)
    assertEquals(w1, logs2026.first().workerId)

    val workers2026 = repo.getWorkersWithRateForYear(2026)
    assertEquals(1, workers2026.size)
    assertEquals(10.0, workers2026.first().hourlyRate, 0.001)
  }

  @Test
  fun clearAllDatabaseResetsEntitiesAndSettings() = runTest {
    repo.createYear(yearId = 2026)
    repo.updateSettings { it.copy(ownerName = "Azienda", festiveDaysType = FestiveDaysType.NONE) }
    assertNotNull(repo.getCurrentYear())

    repo.clearAllDatabase()
    assertNull(repo.getCurrentYear())
    assertTrue(repo.getAllYears().isEmpty())
    assertEquals("", repo.getSettings().ownerName)
    assertEquals(FestiveDaysType.SATURDAY_AND_SUNDAY, repo.getSettings().festiveDaysType)
  }
}
