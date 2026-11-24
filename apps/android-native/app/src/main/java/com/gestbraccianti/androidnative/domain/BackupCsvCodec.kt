package com.gestbraccianti.androidnative.domain

import java.text.Normalizer
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.truncate

data class ParsedBackupDataset(
  val backupHeaderDate: String?,
  val dataset: FullBackupDataset,
)

object BackupCsvCodec {
  const val DEFAULT_BACKUP_FILENAME = "GestBraccianti_Backup.csv"

  private val HEADER_DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
  private val BKP_HEADER_REGEX = Regex("^#\\s*GESTBRACCIANTI_BKP;(.*)$", RegexOption.IGNORE_CASE)
  private val ISO_DATE_REGEX = Regex("^\\d{4}-\\d{2}-\\d{2}$")
  private val EPOCH_MILLIS_REGEX = Regex("^\\d{10,14}$")
  private val HHMM_REGEX = Regex("^(\\d{1,2}):(\\d{2})$")
  private val TIME_SLOT_REGEX = Regex("^([01]?\\d|2[0-3]):[0-5]\\d$")
  private val MULTI_SECTION_LINE_REGEX = Regex("^(S|W|Y|C|L|G|X|P);.*", RegexOption.IGNORE_CASE)

  fun formatBackupHeaderDate(epochMillis: Long = System.currentTimeMillis()): String {
    val dt = Instant.ofEpochMilli(epochMillis).atZone(ZoneId.systemDefault()).toLocalDateTime()
    return HEADER_DATE_FORMAT.format(dt)
  }

  fun extractBackupHeaderDate(text: String): String? {
    val cleaned = text.removePrefix("\uFEFF").trimStart()
    val firstLine = cleaned.lineSequence().firstOrNull()?.trim() ?: return null
    val match = BKP_HEADER_REGEX.matchEntire(firstLine) ?: return null
    return match.groupValues[1].trim().ifEmpty { null }
  }

  fun parseBackupHeaderDate(headerDateStr: String?): Long? {
    val trimmed = headerDateStr?.trim()?.ifEmpty { null } ?: return null
    return try {
      val normalized = trimmed.replace('T', ' ')
      val dt = LocalDateTime.parse(normalized, HEADER_DATE_FORMAT)
      dt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
    } catch (_: Exception) {
      try {
        Instant.parse(trimmed).toEpochMilli()
      } catch (_: Exception) {
        null
      }
    }
  }

  fun exportBackupCsv(
    dataset: FullBackupDataset,
    exportMillis: Long = System.currentTimeMillis(),
  ): String {
    val sb = StringBuilder()
    sb.append("# GESTBRACCIANTI_BKP;").append(formatBackupHeaderDate(exportMillis)).append('\n')
    sb.append("TIPO;CHIAVE;VALORE\n")
    sb.append("S;owner_name;").append(dataset.settings.ownerName.replace(Regex("[\\r\\n;]"), " ").trim()).append('\n')
    sb.append("S;owner_surname;").append(dataset.settings.ownerSurname.replace(Regex("[\\r\\n;]"), " ").trim()).append('\n')
    sb.append("S;extra_hours_threshold;").append(formatNum(dataset.settings.extraHoursThreshold)).append('\n')
    sb.append("S;festive_days_type;").append(dataset.settings.festiveDaysType.code).append('\n')
    if (dataset.settings.globalFestiveDates.isNotEmpty()) {
      sb.append("S;global_festive_dates;").append(dataset.settings.globalFestiveDates.joinToString(",")).append('\n')
    }

    if (dataset.workers.isNotEmpty()) {
      sb.append("TIPO;ID;COGNOME;NOME;TELEFONO;ARCHIVIATO\n")
      for (w in dataset.workers) {
        sb.append("W;").append(w.id).append(';')
          .append(w.surname.replace(';', ',')).append(';')
          .append(w.name.replace(';', ',')).append(';')
          .append(w.phoneNumber.replace(";", "")).append(';')
          .append(if (w.isArchived) 1 else 0).append('\n')
      }
    }

    if (dataset.years.isNotEmpty()) {
      sb.append("TIPO;ID;CORRENTE;NOTE\n")
      for (y in dataset.years) {
        val escapedNotes = y.notes.replace(Regex("\\r?\\n"), "\\\\n").replace(';', ',')
        sb.append("Y;").append(y.id).append(';')
          .append(if (y.isCurrent) 1 else 0).append(';')
          .append(escapedNotes).append('\n')
      }
    }

    if (dataset.configs.isNotEmpty()) {
      sb.append("TIPO;LAV_ID;ANNO_ID;TARIFFA;STRAORD;FESTIVO\n")
      for (c in dataset.configs) {
        sb.append("C;").append(c.workerId).append(';')
          .append(c.harvestYearId).append(';')
          .append(formatNum(c.hourlyRate)).append(';')
          .append(formatNum(c.extraHourlyRate)).append(';')
          .append(formatNum(c.holidayHourlyRate)).append('\n')
      }
    }

    if (dataset.logs.isNotEmpty()) {
      sb.append("TIPO;LAV_ID;ANNO_ID;DATA;M_IN;M_OUT;P_IN;P_OUT;ORE;TARIFFA;STRAORD;FESTIVO;MAN_FEST;TOTALE;ORD_H;EXT_H;HOL_H;ORD_A;EXT_A;HOL_A\n")
      for (log in dataset.logs) {
        sb.append("L;").append(log.workerId).append(';')
          .append(log.harvestYearId).append(';')
          .append(log.date).append(';')
          .append(log.morningStart ?: "").append(';')
          .append(log.morningEnd ?: "").append(';')
          .append(log.afternoonStart ?: "").append(';')
          .append(log.afternoonEnd ?: "").append(';')
          .append(String.format(Locale.US, "%.2f", log.totalHours)).append(';')
          .append(formatNum(log.hourlyRate)).append(';')
          .append(formatNum(log.extraHourlyRate)).append(';')
          .append(formatNum(log.holidayHourlyRate)).append(';')
          .append(if (log.isManualHoliday) 1 else 0).append(';')
          .append(formatNum(log.totalAmount)).append(';')
          .append(formatNum(log.ordinaryHours)).append(';')
          .append(formatNum(log.extraHours)).append(';')
          .append(formatNum(log.holidayHours)).append(';')
          .append(formatNum(log.ordinaryAmount)).append(';')
          .append(formatNum(log.extraAmount)).append(';')
          .append(formatNum(log.holidayAmount)).append('\n')
      }
    }

    if (dataset.plantations.isNotEmpty()) {
      sb.append("TIPO;ID;NOME;ARCHIVIATO\n")
      for (p in dataset.plantations) {
        sb.append("P;").append(p.id).append(';')
          .append(p.name.replace(';', ',')).append(';')
          .append(if (p.isArchived) 1 else 0).append('\n')
      }
    }

    if (dataset.groups.isNotEmpty()) {
      sb.append("TIPO;ID;NOME;ANNO_ID\n")
      for (g in dataset.groups) {
        sb.append("G;").append(g.id).append(';')
          .append(g.name.replace(';', ',')).append(';')
          .append(g.yearId).append('\n')
      }
    }

    if (dataset.groupMembers.isNotEmpty()) {
      sb.append("TIPO;LAV_ID;GRP_ID\n")
      for (m in dataset.groupMembers) {
        sb.append("X;").append(m.workerId).append(';').append(m.groupId).append('\n')
      }
    }

    return sb.toString()
  }

