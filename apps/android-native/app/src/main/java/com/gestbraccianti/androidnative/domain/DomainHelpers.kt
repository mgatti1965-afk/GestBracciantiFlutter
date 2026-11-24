package com.gestbraccianti.androidnative.domain

import java.text.Collator
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeParseException
import java.util.Locale

object DomainHelpers {
  private val IT_COLLATOR: Collator = Collator.getInstance(Locale.forLanguageTag("it-IT")).apply {
    strength = Collator.SECONDARY
  }

  fun toLocalMidnightMillis(date: LocalDate): Long =
    date.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()

  fun millisToLocalDate(millis: Long): LocalDate =
    Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).toLocalDate()

  fun toIsoLocalDate(millis: Long): String = millisToLocalDate(millis).toString()

  fun toMidnightMillisFromIso(dateIso: String): Long {
    if (!Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(dateIso)) {
      throw IllegalArgumentException("Data non valida.")
    }
    return try {
      toLocalMidnightMillis(LocalDate.parse(dateIso))
    } catch (e: DateTimeParseException) {
      throw IllegalArgumentException("Data non valida.", e)
    }
  }

  fun normalizeYearInput(id: Int, notes: String = ""): HarvestYear {
    if (id < 2000 || id > 2100) {
      throw IllegalArgumentException("Anno non valido. Usa un valore tra 2000 e 2100.")
    }
    return HarvestYear(
      id = id,
      isCurrent = false,
      notes = notes.trim(),
    )
  }

  fun sortYearsDesc(years: List<HarvestYear>): List<HarvestYear> =
    years.sortedByDescending { it.id }

  fun ensureSingleCurrent(years: List<HarvestYear>, currentId: Int): List<HarvestYear> =
    years.map { it.copy(isCurrent = it.id == currentId) }

  data class NormalizedWorkerFields(
    val surname: String,
    val name: String,
    val phoneNumber: String,
  )

  fun normalizeWorkerFields(
    surname: String,
    name: String = "",
    phoneNumber: String = "",
  ): NormalizedWorkerFields {
    val normalizedSurname = DomainCalculator.capitalizeWords(surname)
    if (normalizedSurname.isEmpty()) {
      throw IllegalArgumentException("Il cognome è obbligatorio.")
    }
    return NormalizedWorkerFields(
      surname = normalizedSurname,
      name = DomainCalculator.capitalizeWords(name),
      phoneNumber = phoneNumber.trim(),
    )
  }

  fun sortWorkers(workers: List<Worker>): List<Worker> =
    workers.sortedWith { a, b ->
      val sc = IT_COLLATOR.compare(a.surname, b.surname)
      if (sc != 0) sc else IT_COLLATOR.compare(a.name, b.name)
    }

  fun sortWorkersWithRate(workers: List<WorkerWithRate>): List<WorkerWithRate> =
    workers.sortedWith { a, b ->
      val sc = IT_COLLATOR.compare(a.surname, b.surname)
      if (sc != 0) sc else IT_COLLATOR.compare(a.name, b.name)
    }

  fun workerFullName(worker: Worker?, fallbackId: Int? = null): String {
    if (worker == null) {
      return if (fallbackId != null) "Bracciante #$fallbackId" else "Bracciante"
    }
    return "${worker.surname} ${worker.name}".trim()
  }

  fun findDuplicateWorkerGroups(workers: List<Worker>): List<List<Worker>> {
    val buckets = LinkedHashMap<String, MutableList<Worker>>()
    val itLocale = Locale.forLanguageTag("it-IT")
    for (worker in workers) {
      val key = "${worker.surname}${worker.name}"
        .lowercase(itLocale)
        .replace(Regex("\\s+"), "")
      if (key.isEmpty()) continue
      buckets.getOrPut(key) { mutableListOf() }.add(worker)
    }
    return buckets.values
      .filter { it.size > 1 }
      .map { group -> group.sortedBy { it.id } }
  }

  fun computeWorkLogFromShifts(
    id: Int = 0,
    workerId: Int,
    harvestYearId: Int,
    date: Long,
    morningStart: String?,
    morningEnd: String?,
    afternoonStart: String?,
    afternoonEnd: String?,
    hourlyRate: Double,
    extraHourlyRate: Double,
    holidayHourlyRate: Double,
    isManualHoliday: Boolean,
    settings: OwnerSettings,
  ): WorkLog {
    val totalHours = DomainCalculator.calculateShiftHours(
      morningStart = morningStart,
      morningEnd = morningEnd,
      afternoonStart = afternoonStart,
      afternoonEnd = afternoonEnd,
    )
    val globalSet = settings.globalFestiveDates.toSet()
    val isHoliday = DomainCalculator.isDateFestive(
      dateMillis = date,
      isManual = isManualHoliday,
      festiveType = settings.festiveDaysType,
      globalFestiveDates = globalSet,
    )
    val calc = DomainCalculator.computeCompensation(
      CompensationInput(
        totalHours = totalHours,
        extraThreshold = settings.extraHoursThreshold,
        isHoliday = isHoliday,
        hourlyRate = hourlyRate,
        extraHourlyRate = extraHourlyRate,
        holidayHourlyRate = holidayHourlyRate,
      ),
    )

    return WorkLog(
      id = id,
      workerId = workerId,
      harvestYearId = harvestYearId,
      date = date,
      morningStart = morningStart?.takeIf { it.isNotBlank() },
      morningEnd = morningEnd?.takeIf { it.isNotBlank() },
      afternoonStart = afternoonStart?.takeIf { it.isNotBlank() },
      afternoonEnd = afternoonEnd?.takeIf { it.isNotBlank() },
      totalHours = totalHours,
      ordinaryHours = calc.ordinaryHours,
      extraHours = calc.extraHours,
      holidayHours = calc.holidayHours,
      hourlyRate = DomainCalculator.round2(hourlyRate),
      extraHourlyRate = DomainCalculator.round2(extraHourlyRate),
      holidayHourlyRate = DomainCalculator.round2(holidayHourlyRate),
      totalAmount = calc.totalAmount,
      ordinaryAmount = calc.ordinaryAmount,
      extraAmount = calc.extraAmount,
      holidayAmount = calc.holidayAmount,
      isManualHoliday = isManualHoliday,
    )
  }

  fun recalculateWorkLog(log: WorkLog, settings: OwnerSettings): WorkLog {
    val globalSet = settings.globalFestiveDates.toSet()
    val isHoliday = DomainCalculator.isDateFestive(
      dateMillis = log.date,
      isManual = log.isManualHoliday,
      festiveType = settings.festiveDaysType,
      globalFestiveDates = globalSet,
    )
    val calc = DomainCalculator.computeCompensation(
      CompensationInput(
        totalHours = log.totalHours,
        extraThreshold = settings.extraHoursThreshold,
        isHoliday = isHoliday,
        hourlyRate = log.hourlyRate,
        extraHourlyRate = log.extraHourlyRate,
        holidayHourlyRate = log.holidayHourlyRate,
      ),
    )

    return log.copy(
      ordinaryHours = calc.ordinaryHours,
      extraHours = calc.extraHours,
      holidayHours = calc.holidayHours,
      ordinaryAmount = calc.ordinaryAmount,
      extraAmount = calc.extraAmount,
      holidayAmount = calc.holidayAmount,
      totalAmount = calc.totalAmount,
    )
  }

  fun sortLogsByDateDesc(logs: List<WorkLog>): List<WorkLog> =
    logs.sortedWith(compareByDescending<WorkLog> { it.date }.thenByDescending { it.id })
}
