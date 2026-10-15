package gh.momohub.forwarder

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import gh.momohub.forwarder.data.SettingsStore
import gh.momohub.forwarder.sms.SmsBackfill
import gh.momohub.forwarder.ui.MainScreen
import gh.momohub.forwarder.ui.SettingsScreen
import gh.momohub.forwarder.ui.theme.ForwarderTheme
import gh.momohub.forwarder.work.ForwardWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Hosts the two screens (status + settings) and owns the SMS permission dance.
 *
 * The receiver works without any UI being open — this activity exists to
 * configure the app and surface state, not to run anything in the hot path.
 */
class MainActivity : ComponentActivity() {

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        val smsGranted = grants[Manifest.permission.RECEIVE_SMS] == true &&
            grants[Manifest.permission.READ_SMS] == true
        if (!smsGranted) {
            Toast.makeText(this, "SMS permission is required to forward MoMo messages.", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestPermissionsIfNeeded()

        setContent {
            ForwarderTheme {
                var screen by remember { mutableStateOf(Screen.Main) }

                LaunchedEffect(Unit) {
                    // Keep the queue draining even if the user never taps "sync".
                    ForwardWorker.enqueueImmediate(this@MainActivity)
                }

                when (screen) {
                    Screen.Main -> MainScreen(
                        onOpenSettings = { screen = Screen.Settings },
                        onRunBackfill = { runBackfill() },
                        onSyncNow = { ForwardWorker.enqueueImmediate(this@MainActivity) },
                    )
                    Screen.Settings -> SettingsScreen(onBack = { screen = Screen.Main })
                }
            }
        }
    }

    private fun requestPermissionsIfNeeded() {
        val needed = buildList {
            if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED)
                add(Manifest.permission.RECEIVE_SMS)
            if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED)
                add(Manifest.permission.READ_SMS)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        if (needed.isNotEmpty()) permissionLauncher.launch(needed.toTypedArray())
    }

    private fun runBackfill() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "Grant SMS permission first.", Toast.LENGTH_LONG).show()
            requestPermissionsIfNeeded()
            return
        }
        lifecycleScope.launch {
            val settings = SettingsStore(applicationContext).snapshot()
            val count = withContext(Dispatchers.IO) { SmsBackfill.run(applicationContext, settings) }
            Toast.makeText(this@MainActivity, "Queued $count message(s) from inbox.", Toast.LENGTH_SHORT).show()
            ForwardWorker.enqueueImmediate(this@MainActivity)
        }
    }

    private enum class Screen { Main, Settings }
}
