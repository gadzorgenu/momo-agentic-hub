package gh.momohub.forwarder.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import gh.momohub.forwarder.data.Settings
import gh.momohub.forwarder.data.SettingsStore
import gh.momohub.forwarder.net.IngestClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val store = remember { SettingsStore(context) }
    val scope = rememberCoroutineScope()

    val settings by store.settings.collectAsState(initial = null)

    var url by remember { mutableStateOf("") }
    var apiKey by remember { mutableStateOf("") }
    var allowlist by remember { mutableStateOf(Settings.DEFAULT_ALLOWLIST) }
    var enabled by remember { mutableStateOf(true) }
    var testResult by remember { mutableStateOf<String?>(null) }
    var testing by remember { mutableStateOf(false) }

    LaunchedEffect(settings) {
        settings?.let {
            url = it.backendUrl
            apiKey = it.apiKey
            allowlist = it.senderAllowlist
            enabled = it.forwardingEnabled
        }
    }

    val save: () -> Unit = {
        scope.launch {
            store.update { it.copy(backendUrl = url.trim(), apiKey = apiKey.trim(), senderAllowlist = allowlist, forwardingEnabled = enabled) }
            onBack()
        }
    }

    val test: () -> Unit = {
        testing = true
        testResult = null
        scope.launch {
            val probe = Settings(backendUrl = url.trim(), apiKey = apiKey.trim())
            val result = withContext(Dispatchers.IO) {
                IngestClient(probe).post(rawSms = "TEST ping from forwarder", fingerprint = "forwarder-test")
            }
            testResult = if (result.success) "Connected (${result.code})" else "Failed: ${result.error}"
            testing = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Backend", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(
                value = url,
                onValueChange = { url = it },
                label = { Text("Backend URL") },
                placeholder = { Text("https://hub.example.com") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = apiKey,
                onValueChange = { apiKey = it },
                label = { Text("API key (optional)") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
            )

            FilledTonalButton(onClick = test, enabled = !testing && url.isNotBlank()) {
                Text(if (testing) "Testing…" else "Test connection")
            }
            testResult?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            Spacer(Modifier.height(8.dp))
            Text("Capture", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(
                value = allowlist,
                onValueChange = { allowlist = it },
                label = { Text("Sender allowlist (comma-separated)") },
                supportingText = { Text("Match is case-insensitive and ignores spaces/punctuation. Keep MTN, Telecel, AT entries here.") },
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions.Default.copy(keyboardType = KeyboardType.Text),
                modifier = Modifier.fillMaxWidth(),
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Switch(checked = enabled, onCheckedChange = { enabled = it })
                Text("Forwarding enabled")
            }

            Spacer(Modifier.height(8.dp))
            FilledTonalButton(onClick = save, modifier = Modifier.fillMaxWidth(), enabled = url.isNotBlank()) {
                Text("Save")
            }
        }
    }
}
