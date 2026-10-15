package gh.momohub.forwarder.data

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("forwarder-settings")

/**
 * App settings persisted to DataStore.
 *
 * `senderAllowlist` is a comma-separated list of MoMo sender IDs that should be forwarded.
 * Ghana defaults cover the three operators; the merchant can edit.
 */
data class Settings(
    val backendUrl: String = "",
    val apiKey: String = "",
    val senderAllowlist: String = DEFAULT_ALLOWLIST,
    val forwardingEnabled: Boolean = true,
) {
    companion object {
        const val DEFAULT_ALLOWLIST = "MobileMoney,MTNMoMo,MTN MOMO,Telecel Cash,Telecel,Vodafone,AT Money,AirtelTigo,ATMoney"
    }

    val senders: List<String>
        get() = senderAllowlist.split(',').map { it.trim() }.filter { it.isNotEmpty() }

    val isConfigured: Boolean
        get() = backendUrl.isNotBlank()
}

class SettingsStore(private val context: Context) {

    private object Keys {
        val BACKEND_URL = stringPreferencesKey("backend_url")
        val API_KEY = stringPreferencesKey("api_key")
        val ALLOWLIST = stringPreferencesKey("sender_allowlist")
        val ENABLED = booleanPreferencesKey("forwarding_enabled")
    }

    val settings: Flow<Settings> = context.dataStore.data.map(::toSettings)

    suspend fun snapshot(): Settings = toSettings(context.dataStore.data.first())

    suspend fun update(block: (Settings) -> Settings) {
        context.dataStore.edit { prefs ->
            val current = toSettings(prefs)
            val next = block(current)
            prefs[Keys.BACKEND_URL] = next.backendUrl
            prefs[Keys.API_KEY] = next.apiKey
            prefs[Keys.ALLOWLIST] = next.senderAllowlist
            prefs[Keys.ENABLED] = next.forwardingEnabled
        }
    }

    private fun toSettings(prefs: Preferences): Settings = Settings(
        backendUrl = prefs[Keys.BACKEND_URL].orEmpty(),
        apiKey = prefs[Keys.API_KEY].orEmpty(),
        senderAllowlist = prefs[Keys.ALLOWLIST] ?: Settings.DEFAULT_ALLOWLIST,
        forwardingEnabled = prefs[Keys.ENABLED] ?: true,
    )
}