  fun importFullBackupCsv(text: String): ParsedBackupDataset {
    val cleaned = text.removePrefix("\uFEFF")
    val lines = cleaned.lines().filter { it.isNotBlank() }
    if (lines.isEmpty()) {
      throw IllegalArgumentException("File CSV vuoto.")
    }

    val backupHeaderDate = extractBackupHeaderDate(text)

    if (!isMultiSectionBackup(lines)) {
      val legacy = importLegacyOrCanonicalCsv(cleaned)
      return ParsedBackupDataset(
        backupHeaderDate = backupHeaderDate,
        dataset = legacy,
      )
    }

    var settings = OwnerSettings()
    val yearsMap = LinkedHashMap<Int, HarvestYear>()
    val workersMap = LinkedHashMap<Int, Worker>()
    val configsMap = LinkedHashMap<String, WorkerYearConfig>()
    val groupsMap = LinkedHashMap<Int, WorkerGroup>()
    val memberSet = HashSet<String>()
    val groupMembers = mutableListOf<WorkerGroupMember>()
    val plantationsMap = LinkedHashMap<Int, Plantation>()
    val logs = mutableListOf<WorkLog>()
    var nextLogId = 1
    var sectionHeaders = emptyList<String>()

    for (rawLine in lines) {
      val trimmed = rawLine.trim()
      if (trimmed.isEmpty() || trimmed.startsWith("#")) continue

      val cells = splitDelimitedCsvLine(trimmed, ';')
      val first = cells.getOrElse(0) { "" }

      if (normalizedHeaderKey(first) == "tipo") {
        sectionHeaders = cells.map { normalizedHeaderKey(it) }
        continue
      }

      val record = HashMap<String, String>()
      sectionHeaders.forEachIndexed { idx, key ->
        record[key] = cells.getOrElse(idx) { "" }
      }

      when (first.uppercase(Locale.ROOT)) {
        "S" -> {
          val key = (getField(record, listOf("chiave")).ifEmpty { cells.getOrElse(1) { "" } }).trim()
          val value = (getField(record, listOf("valore")).ifEmpty { cells.getOrElse(2) { "" } }).trim()
          settings = when (key) {
            "owner_name" -> settings.copy(ownerName = value)
            "owner_surname" -> settings.copy(ownerSurname = value)
            "extra_hours_threshold" -> {
              val parsed = parseOptionalDouble(value)
              if (parsed != null && parsed >= 0.0) settings.copy(extraHoursThreshold = parsed) else settings
            }
            "festive_days_type" -> {
              val code = parseOptionalDouble(value)?.toInt() ?: 3
              settings.copy(festiveDaysType = FestiveDaysType.fromCode(code))
            }
            "global_festive_dates" -> {
              val dates = value.split(",").mapNotNull { it.trim().toLongOrNull() }
              settings.copy(globalFestiveDates = dates)
            }
            else -> settings
          }
        }
        "Y" -> {
          val rawId = getField(record, listOf("id", "annata", "anno")).ifEmpty { cells.getOrElse(1) { "" } }
          val id = parseOptionalDouble(rawId)?.let { truncate(it).toInt() }
            ?: throw IllegalArgumentException("Annata non valida nel backup: \"$rawId\".")
          if (id < 2000 || id > 2100) {
            throw IllegalArgumentException("Annata non valida nel backup: \"$rawId\".")
          }
          val isCurrent = parseBoolFlag(getField(record, listOf("corrente", "iscurrent")).ifEmpty { cells.getOrElse(2) { "" } })
          val notes = (getField(record, listOf("note", "notes")).ifEmpty { cells.getOrElse(3) { "" } })
            .replace("\\n", "\n")
          yearsMap[id] = HarvestYear(id = id, isCurrent = isCurrent, notes = notes)
        }
        "W" -> {
          val rawId = getField(record, listOf("id", "lavid")).ifEmpty { cells.getOrElse(1) { "" } }
          val id = parseOptionalDouble(rawId)?.let { truncate(it).toInt() }
            ?: throw IllegalArgumentException("ID bracciante non valido nel backup: \"$rawId\".")
          if (id < 1) {
            throw IllegalArgumentException("ID bracciante non valido nel backup: \"$rawId\".")
          }
          val rawSurname = getField(record, listOf("cognome", "surname")).ifEmpty { cells.getOrElse(2) { "" } }
          val rawName = getField(record, listOf("nome", "name")).ifEmpty { cells.getOrElse(3) { "" } }
          val surname = DomainCalculator.capitalizeWords(rawSurname)
          val name = DomainCalculator.capitalizeWords(rawName)
          val phoneNumber = getField(record, listOf("telefono", "phone", "phonenumber"))
            .ifEmpty { cells.getOrElse(4) { "" } }
          val isArchived = parseBoolFlag(getField(record, listOf("archiviato", "isarchived")).ifEmpty { cells.getOrElse(5) { "" } })
          workersMap[id] = Worker(
            id = id,
            surname = surname.ifEmpty { name.ifEmpty { "Bracciante $id" } },
            name = if (surname.isNotEmpty()) name else "",
            phoneNumber = phoneNumber,
            isArchived = isArchived,
          )
        }
        "P" -> {
          val id = parseOptionalDouble(getField(record, listOf("id")).ifEmpty { cells.getOrElse(1) { "" } })
            ?.let { truncate(it).toInt() }
          if (id != null && id >= 1) {
            plantationsMap[id] = Plantation(
              id = id,
              name = getField(record, listOf("nome", "name")).ifEmpty { cells.getOrElse(2) { "" } },
              isArchived = parseBoolFlag(getField(record, listOf("archiviato", "isarchived")).ifEmpty { cells.getOrElse(3) { "" } }),
            )
          }
        }
        "C" -> {
          val workerId = parseOptionalDouble(getField(record, listOf("lavid", "workerid")).ifEmpty { cells.getOrElse(1) { "" } })
            ?.let { truncate(it).toInt() } ?: continue
          val yearId = parseOptionalDouble(getField(record, listOf("annoid", "harvestyearid")).ifEmpty { cells.getOrElse(2) { "" } })
            ?.let { truncate(it).toInt() } ?: continue
          val hourlyRate = parseOptionalDouble(getField(record, listOf("tariffa", "hourlyrate")).ifEmpty { cells.getOrElse(3) { "" } }) ?: 0.0
          val extraRate = parseOptionalDouble(getField(record, listOf("straord", "extrahourlyrate")).ifEmpty { cells.getOrElse(4) { "" } }) ?: hourlyRate
          val holidayRate = parseOptionalDouble(getField(record, listOf("festivo", "holidayhourlyrate")).ifEmpty { cells.getOrElse(5) { "" } }) ?: hourlyRate

          configsMap["$workerId::$yearId"] = WorkerYearConfig(
            workerId = workerId,
            harvestYearId = yearId,
            hourlyRate = hourlyRate,
            extraHourlyRate = extraRate,
            holidayHourlyRate = holidayRate,
          )
          if (!yearsMap.containsKey(yearId)) {
            yearsMap[yearId] = HarvestYear(id = yearId, isCurrent = false, notes = "")
          }
        }
        "G" -> {
          val id = parseOptionalDouble(getField(record, listOf("id")).ifEmpty { cells.getOrElse(1) { "" } })
            ?.let { truncate(it).toInt() }
          val name = (getField(record, listOf("nome", "name")).ifEmpty { cells.getOrElse(2) { "" } }).trim()
          val yearId = parseOptionalDouble(getField(record, listOf("annoid", "yearid")).ifEmpty { cells.getOrElse(3) { "" } })
            ?.let { truncate(it).toInt() }
          if (id != null && yearId != null && name.isNotEmpty()) {
            groupsMap[id] = WorkerGroup(id = id, name = name, yearId = yearId)
          }
        }
        "X" -> {
          val workerId = parseOptionalDouble(getField(record, listOf("lavid", "workerid")).ifEmpty { cells.getOrElse(1) { "" } })
            ?.let { truncate(it).toInt() }
          val groupId = parseOptionalDouble(getField(record, listOf("grpid", "groupid")).ifEmpty { cells.getOrElse(2) { "" } })
            ?.let { truncate(it).toInt() }
          if (workerId != null && groupId != null) {
            val key = "$groupId::$workerId"
            if (memberSet.add(key)) {
              groupMembers.add(WorkerGroupMember(groupId = groupId, workerId = workerId))
            }
          }
        }
        "L" -> {
          val workerId = parseOptionalDouble(getField(record, listOf("lavid", "workerid")).ifEmpty { cells.getOrElse(1) { "" } })
            ?.let { truncate(it).toInt() }
            ?: throw IllegalArgumentException("Riferimento bracciante o annata mancante nel log del backup.")
          val yearId = parseOptionalDouble(getField(record, listOf("annoid", "harvestyearid")).ifEmpty { cells.getOrElse(2) { "" } })
            ?.let { truncate(it).toInt() }
            ?: throw IllegalArgumentException("Riferimento bracciante o annata mancante nel log del backup.")

          if (!workersMap.containsKey(workerId)) {
            throw IllegalArgumentException("Log backup referenzia bracciante mancante ($workerId).")
          }
          if (!yearsMap.containsKey(yearId)) {
            yearsMap[yearId] = HarvestYear(id = yearId, isCurrent = false, notes = "")
          }

          val date = parseDateMillisFlexible(getField(record, listOf("data", "date")).ifEmpty { cells.getOrElse(3) { "" } })
          val morningStart = parseTimeOrNull(getField(record, listOf("min", "morningstart")).ifEmpty { cells.getOrElse(4) { "" } })
          val morningEnd = parseTimeOrNull(getField(record, listOf("mout", "morningend")).ifEmpty { cells.getOrElse(5) { "" } })
          val afternoonStart = parseTimeOrNull(getField(record, listOf("pin", "afternoonstart")).ifEmpty { cells.getOrElse(6) { "" } })
          val afternoonEnd = parseTimeOrNull(getField(record, listOf("pout", "afternoonend")).ifEmpty { cells.getOrElse(7) { "" } })
          val totalHours = parseHoursFlexible(getField(record, listOf("ore", "totalhours")).ifEmpty { cells.getOrElse(8) { "" } })

          val cfg = configsMap["$workerId::$yearId"]
          val hourlyRate = parseOptionalDouble(getField(record, listOf("tariffa", "hourlyrate")).ifEmpty { cells.getOrElse(9) { "" } })
            ?: cfg?.hourlyRate ?: 0.0
          val extraRate = parseOptionalDouble(getField(record, listOf("straord", "extrahourlyrate")).ifEmpty { cells.getOrElse(10) { "" } })
            ?: cfg?.extraHourlyRate ?: hourlyRate
          val holidayRate = parseOptionalDouble(getField(record, listOf("festivo", "holidayhourlyrate")).ifEmpty { cells.getOrElse(11) { "" } })
            ?: cfg?.holidayHourlyRate ?: hourlyRate
          val isManualHoliday = parseBoolFlag(getField(record, listOf("manfest", "ismanualholiday")).ifEmpty { cells.getOrElse(12) { "" } })

          val explicitTotal = parseOptionalDouble(getField(record, listOf("totale", "totalamount")).ifEmpty { cells.getOrElse(13) { "" } })
          val explicitOrdH = parseOptionalDouble(getField(record, listOf("ordh", "ordinaryhours")).ifEmpty { cells.getOrElse(14) { "" } })
          val explicitExtH = parseOptionalDouble(getField(record, listOf("exth", "extrahours")).ifEmpty { cells.getOrElse(15) { "" } })
          val explicitHolH = parseOptionalDouble(getField(record, listOf("holh", "holidayhours")).ifEmpty { cells.getOrElse(16) { "" } })
          val explicitOrdA = parseOptionalDouble(getField(record, listOf("orda", "ordinaryamount")).ifEmpty { cells.getOrElse(17) { "" } })
          val explicitExtA = parseOptionalDouble(getField(record, listOf("exta", "extraamount")).ifEmpty { cells.getOrElse(18) { "" } })
          val explicitHolA = parseOptionalDouble(getField(record, listOf("hola", "holidayamount")).ifEmpty { cells.getOrElse(19) { "" } })

          val ordinaryHours: Double
          val extraHours: Double
          val holidayHours: Double
          val ordinaryAmount: Double
          val extraAmount: Double
          val holidayAmount: Double
          val totalAmount: Double

          if (explicitOrdH != null && explicitExtH != null && explicitHolH != null && explicitTotal != null) {
            ordinaryHours = explicitOrdH
            extraHours = explicitExtH
            holidayHours = explicitHolH
            ordinaryAmount = explicitOrdA ?: DomainCalculator.round2(ordinaryHours * hourlyRate)
            extraAmount = explicitExtA ?: DomainCalculator.round2(extraHours * extraRate)
            holidayAmount = explicitHolA ?: DomainCalculator.round2(holidayHours * holidayRate)
            totalAmount = explicitTotal
          } else {
            val isHoliday = DomainCalculator.isDateFestive(
              dateMillis = date,
              isManual = isManualHoliday,
              festiveType = settings.festiveDaysType,
              globalFestiveDates = settings.globalFestiveDates.toSet(),
            )
            val calc = DomainCalculator.computeCompensation(
              CompensationInput(
                totalHours = totalHours,
                extraThreshold = settings.extraHoursThreshold,
                isHoliday = isHoliday,
                hourlyRate = hourlyRate,
                extraHourlyRate = extraRate,
                holidayHourlyRate = holidayRate,
              ),
            )
            ordinaryHours = calc.ordinaryHours
            extraHours = calc.extraHours
            holidayHours = calc.holidayHours
            ordinaryAmount = calc.ordinaryAmount
            extraAmount = calc.extraAmount
            holidayAmount = calc.holidayAmount
            totalAmount = calc.totalAmount
          }

          if (cfg == null) {
            configsMap["$workerId::$yearId"] = WorkerYearConfig(
              workerId = workerId,
              harvestYearId = yearId,
              hourlyRate = hourlyRate,
              extraHourlyRate = extraRate,
              holidayHourlyRate = holidayRate,
            )
          }

          logs.add(
            WorkLog(
              id = nextLogId++,
              workerId = workerId,
              harvestYearId = yearId,
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
              extraHourlyRate = extraRate,
              holidayHourlyRate = holidayRate,
              totalAmount = totalAmount,
              ordinaryAmount = ordinaryAmount,
              extraAmount = extraAmount,
              holidayAmount = holidayAmount,
              isManualHoliday = isManualHoliday,
            ),
          )
        }
      }
    }

    val years = enforceSingleCurrentYear(DomainHelpers.sortYearsDesc(yearsMap.values.toList()))
    val workers = workersMap.values.toList()
    val configs = configsMap.values.toList()
    val groups = groupsMap.values.toList()
    val validWorkerIds = workers.map { it.id }.toSet()
    val validGroupIds = groups.map { it.id }.toSet()
    val filteredMembers = groupMembers.filter {
      validWorkerIds.contains(it.workerId) && validGroupIds.contains(it.groupId)
    }

    if (years.isEmpty() && workers.isEmpty() && logs.isEmpty()) {
      throw IllegalArgumentException("File non riconosciuto come backup GestBraccianti valido.")
    }

    return ParsedBackupDataset(
      backupHeaderDate = backupHeaderDate,
      dataset = FullBackupDataset(
        settings = settings,
        years = years,
        workers = workers,
        configs = configs,
        groups = groups,
        groupMembers = filteredMembers,
        plantations = plantationsMap.values.toList(),
        logs = logs,
      ),
    )
  }

