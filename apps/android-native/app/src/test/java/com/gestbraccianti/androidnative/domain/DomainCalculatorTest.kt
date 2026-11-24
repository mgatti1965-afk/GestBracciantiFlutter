package com.gestbraccianti.androidnative.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class DomainCalculatorTest {
  @Test
  fun `R1 and R3 ordinary and extra hours below and above threshold`() {
    val under = DomainCalculator.computeCompensation(
      CompensationInput(
        totalHours = 6.5,
        extraThreshold = 8.0,
        isHoliday = false,
        hourlyRate = 10.0,
        extraHourlyRate = 12.5,
        holidayHourlyRate = 15.0,
      ),
    )
    assertEquals(6.5, under.ordinaryHours, 0.001)
    assertEquals(0.0, under.extraHours, 0.001)
    assertEquals(0.0, under.holidayHours, 0.001)
    assertEquals(65.0, under.ordinaryAmount, 0.001)
    assertEquals(0.0, under.extraAmount, 0.001)
    assertEquals(65.0, under.totalAmount, 0.001)

    val over = DomainCalculator.computeCompensation(
      CompensationInput(
        totalHours = 10.25,
        extraThreshold = 8.0,
        isHoliday = false,
        hourlyRate = 10.0,
        extraHourlyRate = 12.5,
        holidayHourlyRate = 15.0,
      ),
    )
    assertEquals(8.0, over.ordinaryHours, 0.001)
    assertEquals(2.25, over.extraHours, 0.001)
    assertEquals(0.0, over.holidayHours, 0.001)
    assertEquals(80.0, over.ordinaryAmount, 0.001)
    assertEquals(28.13, over.extraAmount, 0.001)
    assertEquals(108.13, over.totalAmount, 0.001)
  }

  @Test
  fun `R2 holiday converts all hours to holidayHours`() {
    val holiday = DomainCalculator.computeCompensation(
      CompensationInput(
        totalHours = 9.0,
        extraThreshold = 8.0,
        isHoliday = true,
        hourlyRate = 10.0,
        extraHourlyRate = 12.5,
        holidayHourlyRate = 15.0,
      ),
    )
    assertEquals(0.0, holiday.ordinaryHours, 0.001)
    assertEquals(0.0, holiday.extraHours, 0.001)
    assertEquals(9.0, holiday.holidayHours, 0.001)
    assertEquals(0.0, holiday.ordinaryAmount, 0.001)
    assertEquals(0.0, holiday.extraAmount, 0.001)
    assertEquals(135.0, holiday.holidayAmount, 0.001)
    assertEquals(135.0, holiday.totalAmount, 0.001)
  }

  @Test
  fun `negative inputs are clamped to zero`() {
    val res = DomainCalculator.computeCompensation(
      CompensationInput(
        totalHours = -3.0,
        extraThreshold = -1.0,
        isHoliday = false,
        hourlyRate = -10.0,
        extraHourlyRate = 12.0,
        holidayHourlyRate = 15.0,
      ),
    )
    assertEquals(0.0, res.ordinaryHours, 0.001)
    assertEquals(0.0, res.extraHours, 0.001)
    assertEquals(0.0, res.totalAmount, 0.001)
  }

  @Test
  fun `R4 festive calendar with weekly config and manual or global override`() {
    val thursday = DomainHelpers.toLocalMidnightMillis(LocalDate.of(2026, 9, 10)) // Thursday
    val saturday = DomainHelpers.toLocalMidnightMillis(LocalDate.of(2026, 9, 12)) // Saturday
    val sunday = DomainHelpers.toLocalMidnightMillis(LocalDate.of(2026, 9, 13))   // Sunday

    assertFalse(DomainCalculator.isDateFestive(thursday, false, FestiveDaysType.SATURDAY_AND_SUNDAY))
    assertTrue(DomainCalculator.isDateFestive(saturday, false, FestiveDaysType.SATURDAY_AND_SUNDAY))
    assertTrue(DomainCalculator.isDateFestive(sunday, false, FestiveDaysType.SATURDAY_AND_SUNDAY))

    assertTrue(DomainCalculator.isDateFestive(saturday, false, FestiveDaysType.SATURDAY))
    assertFalse(DomainCalculator.isDateFestive(sunday, false, FestiveDaysType.SATURDAY))

    assertFalse(DomainCalculator.isDateFestive(saturday, false, FestiveDaysType.SUNDAY))
    assertTrue(DomainCalculator.isDateFestive(sunday, false, FestiveDaysType.SUNDAY))

    assertFalse(DomainCalculator.isDateFestive(sunday, false, FestiveDaysType.NONE))

    // Manual override inverts natural festive
    assertTrue(DomainCalculator.isDateFestive(thursday, true, FestiveDaysType.SATURDAY_AND_SUNDAY))
    assertFalse(DomainCalculator.isDateFestive(sunday, true, FestiveDaysType.SATURDAY_AND_SUNDAY))

    // Global festive override inverts natural festive
    assertTrue(
      DomainCalculator.isDateFestive(
        dateMillis = thursday,
        isManual = false,
        festiveType = FestiveDaysType.SATURDAY_AND_SUNDAY,
        globalFestiveDates = setOf(thursday),
      ),
    )
    assertFalse(
      DomainCalculator.isDateFestive(
        dateMillis = sunday,
        isManual = false,
        festiveType = FestiveDaysType.SATURDAY_AND_SUNDAY,
        globalFestiveDates = setOf(sunday),
      ),
    )
  }

  @Test
  fun `shift time parsing and interval calculation`() {
    assertNull(DomainCalculator.parseTimeToMinutes(null))
    assertNull(DomainCalculator.parseTimeToMinutes("25:00"))
    assertEquals(8 * 60 + 15, DomainCalculator.parseTimeToMinutes("8:15"))
    assertEquals(8 * 60 + 15, DomainCalculator.parseTimeToMinutes("08:15"))

    assertEquals(4.0, DomainCalculator.calculateIntervalHours("08:00", "12:00"), 0.001)
    assertEquals(0.0, DomainCalculator.calculateIntervalHours("12:00", "08:00"), 0.001)
    assertEquals(
      7.5,
      DomainCalculator.calculateShiftHours("08:00", "12:00", "13:30", "17:00"),
      0.001,
    )
    assertEquals("7h 30'", DomainCalculator.formatHoursLabel(7.5))
    assertEquals("Mario Rossi", DomainCalculator.capitalizeWords("  mArIo   ROSSI "))
  }
}
