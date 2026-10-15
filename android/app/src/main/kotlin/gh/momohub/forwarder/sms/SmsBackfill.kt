package gh.momohub.forwarder.sms

import android.content.Context
import android.provider.Telephony
import android.util.Log
import gh.momohub.forwarder.data.AppDatabase
import gh.momohub.forwarder.data.PendingSms
import gh.momohub.forwarder.data.Settings

/**
 * On first permission grant we scan the SMS inbox for recent MoMo messages
 * so the agent gets a quick starting ledger instead of only the next payment.
 */
object SmsBackfill {

    /** How far back to look on first install. */
    private const val LOOKBACK_MS = 7L * 24 * 60 * 60 * 1_000 // 7 days

    suspend fun run(context: Context, settings: Settings): Int {
        val since = System.currentTimeMillis() - LOOKBACK_MS
        val resolver = context.contentResolver
        val projection = arrayOf(
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE,
        )
        val selection = "${Telephony.Sms.DATE} >= ?"
        val args = arrayOf(since.toString())

        var inserted = 0
        resolver.query(
            Telephony.Sms.Inbox.CONTENT_URI,
            projection,
            selection,
            args,
            "${Telephony.Sms.DATE} ASC",
        )?.use { cursor ->
            val addressIx = cursor.getColumnIndex(Telephony.Sms.ADDRESS)
            val bodyIx = cursor.getColumnIndex(Telephony.Sms.BODY)
            val dateIx = cursor.getColumnIndex(Telephony.Sms.DATE)
            if (addressIx < 0 || bodyIx < 0 || dateIx < 0) return 0

            val dao = AppDatabase.get(context).pendingSms()
            while (cursor.moveToNext()) {
                val sender = cursor.getString(addressIx).orEmpty()
                val body = cursor.getString(bodyIx).orEmpty()
                val date = cursor.getLong(dateIx)
                if (!SenderFilter.matches(sender, settings.senders)) continue
                val row = PendingSms(
                    sender = sender,
                    body = body,
                    receivedAt = date,
                    fingerprint = Fingerprint.of(sender, body, date),
                )
                val id = dao.insert(row)
                if (id != -1L) inserted++
            }
        } ?: Log.w(TAG, "SMS inbox query returned null — permissions missing?")

        return inserted
    }

    private const val TAG = "SmsBackfill"
}