  private fun importLegacyOrCanonicalCsv(cleaned: String): FullBackupDataset {
    val rows = parseCsvRows(cleaned)
    if (rows.isEmpty()) {
      throw IllegalArgumentException("File CSV vuoto.")
    }
    val header = rows.first().map { normalizedHeaderKey(it) }
    val isCanonical = header.contains("entity") && header.contains("id") && header.contains("harvestyearid")

    return if (isCanonical) {
      parseCanonicalRows(rows, header)
    } else {
      parseLegacyRows(rows, header)
    }
  }

  private fun parseCanonicalRows(rows: List<List<String>>, header: List<String>): FullBackupDataset {
    val yearsMap = LinkedHashMap<Int, HarvestYear>()
    val workersMap = LinkedHashMap<Int, Worker>()
    val configsMap = LinkedHashMap<String, WorkerYearConfig>()
    val workerYears = mutableListOf<Pair<Int, Int>>()
    val logs = mutableListOf<WorkLog>()

    for (i in 1 until rows.size) {
      val row = rows[i]
      val record = HashMap<String, String>()
      header.forEachIndexed { idx, key -> record[key] = row.getOrElse(idx) { "" } }
      val entity = getField(record, listOf("entity")).uppercase(Locale.ROOT)
      when (entity) {
        "YEAR" -> {
          val id = parseRequiredInt(getField(record, listOf("id")), "id annata")
          val isCurrent = parseBoolFlag(getField(record, listOf("iscurrent")))
          val notes = getField(record, listOf("notes"))
          yearsMap[id] = HarvestYear(id = id, isCurrent = isCurrent, notes = notes)
        }
        "WORKER" -> {
          val id = parseRequiredInt(getField(record, listOf("id")), "id bracciante")
          val yearId = parseRequiredInt(getField(record, listOf("harvestyearid")), "harvestYearId")
          val name = DomainCalculator.capitalizeWords(getField(record, listOf("name")))
          val surname = DomainCalculator.capitalizeWords(getField(record, listOf("surname")))
          val phone = getField(record, listOf("phonenumber"))
          val archived = parseBoolFlag(getField(record, listOf("isarchived")))
          if (!workersMap.containsKey(id)) {
            workersMap[id] = Worker(id = id, name = name, surname = surname, phoneNumber = phone, isArchived = archived)
          }
          workerYears.add(id to yearId)
        }
        "LOG" -> {
          val id = parseRequiredInt(getField(record, listOf("id")), "id log")
          val workerId = parseRequiredInt(getField(record, listOf("workerid")), "workerId")
          val yearId = parseRequiredInt(getField(record, listOf("harvestyearid")), "harvestYearId")
          if (!yearsMap.containsKey(yearId)) {
            throw IllegalArgumentException("Log $id referenzia annata mancante ($yearId).")
          }
          if (!workersMap.containsKey(workerId)) {
            throw IllegalArgumentException("Log $id referenzia bracciante mancante ($workerId).")
          }
          val date = parseDateMillisFlexible(getField(record, listOf("date")))
          val morningStart = parseTimeOrNull(getField(record, listOf("morningstart")))
          val morningEnd = parseTimeOrNull(getField(record, listOf("morningend")))
          val afternoonStart = parseTimeOrNull(getField(record, listOf("afternoonstart")))
          val afternoonEnd = parseTimeOrNull(getField(record, listOf("afternoonend")))
          val totalHours = parseHoursFlexible(getField(record, listOf("totalhours")))
          val ordinaryHours = parseOptionalDouble(getField(record, listOf("ordinaryhours"))) ?: totalHours
          val extraHours = parseOptionalDouble(getField(record, listOf("extrahours"))) ?: 0.0
          val holidayHours = parseOptionalDouble(getField(record, listOf("holidayhours"))) ?: 0.0
          val hourlyRate = parseOptionalDouble(getField(record, listOf("hourlyrate"))) ?: 0.0
          val extraHourlyRate = parseOptionalDouble(getField(record, listOf("extrahourlyrate"))) ?: hourlyRate
          val holidayHourlyRate = parseOptionalDouble(getField(record, listOf("holidayhourlyrate"))) ?: hourlyRate
          val totalAmount = parseOptionalDouble(getField(record, listOf("totalamount"))) ?: 0.0
          val ordinaryAmount = parseOptionalDouble(getField(record, listOf("ordinaryamount"))) ?: 0.0
          val extraAmount = parseOptionalDouble(getField(record, listOf("extraamount"))) ?: 0.0
          val holidayAmount = parseOptionalDouble(getField(record, listOf("holidayamount"))) ?: 0.0
          val isManualHoliday = parseBoolFlag(getField(record, listOf("ismanualholiday")))

          logs.add(
            WorkLog(
              id = id,
              workerId = workerId,
              harvestYearId = yearId,
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
            ),
          )
        }
      }
    }

    for ((workerId, yearId) in workerYears) {
      if (!yearsMap.containsKey(yearId)) {
        throw IllegalArgumentException("Bracciante $workerId referenzia annata mancante ($yearId).")
      }
      val key = "$workerId::$yearId"
      if (!configsMap.containsKey(key)) {
        val log = logs.firstOrNull { it.workerId == workerId && it.harvestYearId == yearId }
        configsMap[key] = WorkerYearConfig(
          workerId = workerId,
          harvestYearId = yearId,
          hourlyRate = log?.hourlyRate ?: 0.0,
          extraHourlyRate = log?.extraHourlyRate ?: 0.0,
          holidayHourlyRate = log?.holidayHourlyRate ?: 0.0,
        )
      }
    }

    return FullBackupDataset(
      settings = OwnerSettings(),
      years = enforceSingleCurrentYear(DomainHelpers.sortYearsDesc(yearsMap.values.toList())),
      workers = workersMap.values.toList(),
      configs = configsMap.values.toList(),
      groups = emptyList(),
      groupMembers = emptyList(),
      plantations = emptyList(),
      logs = logs,
    )
  }

