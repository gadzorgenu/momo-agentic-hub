package gh.momohub.forwarder.work

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import gh.momohub.forwarder.data.AppDatabase
import gh.momohub.forwarder.data.SettingsStore
import gh.momohub.forwarder.net.IngestClient
import java.util.concurrent.TimeUnit

/**
 * Drains the pending-SMS queue to the backend.
 *
 * Retries at the WorkManager level use exponential backoff; per-row retries
 * are tracked in `attempts` so the UI can surface items that keep failing.
 */
class ForwardWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val settings = SettingsStore(applicationContext).snapshot()
        if (!settings.isConfigured) {
            Log.w(TAG, "Backend URL missing — skipping drain")
            return Result.success()
        }
        if (!settings.forwardingEnabled) return Result.success()

        val dao = AppDatabase.get(applicationContext).pendingSms()
        val client = IngestClient(settings)
        var anyFailed = false

        while (true) {
            val batch = dao.unsent(limit = BATCH_SIZE)
            if (batch.isEmpty()) break
            for (row in batch) {
                val result = client.post(row.body, row.fingerprint)
                if (result.success) {
                    dao.markSent(row.id, System.currentTimeMillis())
                } else {
                    dao.markFailed(row.id, result.error ?: "unknown")
                    Log.w(TAG, "Forward failed (id=${row.id}, code=${result.code}): ${result.error}")
                    anyFailed = true
                }
            }
        }

        // Keep a week of successfully-forwarded rows for diagnostics.
        dao.purgeSentOlderThan(System.currentTimeMillis() - TimeUnit.DAYS.toMillis(7))

        return if (anyFailed) Result.retry() else Result.success()
    }

    companion object {
        private const val TAG = "ForwardWorker"
        private const val BATCH_SIZE = 50
        const val UNIQUE_NAME = "forward_pending_sms"

        private val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        /** Fire a one-off drain, replacing any pending copy. */
        fun enqueueImmediate(context: Context) {
            val request = OneTimeWorkRequestBuilder<ForwardWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_NAME, ExistingWorkPolicy.REPLACE, request)
        }
    }
}
