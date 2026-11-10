package com.gestbraccianti.androidnative

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.gestbraccianti.androidnative.data.InMemoryAppData

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val appData = InMemoryAppData()
    val currentYear = appData.current()?.id ?: 0
    val workerCount = appData.workersForYear(currentYear).size
    val logCount = appData.logsForYear(currentYear).size

    setContent {
      MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
          AndroidMvpPlaceholder(currentYear = currentYear, workerCount = workerCount, logCount = logCount)
        }
      }
    }
  }
}

@Composable
private fun AndroidMvpPlaceholder(currentYear: Int, workerCount: Int, logCount: Int) {
  Column(
    modifier = Modifier
      .fillMaxSize()
      .padding(24.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Text(
      text = "GestBraccianti Android Native",
      style = MaterialTheme.typography.headlineSmall,
      textAlign = TextAlign.Center,
    )
    Text(
      text = "Scaffold MVP pronto: prossimi step annata, braccianti, log.",
      modifier = Modifier.padding(top = 8.dp),
      style = MaterialTheme.typography.bodyLarge,
      textAlign = TextAlign.Center,
    )
    Text(
      text = "Seed annata corrente: $currentYear • Braccianti: $workerCount • Log: $logCount",
      modifier = Modifier.padding(top = 8.dp),
      style = MaterialTheme.typography.bodyMedium,
      textAlign = TextAlign.Center,
    )
  }
}
