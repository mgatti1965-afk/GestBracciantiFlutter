package com.gestbraccianti.androidnative.domain

import java.text.NumberFormat
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale
import kotlin.math.max
import kotlin.math.min

object DomainCalculator {
  private val TIME_REGEX = Regex("^([01]?\\d|2[0-3]):([0-5]\\d)$")
  private val IT_LOCALE = Locale.forLanguageTag("it-IT")

  private fun clampNonNegative(value: Double): Double =
    if (value.isFinite() && value > 0.0) value else 0.0

  fun round2(value: Double): Double = java.lang.Math.round(value * 100.0) / 100.0

  fun computeCompensation(input: CompensationInput): CompensationOutput {
    val totalHours = clampNonNegative(input.totalHours)
    val extraThreshold = clampNonNegative(input.extraThreshold)
    val hourlyRate = clampNonNegative(input.hourlyRate)
    val extraHourlyRate = clampNonNegative(input.extraHourlyRate)
    val holidayHourlyRate = clampNonNegative(input.holidayHourlyRate)

    val ordinaryHours: Double
    val extraHours: Double
    val holidayHours: Double

    if (input.isHoliday) {
      ordinaryHours = 0.0
      extraHours = 0.0
      holidayHours = totalHours
    } else {
      ordinaryHours = min(totalHours, extraThreshold)
      extraHours = max(totalHours - extraThreshold, 0.0)
      holidayHours = 0.0
    }

    val ordinaryAmount = round2(ordinaryHours * hourlyRate)
    val extraAmount = round2(extraHours * extraHourlyRate)
    val holidayAmount = round2(holidayHours * holidayHourlyRate)
    val totalAmount = round2(ordinaryAmount + extraAmount + holidayAmount)

    return CompensationOutput(
      ordinaryHours = round2(ordinaryHours),
      extraHours = round2(extraHours),
      holidayHours = round2(holidayHours),
      ordinaryAmount = ordinaryAmount,
      extraAmount = extraAmount,
      holidayAmount = holidayAmount,
      totalAmount = totalAmount,
    )
  }

  /**
   * Determines whether a local-midnight date timestamp is festive:
   * manual per-log or global per-date override inverts the natural weekly holiday configuration.
   */
  fun isDateFestive(
    dateMillis: Long,
    isManual: Boolean,
    festiveType: FestiveDaysType,
    globalFestiveDates: Set<Long> = emptySet(),
  ): Boolean {
    val dayOfWeek = Instant.ofEpochMilli(dateMillis)
      .atZone(ZoneId.systemDefault())
      .dayOfWeek

    val naturalFestive = when (festiveType) {
      FestiveDaysType.NONE -> false
      FestiveDaysType.SATURDAY -> dayOfWeek == DayOfWeek.SATURDAY
      FestiveDaysType.SUNDAY -> dayOfWeek == DayOfWeek.SUNDAY
      FestiveDaysType.SATURDAY_AND_SUNDAY ->
        dayOfWeek == DayOfWeek.SATURDAY || dayOfWeek == DayOfWeek.SUNDAY
    }

    val isOverridden = isManual || globalFestiveDates.contains(dateMillis)
    return if (isOverridden) !naturalFestive else naturalFestive
  }

  fun parseTimeToMinutes(timeStr: String?): Int? {
    val trimmed = timeStr?.trim() ?: return null
    if (trimmed.isEmpty()) return null
    val match = TIME_REGEX.matchEntire(trimmed) ?: return null
    val hours = match.groupValues[1].toInt()
    val minutes = match.groupValues[2].toInt()
    return hours * 60 + minutes
  }

  fun calculateIntervalHours(start: String?, end: String?): Double {
    val startMin = parseTimeToMinutes(start) ?: return 0.0
    val endMin = parseTimeToMinutes(end) ?: return 0.0
    if (endMin <= startMin) return 0.0
    return round2((endMin - startMin) / 60.0)
  }

  fun calculateShiftHours(
    morningStart: String?,
    morningEnd: String?,
    afternoonStart: String?,
    afternoonEnd: String?,
  ): Double {
    return round2(
      calculateIntervalHours(morningStart, morningEnd) +
        calculateIntervalHours(afternoonStart, afternoonEnd),
    )
  }

  fun formatHoursLabel(hours: Double): String {
    val safe = clampNonNegative(hours)
    val totalMinutes = java.lang.Math.round(safe * 60.0).toInt()
    val h = totalMinutes / 60
    val m = totalMinutes % 60
    return "${h}h $m'"
  }

  fun formatCurrencyIt(amount: Double): String {
    val format = NumberFormat.getCurrencyInstance(IT_LOCALE)
    format.minimumFractionDigits = 2
    format.maximumFractionDigits = 2
    return format.format(amount)
  }

  fun capitalizeWords(value: String): String {
    val trimmed = value.trim()
    if (trimmed.isEmpty()) return ""
    return trimmed
      .lowercase(IT_LOCALE)
      .split(Regex("\\s+"))
      .filter { it.isNotEmpty() }
      .joinToString(" ") { word ->
        word.replaceFirstChar { ch ->
          if (ch.isLowerCase()) ch.titlecase(IT_LOCALE) else ch.toString()
        }
      }
  }
}
