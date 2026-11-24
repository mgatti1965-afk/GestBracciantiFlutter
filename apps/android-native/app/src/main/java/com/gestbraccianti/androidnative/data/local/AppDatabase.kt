package com.gestbraccianti.androidnative.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

@Database(
  entities = [
    HarvestYearEntity::class,
    WorkerEntity::class,
    WorkerYearConfigEntity::class,
    WorkerGroupEntity::class,
    WorkerGroupMemberEntity::class,
    PlantationEntity::class,
    WorkLogEntity::class,
    OwnerSettingsEntity::class,
    BackupHistoryEntity::class,
  ],
  version = 1,
  exportSchema = false,
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
  abstract fun harvestYearDao(): HarvestYearDao
  abstract fun workerDao(): WorkerDao
  abstract fun workerYearConfigDao(): WorkerYearConfigDao
  abstract fun workerGroupDao(): WorkerGroupDao
  abstract fun plantationDao(): PlantationDao
  abstract fun workLogDao(): WorkLogDao
  abstract fun ownerSettingsDao(): OwnerSettingsDao
  abstract fun backupHistoryDao(): BackupHistoryDao

  companion object {
    @Volatile
    private var INSTANCE: AppDatabase? = null

    fun getInstance(context: Context): AppDatabase =
      INSTANCE ?: synchronized(this) {
        INSTANCE ?: Room.databaseBuilder(
          context.applicationContext,
          AppDatabase::class.java,
          "gestbraccianti-android-native.db",
        ).build().also { INSTANCE = it }
      }
  }
}
