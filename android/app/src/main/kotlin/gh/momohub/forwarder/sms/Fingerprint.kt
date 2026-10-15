package gh.momohub.forwarder.sms

import java.security.MessageDigest

/**
 * Stable key for an SMS so retries and backfill don't double-send.
 * The timestamp is bucketed to the second — the inbox copy and the receiver
 * copy of the same message land within milliseconds but may differ.
 */
object Fingerprint {
    fun of(sender: String, body: String, receivedAt: Long): String {
        val bucket = receivedAt / 1_000
        val payload = "$sender|$bucket|${body.trim()}"
        val digest = MessageDigest.getInstance("SHA-256").digest(payload.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }
}
