package com.gestbraccianti.androidnative.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.LocalDate

class BackupCsvCodecTest {
  private fun findFixturesDir(): File {
    val candidates = listOf(
      File("shared/test-fixtures/csv"),
      File("../shared/test-fixtures/csv"),
      File("../../shared/test-fixtures/csv"),
      File("../../../shared/test-fixtures/csv"),
    )
    return candidates.firstOrNull { it.exists() && it.isDirectory }
      ?: error("Impossibile trovare shared/test-fixtures/csv da ${File(".").absolutePath}")
  }

  @Test
  fun `export and re-import round-trips full backup dataset`() {
    val dateMillis = DomainHelpers.toLocalMidnightMillis(LocalDate.of(2026, 9, 10))
    val settings = OwnerSettings(
      ownerName = "Mario",
      ownerSurname = "Rossi",
      extraHoursThreshold = 8.0,
      festiveDaysType = FestiveDaysType.SATURDAY_AND_SUNDAY,
      globalFestiveDates = listOf(dateMillis),
    )
    val log = DomainHelpers.computeWorkLogFromShifts(
      id = 1,
      workerId = 1,
      harvestYearId = 2026,
      date = dateMillis,
      morningStart = "08:00",
      morningEnd = "12:00",
      afternoonStart = "13:00",
      afternoonEnd = "17:00",
      hourlyRate = 10.0,
      extraHourlyRate = 12.0,
      holidayHourlyRate = 15.0,
      isManualHoliday = false,
      settings = settings,
    )
    val dataset = FullBackupDataset(
      settings = settings,
      years = listOf(HarvestYear(2026, isCurrent = true, notes = "Note\nlinea 2")),
      workers = listOf(Worker(1, "Luca", "Bianchi", "3331234567", isArchived = false)),
      configs = listOf(WorkerYearConfig(1, 2026, 10.0, 12.0, 15.0)),
      groups = listOf(WorkerGroup(1, "Squadra A", 2026)),
      groupMembers = listOf(WorkerGroupMember(1, 1)),
      plantations = listOf(Plantation(1, "Vigna Nord", isArchived = false)),
      logs = listOf(log),
    )

    val csv = BackupCsvCodec.exportBackupCsv(dataset, 1789000000000L)
    val parsed = BackupCsvCodec.importFullBackupCsv(csv)

    assertNotNull(parsed.backupHeaderDate)
    assertEquals("Mario", parsed.dataset.settings.ownerName)
    assertEquals("Rossi", parsed.dataset.settings.ownerSurname)
    assertEquals(listOf(dateMillis), parsed.dataset.settings.globalFestiveDates)
    assertEquals(1, parsed.dataset.years.size)
    assertEquals("Note\nlinea 2", parsed.dataset.years.first().notes)
    assertEquals(1, parsed.dataset.workers.size)
    assertEquals(1, parsed.dataset.configs.size)
    assertEquals(1, parsed.dataset.groups.size)
    assertEquals(1, parsed.dataset.groupMembers.size)
    assertEquals(1, parsed.dataset.plantations.size)
    assertEquals(1, parsed.dataset.logs.size)
    assertEquals(120.0, parsed.dataset.logs.first().totalAmount, 0.001)
  }

  @Test
  fun `imports canonical and legacy shared fixtures`() {
    val dir = findFixturesDir()

    val canonical = BackupCsvCodec.importFullBackupCsv(File(dir, "canonical-valid.csv").readText())
    assertEquals(2, canonical.dataset.years.size)
    assertEquals(3, canonical.dataset.workers.size)
    assertEquals(3, canonical.dataset.logs.size)

    val multiCurrent = BackupCsvCodec.importFullBackupCsv(File(dir, "canonical-multi-current.csv").readText())
    assertEquals(1, multiCurrent.dataset.years.count { it.isCurrent })

    val legacy = BackupCsvCodec.importFullBackupCsv(File(dir, "legacy-valid.csv").readText())
    assertTrue(legacy.dataset.years.isNotEmpty())
    assertTrue(legacy.dataset.logs.isNotEmpty())

    val aliases = BackupCsvCodec.importFullBackupCsv(File(dir, "legacy-aliases-and-mixed-numbers.csv").readText())
    assertEquals(2032, aliases.dataset.years.first().id)
    assertEquals(8.25, aliases.dataset.logs.first().totalHours, 0.001)

    val quoted = BackupCsvCodec.importFullBackupCsv(File(dir, "legacy-quoted-fields.csv").readText())
    assertTrue(quoted.dataset.workers.isNotEmpty())
  }

  @Test(expected = IllegalArgumentException::class)
  fun `rejects canonical fixture with missing worker reference`() {
    val dir = findFixturesDir()
    BackupCsvCodec.importFullBackupCsv(File(dir, "canonical-invalid-missing-worker.csv").readText())
  }

  @Test
  fun `imports anonymized production multi-section backups`() {
    val realDir = File(findFixturesDir(), "real-anonymized")
    val files = realDir.listFiles { f -> f.extension == "csv" } ?: emptyArray()
    assertTrue(files.isNotEmpty())
    for (file in files) {
      val parsed = BackupCsvCodec.importFullBackupCsv(file.readText())
      assertTrue(parsed.dataset.years.isNotEmpty())
      assertTrue(parsed.dataset.workers.isNotEmpty())
      assertTrue(parsed.dataset.logs.isNotEmpty())
    }
  }
}
