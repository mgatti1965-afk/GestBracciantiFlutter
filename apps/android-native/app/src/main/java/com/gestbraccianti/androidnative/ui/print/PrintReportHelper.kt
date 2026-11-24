package com.gestbraccianti.androidnative.ui.print

import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import com.gestbraccianti.androidnative.domain.DomainCalculator
import com.gestbraccianti.androidnative.domain.DomainHelpers
import com.gestbraccianti.androidnative.domain.OwnerSettings
import com.gestbraccianti.androidnative.domain.WorkLog
import com.gestbraccianti.androidnative.domain.Worker
import com.gestbraccianti.androidnative.domain.WorkerGroupWithMembers
import java.time.format.DateTimeFormatter
import java.util.Locale

enum class SummaryFilterPeriod(val label: String) {
  YEAR("Anno"),
  MONTH("Mese"),
  WEEK("Settimana"),
  DAY("Giorno"),
}

enum class GroupingType(val label: String) {
  BY_WORKER("Braccianti"),
  BY_GROUP("Gruppi"),
}

enum class SummaryViewMode(val label: String) {
  DETAIL("Dettaglio"),
  TOTALS("Solo Totali"),
}

object PrintReportHelper {
  private val IT_DAY_FMT = DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.forLanguageTag("it-IT"))

  fun printSummaryReport(
    context: Context,
    jobName: String,
    periodLabel: String,
    logs: List<WorkLog>,
    allWorkers: List<Worker>,
    groups: List<WorkerGroupWithMembers>,
    settings: OwnerSettings,
    groupingType: GroupingType,
    viewMode: SummaryViewMode,
    selectedWorkerId: Int? = null,
  ) {
    val html = buildSummaryHtml(
      periodLabel = periodLabel,
      logs = logs,
      allWorkers = allWorkers,
      groups = groups,
      settings = settings,
      groupingType = groupingType,
      viewMode = viewMode,
      selectedWorkerId = selectedWorkerId,
    )

    val webView = WebView(context)
    webView.webViewClient = object : WebViewClient() {
      override fun onPageFinished(view: WebView, url: String) {
        val printManager = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return
        val adapter = view.createPrintDocumentAdapter(jobName)
        printManager.print(jobName, adapter, PrintAttributes.Builder().build())
      }
    }
    webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
  }

  fun buildSummaryHtml(
    periodLabel: String,
    logs: List<WorkLog>,
    allWorkers: List<Worker>,
    groups: List<WorkerGroupWithMembers>,
    settings: OwnerSettings,
    groupingType: GroupingType,
    viewMode: SummaryViewMode,
    selectedWorkerId: Int? = null,
  ): String {
    val filteredLogs = if (selectedWorkerId != null) {
      logs.filter { it.workerId == selectedWorkerId }
    } else {
      logs
    }
    val effectiveGrouping = if (selectedWorkerId != null) GroupingType.BY_WORKER else groupingType
    val effectiveView = if (effectiveGrouping == GroupingType.BY_GROUP) SummaryViewMode.TOTALS else viewMode

    val workerMap = allWorkers.associateBy { it.id }
    val companyName = "${settings.ownerSurname} ${settings.ownerName}".trim().ifEmpty { "GestBraccianti" }

    val totalHours = filteredLogs.sumOf { it.totalHours }
    val totalOrd = filteredLogs.sumOf { it.ordinaryHours }
    val totalExt = filteredLogs.sumOf { it.extraHours }
    val totalHol = filteredLogs.sumOf { it.holidayHours }
    val totalAmount = filteredLogs.sumOf { it.totalAmount }

    val rowsHtml = StringBuilder()
    if (effectiveGrouping == GroupingType.BY_GROUP) {
      for (gwm in groups) {
        val memberIds = gwm.members.map { it.id }.toSet()
        val groupLogs = filteredLogs.filter { memberIds.contains(it.workerId) }
        if (groupLogs.isEmpty()) continue
        rowsHtml.append(
          "<tr><td><b>${escapeHtml(gwm.group.name)}</b></td>" +
            "<td>${DomainCalculator.formatHoursLabel(groupLogs.sumOf { it.ordinaryHours })}</td>" +
            "<td>${DomainCalculator.formatHoursLabel(groupLogs.sumOf { it.extraHours })}</td>" +
            "<td>${DomainCalculator.formatHoursLabel(groupLogs.sumOf { it.holidayHours })}</td>" +
            "<td>${DomainCalculator.formatHoursLabel(groupLogs.sumOf { it.totalHours })}</td>" +
            "<td class='num'><b>${escapeHtml(DomainCalculator.formatCurrencyIt(groupLogs.sumOf { it.totalAmount }))}</b></td></tr>",
        )
      }
    } else {
      val byWorker = filteredLogs.groupBy { it.workerId }
      val sortedWorkerIds = byWorker.keys.sortedWith { a, b ->
        DomainHelpers.workerFullName(workerMap[a], a).compareTo(DomainHelpers.workerFullName(workerMap[b], b))
      }
      for (wId in sortedWorkerIds) {
        val wLogs = byWorker[wId].orEmpty().sortedBy { it.date }
        val wName = DomainHelpers.workerFullName(workerMap[wId], wId)
        rowsHtml.append(
          "<tr class='group-row'><td><b>${escapeHtml(wName)}</b></td>" +
            "<td>${DomainCalculator.formatHoursLabel(wLogs.sumOf { it.ordinaryHours })}</td>" +
            "<td>${DomainCalculator.formatHoursLabel(wLogs.sumOf { it.extraHours })}</td>" +
            "<td>${DomainCalculator.formatHoursLabel(wLogs.sumOf { it.holidayHours })}</td>" +
            "<td>${DomainCalculator.formatHoursLabel(wLogs.sumOf { it.totalHours })}</td>" +
            "<td class='num'><b>${escapeHtml(DomainCalculator.formatCurrencyIt(wLogs.sumOf { it.totalAmount }))}</b></td></tr>",
        )
        if (effectiveView == SummaryViewMode.DETAIL) {
          for (l in wLogs) {
            val dStr = IT_DAY_FMT.format(DomainHelpers.millisToLocalDate(l.date))
            rowsHtml.append(
              "<tr class='sub-row'><td>&nbsp;&nbsp;$dStr</td>" +
                "<td>${DomainCalculator.formatHoursLabel(l.ordinaryHours)}</td>" +
                "<td>${DomainCalculator.formatHoursLabel(l.extraHours)}</td>" +
                "<td>${DomainCalculator.formatHoursLabel(l.holidayHours)}</td>" +
                "<td>${DomainCalculator.formatHoursLabel(l.totalHours)}</td>" +
                "<td class='num'>${escapeHtml(DomainCalculator.formatCurrencyIt(l.totalAmount))}</td></tr>",
            )
          }
        }
      }
    }

    return """
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: sans-serif; padding: 16px; color: #1f2937; font-size: 12px; }
          h1 { margin: 0 0 4px 0; font-size: 18px; color: #1e4d2b; }
          .meta { margin-bottom: 14px; color: #4b5563; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
          th { background-color: #f3f4f6; }
          .num { text-align: right; }
          .group-row { background-color: #f9fafb; }
          .sub-row td { color: #4b5563; font-size: 11px; }
          .total-row { background-color: #d7f0dc; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(companyName)} - Riepilogo Compensi</h1>
        <div class="meta">Periodo: <b>${escapeHtml(periodLabel)}</b> | Raggruppamento: ${escapeHtml(effectiveGrouping.label)}</div>
        <table>
          <thead>
            <tr>
              <th>Voce</th>
              <th>Ordinarie</th>
              <th>Extra</th>
              <th>Festive</th>
              <th>Tot. Ore</th>
              <th class="num">Compenso</th>
            </tr>
          </thead>
          <tbody>
            $rowsHtml
            <tr class="total-row">
              <td>TOTALE GENERALE</td>
              <td>${DomainCalculator.formatHoursLabel(totalOrd)}</td>
              <td>${DomainCalculator.formatHoursLabel(totalExt)}</td>
              <td>${DomainCalculator.formatHoursLabel(totalHol)}</td>
              <td>${DomainCalculator.formatHoursLabel(totalHours)}</td>
              <td class="num">${escapeHtml(DomainCalculator.formatCurrencyIt(totalAmount))}</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    """.trimIndent()
  }

  private fun escapeHtml(raw: String): String =
    raw.replace("&", "&amp;")
      .replace("<", "&lt;")
      .replace(">", "&gt;")
      .replace("\"", "&quot;")
}
