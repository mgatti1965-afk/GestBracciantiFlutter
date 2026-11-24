package com.gestbraccianti.androidnative.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface HarvestYearDao {
  @Query("SELECT * FROM harvest_years ORDER BY id DESC")
  fun observeAll(): Flow<List<HarvestYearEntity>>

  @Query("SELECT * FROM harvest_years ORDER BY id DESC")
  suspend fun getAll(): List<HarvestYearEntity>

  @Query("SELECT * FROM harvest_years WHERE id = :yearId LIMIT 1")
  suspend fun getById(yearId: Int): HarvestYearEntity?

  @Query("SELECT * FROM harvest_years WHERE isCurrent = 1 LIMIT 1")
  fun observeCurrent(): Flow<HarvestYearEntity?>

  @Query("SELECT * FROM harvest_years WHERE isCurrent = 1 LIMIT 1")
  suspend fun getCurrent(): HarvestYearEntity?

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsert(year: HarvestYearEntity)

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertAll(years: List<HarvestYearEntity>)

  @Query("UPDATE harvest_years SET isCurrent = 0 WHERE isCurrent = 1")
  suspend fun clearCurrent()

  @Query("UPDATE harvest_years SET isCurrent = CASE WHEN id = :yearId THEN 1 ELSE 0 END")
  suspend fun setCurrent(yearId: Int)

  @Query("DELETE FROM harvest_years WHERE id = :yearId")
  suspend fun deleteById(yearId: Int)

  @Query("DELETE FROM harvest_years")
  suspend fun deleteAll()
}

@Dao
interface WorkerDao {
  @Query("SELECT * FROM workers")
  fun observeAll(): Flow<List<WorkerEntity>>

  @Query("SELECT * FROM workers")
  suspend fun getAll(): List<WorkerEntity>

  @Query("SELECT * FROM workers WHERE id = :workerId LIMIT 1")
  suspend fun getById(workerId: Int): WorkerEntity?

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insert(worker: WorkerEntity): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertAll(workers: List<WorkerEntity>)

  @Update
  suspend fun update(worker: WorkerEntity)

  @Query("DELETE FROM workers WHERE id = :workerId")
  suspend fun deleteById(workerId: Int)

  @Query("DELETE FROM workers")
  suspend fun deleteAll()
}

@Dao
interface WorkerYearConfigDao {
  @Query("SELECT * FROM worker_year_configs WHERE harvestYearId = :yearId")
  fun observeForYear(yearId: Int): Flow<List<WorkerYearConfigEntity>>

  @Query("SELECT * FROM worker_year_configs WHERE harvestYearId = :yearId")
  suspend fun getForYear(yearId: Int): List<WorkerYearConfigEntity>

  @Query("SELECT * FROM worker_year_configs WHERE workerId = :workerId")
  suspend fun getForWorker(workerId: Int): List<WorkerYearConfigEntity>

  @Query("SELECT * FROM worker_year_configs")
  suspend fun getAll(): List<WorkerYearConfigEntity>

  @Query("SELECT * FROM worker_year_configs WHERE workerId = :workerId AND harvestYearId = :yearId LIMIT 1")
  suspend fun get(workerId: Int, yearId: Int): WorkerYearConfigEntity?

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsert(config: WorkerYearConfigEntity)

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertAll(configs: List<WorkerYearConfigEntity>)

  @Query("DELETE FROM worker_year_configs WHERE harvestYearId = :yearId")
  suspend fun deleteForYear(yearId: Int)

  @Query("DELETE FROM worker_year_configs WHERE workerId = :workerId")
  suspend fun deleteForWorker(workerId: Int)

  @Query("DELETE FROM worker_year_configs")
  suspend fun deleteAll()
}

@Dao
interface WorkerGroupDao {
  @Query("SELECT * FROM worker_groups WHERE yearId = :yearId")
  fun observeGroupsForYear(yearId: Int): Flow<List<WorkerGroupEntity>>

  @Query("SELECT * FROM worker_groups WHERE yearId = :yearId")
  suspend fun getGroupsForYear(yearId: Int): List<WorkerGroupEntity>

  @Query("SELECT * FROM worker_groups")
  suspend fun getAllGroups(): List<WorkerGroupEntity>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insertGroup(group: WorkerGroupEntity): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertAllGroups(groups: List<WorkerGroupEntity>)

  @Query("DELETE FROM worker_groups WHERE id = :groupId")
  suspend fun deleteGroupById(groupId: Int)

