package gh.momohub.forwarder.net

import gh.momohub.forwarder.data.Settings
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Thin wrapper around the backend's POST /api/reconcile/ingest endpoint.
 * The server is responsible for parsing the SMS and deduping — we just
 * ship the raw body up.
 */
class IngestClient(private val settings: Settings) {

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    data class Result(val success: Boolean, val code: Int, val error: String?)

    fun post(rawSms: String, fingerprint: String): Result {
        val base = settings.backendUrl.trimEnd('/')
        if (base.isBlank()) return Result(false, 0, "Backend URL not configured")
        val url = "$base/api/reconcile/ingest"

        val payload = buildString {
            append('{')
            append("\"rawSms\":").append(jsonString(rawSms))
            append('}')
        }

        val builder = Request.Builder()
            .url(url)
            .addHeader("Content-Type", "application/json")
            .addHeader("User-Agent", "MoMoForwarder/0.1")
            .addHeader("X-Idempotency-Key", fingerprint)
            .post(payload.toRequestBody(JSON))

        if (settings.apiKey.isNotBlank()) {
            builder.addHeader("Authorization", "Bearer ${settings.apiKey}")
        }

        return try {
            http.newCall(builder.build()).execute().use { response ->
                if (response.isSuccessful) {
                    Result(true, response.code, null)
                } else {
                    val body = response.body?.string().orEmpty().take(500)
                    Result(false, response.code, "HTTP ${response.code}: $body")
                }
            }
        } catch (io: IOException) {
            Result(false, 0, io.message ?: io.javaClass.simpleName)
        }
    }

    private fun jsonString(input: String): String {
        val sb = StringBuilder(input.length + 16)
        sb.append('"')
        for (c in input) when (c) {
            '"' -> sb.append("\\\"")
            '\\' -> sb.append("\\\\")
            '\n' -> sb.append("\\n")
            '\r' -> sb.append("\\r")
            '\t' -> sb.append("\\t")
            else -> if (c.code < 0x20) sb.append("\\u%04x".format(c.code)) else sb.append(c)
        }
        sb.append('"')
        return sb.toString()
    }

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
