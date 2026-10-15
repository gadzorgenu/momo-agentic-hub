package gh.momohub.forwarder.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * One row per SMS the receiver captured, until the backend accepts it.
 *
 * `fingerprint` dedupes retries from backfill or multi-part SMS reconstruction.
 */
@Entity(
    tableName = "pending_sms",
    indices = [Index(value = ["fingerprint"], unique = true)],
)
data class PendingSms(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sender: String,
    val body: String,
    val receivedAt: Long,
    val fingerprint: String,
    val attempts: Int = 0,
    val lastError: String? = null,
    val forwardedAt: Long? = null,
)