  private fun parseLegacyRows(rows: List<List<String>>, header: List<String>): FullBackupDataset {
    val yearsMap = LinkedHashMap<Int, HarvestYear>()
    val workerMap = LinkedHashMap<String, Worker>()
    val configsMap = LinkedHashMap<String, WorkerYearConfig>()
    val logs = mutableListOf<WorkLog>()
    var nextWorkerId = 1
    var nextLogId = 1

    for (i in 1 until rows.size) {
      val row = rows[i]
      val record = HashMap<String, String>()
      header.forEachIndexed { idx, key -> record[key] = row.getOrElse(idx) { "" } }

      val yearId = parseRequiredInt(getField(record, listOf("annata", "anno", "year", "harvestyearid")), "annata")
      val rawName = getField(record, listOf("nome", "name"))
      val rawSurname = getField(record, listOf("cognome", "surname"))
      if (rawName.isEmpty() || rawSurname.isEmpty()) {
        throw IllegalArgumentException("Nome/cognome mancanti alla riga ${i + 1}.")
      }
      val name = DomainCalculator.capitalizeWords(rawName)
      val surname = DomainCalculator.capitalizeWords(rawSurname)
      val phone = getField(record, listOf("telefono", "phone", "phonenumber"))
      val archived = parseBoolFlag(getField(record, listOf("archiviato", "isarchived")))

      if (!yearsMap.containsKey(yearId)) {
        yearsMap[yearId] = HarvestYear(id = yearId, isCurrent = false, notes = "")
      }

      val workerKey = "${surname.lowercase(Locale.ROOT)}::${name.lowercase(Locale.ROOT)}"
      val worker = workerMap.getOrPut(workerKey) {
        Worker(
          id = nextWorkerId++,
          name = name,
          surname = surname,
          phoneNumber = phone,
          isArchived = archived,
        )
      }

      val dateMillis = parseDateMillisFlexible(getField(record, listOf("data", "date", "giorno")))
      val totalHours = parseHoursFlexible(getField(record, listOf("oretotali", "totalhours", "ore")))
      val isManualHoliday = parseBoolFlag(getField(record, listOf("festivo", "ismanualholiday", "holiday")))
      val extraThreshold = parseOptionalDouble(getField(record, listOf("sogliaextra", "extrathreshold"))) ?: 8.0
      val hourlyRate = parseOptionalDouble(getField(record, listOf("tariffaord", "hourlyrate"))) ?: 0.0
      val extraHourlyRate = parseOptionalDouble(getField(record, listOf("tariffastraord", "extrahourlyrate"))) ?: hourlyRate
      val holidayHourlyRate = parseOptionalDouble(getField(record, listOf("tariffafestiva", "holidayhourlyrate"))) ?: hourlyRate

      val calc = DomainCalculator.computeCompensation(
        CompensationInput(
          totalHours = totalHours,
          extraThreshold = extraThreshold,
          isHoliday = isManualHoliday,
          hourlyRate = hourlyRate,
          extraHourlyRate = extraHourlyRate,
          holidayHourlyRate = holidayHourlyRate,
        ),
      )

      configsMap.putIfAbsent(
        "${worker.id}::$yearId",
        WorkerYearConfig(
          workerId = worker.id,
          harvestYearId = yearId,
          hourlyRate = hourlyRate,
          extraHourlyRate = extraHourlyRate,
          holidayHourlyRate = holidayHourlyRate,
        ),
      )

      logs.add(
        WorkLog(
          id = nextLogId++,
          workerId = worker.id,
          harvestYearId = yearId,
          date = dateMillis,
          morningStart = null,
          morningEnd = null,
          afternoonStart = null,
          afternoonEnd = null,
          totalHours = totalHours,
          ordinaryHours = calc.ordinaryHours,
          extraHours = calc.extraHours,
          holidayHours = calc.holidayHours,
          hourlyRate = hourlyRate,
          extraHourlyRate = extraHourlyRate,
          holidayHourlyRate = holidayHourlyRate,
          totalAmount = calc.totalAmount,
          ordinaryAmount = calc.ordinaryAmount,
          extraAmount = calc.extraAmount,
          holidayAmount = calc.holidayAmount,
          isManualHoliday = isManualHoliday,
        ),
      )
    }

    return FullBackupDataset(
      settings = OwnerSettings(),
      years = enforceSingleCurrentYear(DomainHelpers.sortYearsDesc(yearsMap.values.toList())),
      workers = workerMap.values.toList(),
      configs = configsMap.values.toList(),
      groups = emptyList(),
      groupMembers = emptyList(),
      plantations = emptyList(),
      logs = logs,
    )
  }

