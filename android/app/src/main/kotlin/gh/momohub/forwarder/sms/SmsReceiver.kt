package gh.momohub.forwarder.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import gh.momohub.forwarder.data.AppDatabase
import gh.momohub.forwarder.data.PendingSms
import gh.momohub.forwarder.data.SettingsStore
import gh.momohub.forwarder.work.ForwardWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Catches every incoming SMS, filters to MoMo senders from settings,
 * enqueues matches to the local DB, then kicks the forwarder worker.
 *
 * Multi-part SMS is reassembled by concatenating `getMessagesFromIntent`
 * entries that share the same originating address, which Telephony delivers
 * in order.
 */
class SmsReceiver : BroadcastReceiver() {

    private val scope = CoroutineScope(Dispatchers.IO)

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (messages.isEmpty()) return

        val sender = messages.first().originatingAddress.orEmpty()
        val body = messages.joinToString(separator = "") { it.messageBody.orEmpty() }
        val receivedAt = messages.first().timestampMillis

        val pending = goAsync()
        scope.launch {
            try {
                val settings = SettingsStore(context).snapshot()
                if (!settings.forwardingEnabled) return@launch
                if (!SenderFilter.matches(sender, settings.senders)) {
                    Log.d(TAG, "Dropping SMS from $sender — not in allowlist")
                    return@launch
                }
                val fingerprint = Fingerprint.of(sender, body, receivedAt)
                val row = PendingSms(
                    sender = sender,
                    body = body,
                    receivedAt = receivedAt,
                    fingerprint = fingerprint,
                )
                AppDatabase.get(context).pendingSms().insert(row)
                ForwardWorker.enqueueImmediate(context)
            } catch (t: Throwable) {
                Log.e(TAG, "Failed to enqueue incoming SMS", t)
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        private const val TAG = "SmsReceiver"
    }
}
