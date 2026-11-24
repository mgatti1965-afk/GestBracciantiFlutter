package com.gestbraccianti.androidnative.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val ForestGreen = Color(0xFF2E6F40)
val ForestGreenDark = Color(0xFF1E4D2B)
val WarmAmber = Color(0xFFD97706)
val HolidayRed = Color(0xFFB91C1C)
val HolidayBg = Color(0xFFFEE2E2)
val SoftSurface = Color(0xFFF6F8F5)

private val AppColorScheme = lightColorScheme(
  primary = ForestGreen,
  onPrimary = Color.White,
  primaryContainer = Color(0xFFD7F0DC),
  onPrimaryContainer = ForestGreenDark,
  secondary = Color(0xFF4F6353),
  onSecondary = Color.White,
  background = SoftSurface,
  surface = Color.White,
  error = HolidayRed,
)

@Composable
fun GestBracciantiTheme(content: @Composable () -> Unit) {
  MaterialTheme(
    colorScheme = AppColorScheme,
    content = content,
  )
}