  private fun parseCsvRows(text: String): List<List<String>> {
    var content = text.removePrefix("\uFEFF")
    val firstNewline = content.indexOfFirst { it == '\n' || it == '\r' }
    val firstLine = if (firstNewline == -1) content else content.substring(0, firstNewline)
    if (firstLine.trim().lowercase(Locale.ROOT).startsWith("#gestbraccianticsv")) {
      if (firstNewline == -1) return emptyList()
      content = content.substring(firstNewline).trimStart('\r', '\n')
    }
    if (content.isBlank()) return emptyList()

    val headerEnd = content.indexOfFirst { it == '\n' || it == '\r' }
    val headerLine = if (headerEnd == -1) content else content.substring(0, headerEnd)
    val delimiter = if (headerLine.count { it == ';' } >= headerLine.count { it == ',' }) ';' else ','

    val rows = mutableListOf<List<String>>()
    var row = mutableListOf<String>()
    val cell = StringBuilder()
    var inQuotes = false
    var i = 0
    while (i < content.length) {
      val ch = content[i]
      if (ch == '"') {
        if (inQuotes && i + 1 < content.length && content[i + 1] == '"') {
          cell.append('"')
          i += 2
          continue
        }
        inQuotes = !inQuotes
        i += 1
        continue
      }
      if (ch == delimiter && !inQuotes) {
        row.add(cell.toString().trim())
        cell.setLength(0)
        i += 1
        continue
      }
      if ((ch == '\r' || ch == '\n') && !inQuotes) {
        if (ch == '\r' && i + 1 < content.length && content[i + 1] == '\n') {
          i += 1
        }
        row.add(cell.toString().trim())
        cell.setLength(0)
        if (row.any { it.isNotEmpty() }) {
          rows.add(row)
        }
        row = mutableListOf()
        i += 1
        continue
      }
      cell.append(ch)
      i += 1
    }
    row.add(cell.toString().trim())
    if (row.any { it.isNotEmpty() }) {
      rows.add(row)
    }
    return rows
  }

