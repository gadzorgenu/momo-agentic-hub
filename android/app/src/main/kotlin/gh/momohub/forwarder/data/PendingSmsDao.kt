package gh.momohub.forwarder.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface PendingSmsDao {

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(sms: PendingSms): Long

    @Query("SELECT * FROM pending_sms WHERE forwardedAt IS NULL ORDER BY receivedAt ASC LIMIT :limit")
    suspend fun unsent(limit: Int = 50): List<PendingSms>

    @Query("UPDATE pending_sms SET forwardedAt = :at, lastError = NULL WHERE id = :id")
    suspend fun markSent(id: Long, at: Long)

    @Query("UPDATE pending_sms SET attempts = attempts + 1, lastError = :error WHERE id = :id")
    suspend fun markFailed(id: Long, error: String)

    @Query("SELECT COUNT(*) FROM pending_sms WHERE forwardedAt IS NULL")
    fun pendingCount(): Flow<Int>

    @Query("SELECT MAX(forwardedAt) FROM pending_sms")
    fun lastSyncedAt(): Flow<Long?>

    @Query("DELETE FROM pending_sms WHERE forwardedAt IS NOT NULL AND forwardedAt < :olderThan")
    suspend fun purgeSentOlderThan(olderThan: Long)
}
