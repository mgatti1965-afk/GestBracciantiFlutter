package com.gestbraccianti.androidnative.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class DomainHelpersTest {
  @Test
  fun `R5 ensureSingleCurrent marks only target year`() {
    val years = listOf(
      HarvestYear(id = 2024, isCurrent = true, notes = ""),
      HarvestYear(id = 2025, isCurrent = false, notes = ""),
      HarvestYear(id = 2026, isCurrent = false, notes = ""),
    )
    val updated = DomainHelpers.ensureSingleCurrent(years, 2026)
    assertFalse(updated.first { it.id == 2024 }.isCurrent)
    assertFalse(updated.first { it.id == 2025 }.isCurrent)
    assertTrue(updated.first { it.id == 2026 }.isCurrent)
  }

  @Test(expected = IllegalArgumentException::class)
  fun `normalizeYearInput rejects out of range years`() {
    DomainHelpers.normalizeYearInput(1999)
  }

  @Test
  fun `normalizeWorkerFields capitalizes surname and name`() {
    val normalized = DomainHelpers.normalizeWorkerFields(
      surname = "  de luca ",
      name = " giuseppe ",
      phoneNumber = " 3331234567 ",
    )
    assertEquals("De Luca", normalized.surname)
    assertEquals("Giuseppe", normalized.name)
    assertEquals("3331234567", normalized.phoneNumber)
  }

  @Test(expected = IllegalArgumentException::class)
  fun `normalizeWorkerFields requires surname`() {
    DomainHelpers.normalizeWorkerFields(surname = "   ", name = "Mario")
  }

  @Test
  fun `findDuplicateWorkerGroups detects case and whitespace duplicates`() {
    val workers = listOf(
      Worker(id = 3, name = "Mario", surname = "Rossi", phoneNumber = "", isArchived = false),
      Worker(id = 1, name = "mario", surname = "  rossi ", phoneNumber = "", isArchived = false),
      Worker(id = 2, name = "Luigi", surname = "Verdi", phoneNumber = "", isArchived = false),
    )
    val dupes = DomainHelpers.findDuplicateWorkerGroups(workers)
    assertEquals(1, dupes.size)
    assertEquals(listOf(1, 3), dupes[0].map { it.id })
  }

  @Test
  fun `computeWorkLogFromShifts and recalculateWorkLog match business rules`() {
    val thursday = DomainHelpers.toLocalMidnightMillis(LocalDate.of(2026, 9, 10))
    val settings = OwnerSettings(extraHoursThreshold = 8.0, festiveDaysType = FestiveDaysType.SATURDAY_AND_SUNDAY)

    val log = DomainHelpers.computeWorkLogFromShifts(
      id = 10,
      workerId = 1,
      harvestYearId = 2026,
      date = thursday,
      morningStart = "07:00",
      morningEnd = "12:00",
      afternoonStart = "13:00",
      afternoonEnd = "18:00",
      hourlyRate = 10.0,
      extraHourlyRate = 12.0,
      holidayHourlyRate = 15.0,
      isManualHoliday = false,
      settings = settings,
    )

    assertEquals(10.0, log.totalHours, 0.001)
    assertEquals(8.0, log.ordinaryHours, 0.001)
    assertEquals(2.0, log.extraHours, 0.001)
    assertEquals(0.0, log.holidayHours, 0.001)
    assertEquals(104.0, log.totalAmount, 0.001)

    val updatedSettings = settings.copy(globalFestiveDates = listOf(thursday))
    val recalculated = DomainHelpers.recalculateWorkLog(log, updatedSettings)
    assertEquals(0.0, recalculated.ordinaryHours, 0.001)
    assertEquals(0.0, recalculated.extraHours, 0.001)
    assertEquals(10.0, recalculated.holidayHours, 0.001)
    assertEquals(150.0, recalculated.totalAmount, 0.001)
  }

  @Test
  fun `date conversion round-trips ISO local dates`() {
    val millis = DomainHelpers.toMidnightMillisFromIso("2026-09-10")
    assertEquals("2026-09-10", DomainHelpers.toIsoLocalDate(millis))
  }
}
