package com.gestbraccianti.androidnative.domain

import java.time.LocalDate

data class HarvestYear(
  val id: Int,
  val isCurrent: Boolean,
  val notes: String,
)

data class Worker(
  val id: Int,
  val harvestYearId: Int,
  val name: String,
  val surname: String,
  val phoneNumber: String,
  val isArchived: Boolean,
)

data class WorkLog(
  val id: Int,
  val workerId: Int,
  val harvestYearId: Int,
  val date: LocalDate,
  val totalHours: Double,
  val ordinaryHours: Double,
  val extraHours: Double,
  val holidayHours: Double,
  val totalAmount: Double,
  val isManualHoliday: Boolean,
)
