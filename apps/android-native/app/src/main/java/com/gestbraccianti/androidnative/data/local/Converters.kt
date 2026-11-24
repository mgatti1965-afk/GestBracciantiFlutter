package com.gestbraccianti.androidnative.data.local

import androidx.room.TypeConverter

class Converters {
  @TypeConverter
  fun fromLongList(value: List<Long>): String =
    value.joinToString(",")

  @TypeConverter
  fun toLongList(raw: String): List<Long> =
    if (raw.isBlank()) {
      emptyList()
    } else {
      raw.split(",").mapNotNull { it.trim().toLongOrNull() }
    }
}