  @Query("DELETE FROM worker_groups WHERE yearId = :yearId")
  suspend fun deleteGroupsForYear(yearId: Int)

  @Query("DELETE FROM worker_groups")
  suspend fun deleteAllGroups()

  @Query("SELECT * FROM worker_group_members")
  fun observeAllMembers(): Flow<List<WorkerGroupMemberEntity>>

  @Query("SELECT * FROM worker_group_members")
  suspend fun getAllMembers(): List<WorkerGroupMemberEntity>

  @Query("SELECT * FROM worker_group_members WHERE groupId = :groupId")
  suspend fun getMembersForGroup(groupId: Int): List<WorkerGroupMemberEntity>

  @Query("SELECT * FROM worker_group_members WHERE workerId = :workerId")
  suspend fun getMembersForWorker(workerId: Int): List<WorkerGroupMemberEntity>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertMember(member: WorkerGroupMemberEntity)

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertAllMembers(members: List<WorkerGroupMemberEntity>)

  @Query("DELETE FROM worker_group_members WHERE groupId = :groupId AND workerId = :workerId")
  suspend fun deleteMember(groupId: Int, workerId: Int)

  @Query("DELETE FROM worker_group_members WHERE groupId = :groupId")
  suspend fun deleteMembersForGroup(groupId: Int)

  @Query("DELETE FROM worker_group_members WHERE workerId = :workerId")
  suspend fun deleteMembersForWorker(workerId: Int)

  @Query("DELETE FROM worker_group_members")
  suspend fun deleteAllMembers()
}

@Dao
interface PlantationDao {
  @Query("SELECT * FROM plantations")
  suspend fun getAll(): List<PlantationEntity>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertAll(plantations: List<PlantationEntity>)

  @Query("DELETE FROM plantations")
  suspend fun deleteAll()
}

@Dao
interface WorkLogDao {
  @Query("SELECT * FROM work_logs WHERE harvestYearId = :yearId ORDER BY date DESC, id DESC")
  fun observeForYear(yearId: Int): Flow<List<WorkLogEntity>>

  @Query("SELECT * FROM work_logs WHERE harvestYearId = :yearId ORDER BY date DESC, id DESC")
  suspend fun getForYear(yearId: Int): List<WorkLogEntity>

  @Query("SELECT * FROM work_logs WHERE harvestYearId = :yearId AND date = :date")
  suspend fun getForYearAndDate(yearId: Int, date: Long): List<WorkLogEntity>

  @Query("SELECT * FROM work_logs WHERE workerId = :workerId")
  suspend fun getForWorker(workerId: Int): List<WorkLogEntity>

  @Query("SELECT * FROM work_logs")
  suspend fun getAll(): List<WorkLogEntity>

  @Query("SELECT * FROM work_logs WHERE id = :logId LIMIT 1")
  suspend fun getById(logId: Int): WorkLogEntity?

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsert(log: WorkLogEntity): Long

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertAll(logs: List<WorkLogEntity>)

  @Query("DELETE FROM work_logs WHERE id = :logId")
  suspend fun deleteById(logId: Int)

  @Query("DELETE FROM work_logs WHERE harvestYearId = :yearId")
  suspend fun deleteForYear(yearId: Int)

  @Query("DELETE FROM work_logs WHERE workerId = :workerId")
  suspend fun deleteForWorker(workerId: Int)

  @Query("DELETE FROM work_logs")
  suspend fun deleteAll()
}

@Dao
interface OwnerSettingsDao {
  @Query("SELECT * FROM owner_settings WHERE key = :key LIMIT 1")
  fun observe(key: String = OwnerSettingsEntity.SETTINGS_KEY): Flow<OwnerSettingsEntity?>

  @Query("SELECT * FROM owner_settings WHERE key = :key LIMIT 1")
  suspend fun get(key: String = OwnerSettingsEntity.SETTINGS_KEY): OwnerSettingsEntity?

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsert(settings: OwnerSettingsEntity)
}

@Dao
interface BackupHistoryDao {
  @Query("SELECT * FROM backup_history ORDER BY createdAt DESC, id DESC")
  fun observeAll(): Flow<List<BackupHistoryEntity>>

  @Query("SELECT * FROM backup_history ORDER BY createdAt DESC, id DESC")
  suspend fun getAll(): List<BackupHistoryEntity>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insert(item: BackupHistoryEntity): Long

  @Query("DELETE FROM backup_history WHERE id = :id")
  suspend fun deleteById(id: Int)
}