  private fun isMultiSectionBackup(lines: List<String>): Boolean {
    val uncommented = lines.filter { !it.trim().startsWith("#") }
    val firstNonEmpty = uncommented.firstOrNull { it.trim().isNotEmpty() }?.trim() ?: ""
    if (firstNonEmpty.lowercase(Locale.ROOT).startsWith("#gestbraccianticsv")) return false
    val firstCells = splitDelimitedCsvLine(firstNonEmpty, ';').map { normalizedHeaderKey(it) }
    if (firstCells.contains("tipo")) return true
    return lines.any { MULTI_SECTION_LINE_REGEX.matches(it.trim()) }
  }

  private fun splitDelimitedCsvLine(line: String, delimiter: Char): List<String> {
    val row = mutableListOf<String>()
    val cell = StringBuilder()
    var inQuotes = false
    var i = 0
    while (i < line.length) {
      val ch = line[i]
      if (ch == '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] == '"') {
          cell.append('"')
          i += 2
          continue
        }
        inQuotes = !inQuotes
        i += 1
        continue
      }
      if (ch == delimiter && !inQuotes) {
        row.add(cell.toString().trim())
        cell.setLength(0)
        i += 1
        continue
      }
      cell.append(ch)
      i += 1
    }
    row.add(cell.toString().trim())
    return row
  }

  private fun enforceSingleCurrentYear(years: List<HarvestYear>): List<HarvestYear> {
    if (years.isEmpty()) return emptyList()
    val current = years.filter { it.isCurrent }
    if (current.size == 1) return years
    val selectedId = if (current.size > 1) current.first().id else years.maxBy { it.id }.id
    return years.map { it.copy(isCurrent = it.id == selectedId) }
  }

  private fun normalizedHeaderKey(key: String): String {
    val decomposed = Normalizer.normalize(key, Normalizer.Form.NFD)
    return decomposed
      .replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "")
      .replace(Regex("[^a-zA-Z0-9]"), "")
      .lowercase(Locale.ROOT)
  }

  private fun getField(record: Map<String, String>, aliases: List<String>): String {
    for (alias in aliases) {
      val value = record[alias]
      if (value != null) return value
    }
    return ""
  }

  private fun parseBoolFlag(value: String?): Boolean {
    val v = (value ?: "").trim().lowercase(Locale.ROOT)
    return v == "1" || v == "true" || v == "si" || v == "s" || v == "yes"
  }

  private fun parseOptionalDouble(value: String?): Double? {
    val normalized = (value ?: "").trim().replace(',', '.')
    if (normalized.isEmpty()) return null
    return normalized.toDoubleOrNull()?.takeIf { it.isFinite() }
  }

  private fun parseRequiredInt(value: String?, label: String): Int =
    parseOptionalDouble(value)?.let { truncate(it).toInt() }
      ?: throw IllegalArgumentException("$label mancante o non valido.")

  private fun parseHoursFlexible(raw: String?): Double {
    val cleaned = (raw ?: "").trim()
    if (cleaned.isEmpty()) return 0.0
    val hhmm = HHMM_REGEX.matchEntire(cleaned)
    if (hhmm != null) {
      val h = hhmm.groupValues[1].toInt()
      val m = hhmm.groupValues[2].toInt()
      if (m in 0..59) {
        return DomainCalculator.round2(h + m / 60.0)
      }
    }
    return DomainCalculator.round2(parseOptionalDouble(cleaned) ?: 0.0)
  }

  private fun parseDateMillisFlexible(raw: String?): Long {
    val trimmed = (raw ?: "").trim()
    if (trimmed.isEmpty()) {
      throw IllegalArgumentException("Data log mancante nel backup.")
    }
    if (ISO_DATE_REGEX.matches(trimmed)) {
      return DomainHelpers.toMidnightMillisFromIso(trimmed)
    }
    if (EPOCH_MILLIS_REGEX.matches(trimmed)) {
      val millis = trimmed.toLongOrNull()
      if (millis != null) {
        val localDate = DomainHelpers.millisToLocalDate(millis)
        return DomainHelpers.toLocalMidnightMillis(localDate)
      }
    }
    throw IllegalArgumentException("Data log non valida nel backup: \"$trimmed\".")
  }

  private fun parseTimeOrNull(raw: String?): String? {
    val trimmed = (raw ?: "").trim()
    if (trimmed.isEmpty()) return null
    return if (TIME_SLOT_REGEX.matches(trimmed)) trimmed else null
  }

  private fun formatNum(value: Double): String =
    if (value == value.toLong().toDouble()) {
      value.toLong().toString()
    } else {
      value.toString()
    }
}
